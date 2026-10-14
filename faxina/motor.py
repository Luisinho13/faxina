"""Varredura e limpeza.

Regras que não se negociam (testadas em testes/test_motor.py):

1. Só se apaga o que a varredura encontrou. A limpeza recebe chaves da
   varredura, nunca um caminho vindo de fora.
2. Antes de apagar, cada item é conferido de novo: tem que estar dentro da
   raiz da sua categoria, não pode ser uma pasta protegida nem conter uma,
   e dentro do Windows só valem as pastas liberadas.
3. Atalho de pasta (junção, link simbólico) é removido como atalho: o motor
   nunca entra nele. Sem isso, uma junção dentro do Temp apontando para
   Documentos levaria Documentos junto.
4. Arquivo em uso, ou sem permissão, é pulado e contado. Nada é forçado.
"""

import ctypes
import os
import stat
import time
from ctypes import wintypes
from dataclasses import dataclass, field
from pathlib import Path

from send2trash import send2trash

from . import pastas
from .categorias import CATEGORIAS, POR_ID

REPARSE = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


# ---------------------------------------------------------------- tipos

@dataclass
class Item:
    chave: str
    caminho: str
    raiz: str
    tamanho: int
    arquivos: int
    e_pasta: bool
    modificado: float


@dataclass
class Analise:
    categoria: str
    tamanho: int = 0
    arquivos: int = 0
    itens: list = field(default_factory=list)
    pulados_recentes: int = 0
    sem_permissao: bool = False


@dataclass
class Resultado:
    categoria: str
    liberado: int = 0
    apagados: int = 0
    pulados: int = 0
    recusados: int = 0
    erro: str = ""


# ---------------------------------------------------------------- utilidades

def e_admin():
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except OSError:
        return False


def _longo(caminho):
    """Prefixo \\\\?\\ para passar dos 260 caracteres (modpacks, node_modules)."""
    caminho = str(caminho)
    if caminho.startswith("\\\\?\\"):
        return caminho
    if caminho.startswith("\\\\"):
        return "\\\\?\\UNC\\" + caminho[2:]
    return "\\\\?\\" + caminho


def _curto(caminho):
    caminho = str(caminho)
    if caminho.startswith("\\\\?\\UNC\\"):
        return "\\\\" + caminho[8:]
    if caminho.startswith("\\\\?\\"):
        return caminho[4:]
    return caminho


def _norm(caminho):
    return os.path.normcase(os.path.normpath(_curto(caminho)))


def _dentro(filho, pai):
    """filho está estritamente dentro de pai."""
    f, p = _norm(filho), _norm(pai)
    return f != p and f.startswith(p.rstrip("\\") + "\\")


def _e_atalho(entrada):
    """Junção, link simbólico ou qualquer ponto de nova análise de pasta."""
    try:
        if entrada.is_symlink() or entrada.is_junction():
            return True
        atributos = entrada.stat(follow_symlinks=False).st_file_attributes
        return bool(atributos & REPARSE) and entrada.is_dir(follow_symlinks=False)
    except OSError:
        return True


def motivo_para_recusar(caminho, raiz):
    """None se pode apagar; senão, o motivo. Última barreira antes de apagar."""
    # Nome longo nos dois lados (o %TEMP% vem como ITXGAM~1). Resolve só a
    # pasta de cima do item: resolver o item seguiria a junção até o destino.
    caminho = Path(_curto(caminho))
    caminho = str(pastas.real(caminho.parent) / caminho.name)
    raiz = str(pastas.real(_curto(raiz)))
    if not _dentro(caminho, raiz):
        return "fora da pasta da categoria"
    for protegida in pastas.protegidas():
        if _norm(caminho) == _norm(protegida):
            return f"pasta protegida ({protegida})"
        if _dentro(protegida, caminho):
            return f"contém pasta protegida ({protegida})"
    if _dentro(caminho, pastas.WINDOWS) and not any(
            _dentro(caminho, p) for p in pastas.DENTRO_DO_WINDOWS_PERMITIDO):
        return "dentro do Windows"
    return None


# ---------------------------------------------------------------- varredura

