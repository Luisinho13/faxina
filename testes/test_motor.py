"""Testes do motor numa pasta de rascunho. Nada fora dela é tocado."""

import os
import subprocess
import time
from pathlib import Path

import pytest

from faxina import motor, pastas
from faxina.categorias import Alvo, Categoria

ANTIGO = time.time() - 10 * 24 * 3600


def _arquivo(caminho, tamanho, antigo=True):
    caminho = Path(caminho)
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(b"x" * tamanho)
    if antigo:
        os.utime(caminho, (ANTIGO, ANTIGO))
    return caminho


def _envelhecer(pasta):
    for raiz, dirs, arquivos in os.walk(pasta):
        for nome in dirs + arquivos:
            os.utime(os.path.join(raiz, nome), (ANTIGO, ANTIGO))
    os.utime(pasta, (ANTIGO, ANTIGO))


def _juncao(link, alvo):
    subprocess.run(["cmd", "/c", "mklink", "/J", str(link), str(alvo)],
                   check=True, capture_output=True)


def _categoria(raiz, filtro=None, **extra):
    return Categoria(id="teste", nome="Teste", descricao="", grupo="",
                     icone="", alvos=lambda: [Alvo(raiz, filtro)], **extra)


@pytest.fixture
def caixa(tmp_path, monkeypatch):
    """Raiz de limpeza e uma pasta 'preciosa' fora dela."""
    raiz = tmp_path / "cache"
    precioso = tmp_path / "precioso"
    raiz.mkdir()
    _arquivo(precioso / "foto.jpg", 500)
    monkeypatch.setitem(motor.POR_ID, "teste", None)
    return raiz, precioso


def _rodar(categoria, chaves=None):
    motor.POR_ID["teste"] = categoria
    analise = motor.analisar_categoria(categoria)
    resultados = motor.limpar({"teste": analise}, {"teste": chaves})
    return analise, resultados["teste"]


def test_mede_e_apaga_o_conteudo_e_mantem_a_raiz(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "a.bin", 1000)
    _arquivo(raiz / "sub" / "b.bin", 2000)
    _arquivo(raiz / "sub" / "fundo" / "c.bin", 3000)
    _envelhecer(raiz)

    analise, resultado = _rodar(_categoria(raiz))

    assert analise.tamanho == 6000 and analise.arquivos == 3
    assert resultado.liberado == 6000 and resultado.apagados == 3
    assert raiz.is_dir() and list(raiz.iterdir()) == []


def test_juncao_para_fora_some_sem_levar_o_destino(caixa):
    raiz, precioso = caixa
    _arquivo(raiz / "lixo.tmp", 100)
    _juncao(raiz / "atalho", precioso)
    _envelhecer(raiz)

    analise, resultado = _rodar(_categoria(raiz))

    assert analise.tamanho == 100  # não mediu o que está do outro lado
    assert (precioso / "foto.jpg").read_bytes() == b"x" * 500
    assert not (raiz / "atalho").exists()


def test_juncao_dentro_de_subpasta_tambem_nao_e_seguida(caixa):
    raiz, precioso = caixa
    _arquivo(raiz / "sub" / "lixo.tmp", 100)
    _juncao(raiz / "sub" / "atalho", precioso)
    _envelhecer(raiz)

    _rodar(_categoria(raiz))

    assert (precioso / "foto.jpg").exists()
    assert not (raiz / "sub").exists()


def test_item_recente_fica(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "velho.tmp", 100)
    _arquivo(raiz / "novo.tmp", 100, antigo=False)

    analise, _ = _rodar(_categoria(raiz, idade_minima_h=24))

    assert analise.pulados_recentes == 1
    assert (raiz / "novo.tmp").exists() and not (raiz / "velho.tmp").exists()


def test_pasta_velha_com_arquivo_novo_dentro_fica(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "programa" / "velho.dat", 100)
    _envelhecer(raiz)
    _arquivo(raiz / "programa" / "em_uso.log", 10, antigo=False)

    analise, _ = _rodar(_categoria(raiz, idade_minima_h=24))

    assert analise.itens == [] and (raiz / "programa" / "velho.dat").exists()


def test_arquivo_em_uso_e_pulado_e_o_resto_sai(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "livre.tmp", 100)
    preso = _arquivo(raiz / "preso.tmp", 100)
    _envelhecer(raiz)

    with open(preso, "rb"):  # o Windows não deixa apagar arquivo aberto
        _, resultado = _rodar(_categoria(raiz))

    assert resultado.pulados == 1 and resultado.liberado == 100
    assert preso.exists() and not (raiz / "livre.tmp").exists()