def _medir(caminho):
    """(bytes, arquivos, modificação mais recente). Não entra em atalhos."""
    total, arquivos, recente = 0, 0, 0.0
    pilha = [_longo(caminho)]
    while pilha:
        atual = pilha.pop()
        try:
            with os.scandir(atual) as it:
                for e in it:
                    try:
                        if _e_atalho(e):
                            continue
                        info = e.stat(follow_symlinks=False)
                        recente = max(recente, info.st_mtime)
                        if e.is_dir(follow_symlinks=False):
                            pilha.append(e.path)
                        else:
                            total += info.st_size
                            arquivos += 1
                    except OSError:
                        continue
        except OSError:
            continue
    return total, arquivos, recente


def analisar_categoria(categoria, agora=None):
    agora = agora or time.time()
    limite = agora - categoria.idade_minima_h * 3600
    analise = Analise(categoria.id)

    if categoria.destino == "esvaziar_lixeira":
        analise.tamanho, analise.arquivos = tamanho_da_lixeira()
        return analise

    vistos = set()
    for alvo in categoria.alvos():
        raiz = pastas.real(alvo.raiz)
        if _norm(raiz) in vistos or not raiz.is_dir():
            continue
        vistos.add(_norm(raiz))
        try:
            entradas = list(os.scandir(_longo(raiz)))
        except PermissionError:
            analise.sem_permissao = True
            continue
        except OSError:
            continue
        for e in entradas:
            try:
                if alvo.filtro and not alvo.filtro(e):
                    continue
                caminho = str(raiz / e.name)
                if _e_atalho(e):
                    tamanho, arquivos, recente = 0, 0, e.stat(follow_symlinks=False).st_mtime
                    e_pasta = True
                elif e.is_dir(follow_symlinks=False):
                    tamanho, arquivos, recente = _medir(caminho)
                    recente = max(recente, e.stat(follow_symlinks=False).st_mtime)
                    e_pasta = True
                else:
                    info = e.stat(follow_symlinks=False)
                    tamanho, arquivos, recente = info.st_size, 1, info.st_mtime
                    e_pasta = False
            except OSError:
                continue
            if categoria.idade_minima_h and recente > limite:
                analise.pulados_recentes += 1
                continue
            analise.itens.append(Item(
                chave=f"{categoria.id}:{len(analise.itens)}", caminho=caminho,
                raiz=str(raiz), tamanho=tamanho, arquivos=arquivos,
                e_pasta=e_pasta, modificado=recente))
            analise.tamanho += tamanho
            analise.arquivos += arquivos
    analise.itens.sort(key=lambda i: i.tamanho, reverse=True)
    return analise


def analisar(ids=None, progresso=None):
    """Analisa as categorias (todas, ou as de `ids`). Só lê."""
    categorias = [c for c in CATEGORIAS if ids is None or c.id in ids]
    analises = {}
    for n, categoria in enumerate(categorias):
        if progresso:
            progresso(n, len(categorias), categoria)
        analises[categoria.id] = analisar_categoria(categoria)
    if progresso:
        progresso(len(categorias), len(categorias), None)
    return analises


# ---------------------------------------------------------------- limpeza

def _apagar_arquivo(caminho, resultado, tamanho):
    try:
        os.remove(caminho)
    except PermissionError:
        try:  # somente leitura
            os.chmod(caminho, stat.S_IWRITE)
            os.remove(caminho)
        except OSError:
            resultado.pulados += 1
            return
    except FileNotFoundError:
        return
    except OSError:
        resultado.pulados += 1
        return
    resultado.liberado += tamanho
    resultado.apagados += 1


def _remover_atalho(caminho, resultado):
    try:
        try:
            os.rmdir(caminho)  # junção ou link de pasta: some só o atalho
        except NotADirectoryError:
            os.remove(caminho)
    except OSError:
        resultado.pulados += 1


def _apagar_arvore(caminho, resultado):
    pilha, pastas_vistas = [caminho], []
    while pilha:
        atual = pilha.pop()
        pastas_vistas.append(atual)
        try:
            with os.scandir(atual) as it:
                entradas = list(it)
        except OSError:
            resultado.pulados += 1
            continue
        for e in entradas:
            try:
                if _e_atalho(e):
                    _remover_atalho(e.path, resultado)
                elif e.is_dir(follow_symlinks=False):
                    pilha.append(e.path)
                else:
                    tamanho = e.stat(follow_symlinks=False).st_size
                    _apagar_arquivo(e.path, resultado, tamanho)
            except OSError:
                resultado.pulados += 1
    for pasta in reversed(pastas_vistas):  # das mais fundas para cima
        try:
            os.rmdir(pasta)
        except OSError:
            pass  # sobrou algo em uso


def limpar_item(categoria, item, resultado):
    motivo = motivo_para_recusar(item.caminho, item.raiz)
    if motivo:
        resultado.recusados += 1
        return motivo
    longo = _longo(item.caminho)
    if not os.path.lexists(longo):
        return None
    if categoria.destino == "lixeira":
        try:
            send2trash(item.caminho)
            resultado.liberado += item.tamanho
            resultado.apagados += item.arquivos
        except OSError:
            resultado.pulados += 1
        return None
    try:
        info = os.lstat(longo)
    except OSError:
        return None
    e_pasta = stat.S_ISDIR(info.st_mode)
    if (stat.S_ISLNK(info.st_mode) or os.path.isjunction(longo)
            or (e_pasta and info.st_file_attributes & REPARSE)):
        _remover_atalho(longo, resultado)
    elif e_pasta:
        _apagar_arvore(longo, resultado)
    else:
        _apagar_arquivo(longo, resultado, info.st_size)
    return None


def limpar(analises, escolha, progresso=None):
    """Limpa o que foi escolhido.

    `escolha`: {id_da_categoria: None (tudo) ou conjunto de chaves de item}.
    Só aceita chaves que estão em `analises` (a varredura feita antes).
    """
    resultados = {}
    pedidos = [(cid, sel) for cid, sel in escolha.items() if cid in analises]
    total_itens = sum(
        1 if POR_ID[cid].destino == "esvaziar_lixeira"
        else len([i for i in analises[cid].itens if sel is None or i.chave in sel])
        for cid, sel in pedidos) or 1
    feitos = 0
    for cid, sel in pedidos:
        categoria = POR_ID[cid]
        resultado = Resultado(cid)
        resultados[cid] = resultado
        if categoria.admin and not e_admin():
            resultado.erro = "precisa de administrador"
            continue
        if categoria.destino == "esvaziar_lixeira":
            antes, _ = tamanho_da_lixeira()
            if esvaziar_lixeira():
                resultado.liberado = antes
            else:
                resultado.erro = "o Windows não esvaziou a lixeira"
            feitos += 1
            if progresso:
                progresso(feitos, total_itens, categoria)
            continue
        for item in analises[cid].itens:
            if sel is not None and item.chave not in sel:
                continue
            limpar_item(categoria, item, resultado)
            feitos += 1
            if progresso:
                progresso(feitos, total_itens, categoria)
    return resultados


# ---------------------------------------------------------------- lixeira

class _SHQUERYRBINFO(ctypes.Structure):
    _fields_ = [("cbSize", wintypes.DWORD),
                ("i64Size", ctypes.c_longlong),
                ("i64NumItems", ctypes.c_longlong)]


def tamanho_da_lixeira():
    info = _SHQUERYRBINFO()
    info.cbSize = ctypes.sizeof(info)
    if ctypes.windll.shell32.SHQueryRecycleBinW(None, ctypes.byref(info)) != 0:
        return 0, 0
    return int(info.i64Size), int(info.i64NumItems)


def esvaziar_lixeira():
    SEM_CONFIRMAR, SEM_PROGRESSO, SEM_SOM = 0x1, 0x2, 0x4
    retorno = ctypes.windll.shell32.SHEmptyRecycleBinW(
        None, None, SEM_CONFIRMAR | SEM_PROGRESSO | SEM_SOM)
    # S_OK, ou E_UNEXPECTED quando já estava vazia
    return retorno in (0, -2147418113)


# ---------------------------------------------------------------- discos

def discos():
    lista = []
    for letra in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        raiz = f"{letra}:\\"
        if ctypes.windll.kernel32.GetDriveTypeW(raiz) != 3:  # só disco fixo
            continue
        livre, total = ctypes.c_ulonglong(), ctypes.c_ulonglong()
        if ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                raiz, None, ctypes.byref(total), ctypes.byref(livre)):
            lista.append({"letra": letra, "total": total.value,
                          "livre": livre.value,
                          "sistema": _norm(raiz) == _norm(pastas.WINDOWS.anchor)})
    return lista