def test_caminho_longo(caixa):
    raiz, _ = caixa
    fundo = raiz / ("pasta_com_nome_comprido_" * 3)
    for _ in range(6):
        fundo = fundo / ("subpasta_com_nome_comprido_" * 2)
    alvo = "\\\\?\\" + str(fundo / "arquivo.bin")
    os.makedirs(os.path.dirname(alvo))
    with open(alvo, "wb") as f:
        f.write(b"x" * 50)
    assert len(alvo) > 300
    _envelhecer("\\\\?\\" + str(raiz))

    analise, resultado = _rodar(_categoria(raiz))

    assert analise.tamanho == 50 and resultado.liberado == 50
    assert list(raiz.iterdir()) == []


def test_filtro_e_lixeira(caixa, monkeypatch):
    raiz, _ = caixa
    _arquivo(raiz / "setup.exe", 300)
    _arquivo(raiz / "planilha.xlsx", 300)
    _envelhecer(raiz)
    enviados = []
    monkeypatch.setattr(motor, "send2trash", lambda p: (enviados.append(p), os.remove(p)))

    categoria = _categoria(
        raiz, destino="lixeira",
        filtro=lambda e: e.name.endswith(".exe"))
    _, resultado = _rodar(categoria)

    assert [Path(p).name for p in enviados] == ["setup.exe"]
    assert (raiz / "planilha.xlsx").exists() and resultado.liberado == 300


def test_so_as_chaves_escolhidas(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "grande.bin", 900)
    _arquivo(raiz / "pequeno.bin", 100)
    _envelhecer(raiz)
    categoria = _categoria(raiz)
    motor.POR_ID["teste"] = categoria
    analise = motor.analisar_categoria(categoria)
    grande = next(i for i in analise.itens if i.caminho.endswith("grande.bin"))

    motor.limpar({"teste": analise}, {"teste": {grande.chave, "teste:999", "x"}})

    assert not (raiz / "grande.bin").exists() and (raiz / "pequeno.bin").exists()


def test_categoria_fora_da_analise_e_ignorada(caixa):
    raiz, _ = caixa
    _arquivo(raiz / "a.bin", 100)
    resultados = motor.limpar({}, {"teste": None, "chrome": None})
    assert resultados == {} and (raiz / "a.bin").exists()


# ---------------------------------------------------------------- barreira final

def test_recusa_fora_da_raiz(tmp_path):
    assert motor.motivo_para_recusar(tmp_path / "b" / "x", tmp_path / "a")
    assert motor.motivo_para_recusar(tmp_path / "a", tmp_path / "a")
    assert motor.motivo_para_recusar(tmp_path / "ab", tmp_path / "a")  # prefixo não basta


def test_recusa_pasta_protegida_e_quem_a_contem():
    perfil = pastas.PERFIL
    documentos = pastas.pasta_conhecida(pastas.FOLDERID_DOCUMENTS)
    assert "protegida" in motor.motivo_para_recusar(documentos, documentos.parent)
    assert "protegida" in motor.motivo_para_recusar(perfil / "AppData", perfil)
    assert "protegida" in motor.motivo_para_recusar(pastas.LOCAL / "Temp", pastas.LOCAL)


def test_dentro_do_windows_so_temp_e_update():
    w = pastas.WINDOWS
    assert motor.motivo_para_recusar(w / "System32" / "x.dll", w) == "dentro do Windows"
    assert motor.motivo_para_recusar(w / "Temp" / "lixo", w / "Temp") is None
    assert motor.motivo_para_recusar(
        w / "SoftwareDistribution" / "Download" / "abc",
        w / "SoftwareDistribution" / "Download") is None


def test_nome_curto_do_dos_e_reconhecido():
    temp_curto = os.environ["TEMP"]
    assert motor.motivo_para_recusar(Path(temp_curto) / "lixo", pastas.TEMP) is None
    assert motor.motivo_para_recusar(pastas.real(temp_curto), pastas.LOCAL)


def test_nenhuma_categoria_aponta_para_pasta_protegida():
    from faxina.categorias import CATEGORIAS
    protegidas = {motor._norm(p) for p in pastas.protegidas()}
    for c in CATEGORIAS:
        for alvo in c.alvos():
            raiz = motor._norm(pastas.real(alvo.raiz))
            if c.id in ("temp_usuario", "instaladores"):
                continue  # apagam dentro de pasta protegida, com regra própria
            assert raiz not in protegidas, (c.id, raiz)
