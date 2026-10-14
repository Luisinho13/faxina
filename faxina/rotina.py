"""O que roda quando o Agendador de Tarefas chama a Faxina (--agendado)."""

from . import aviso, dados, motor
from .api import icone_png
from .categorias import CATEGORIAS

MINIMO_PARA_AVISAR_DA_LIMPEZA = 50 * 2**20


def _seguras(config):
    ids = [c.id for c in CATEGORIAS
           if c.nivel == "seguro" and not (c.admin and not motor.e_admin())]
    if config["categorias_auto"] is not None:
        ids = [i for i in ids if i in config["categorias_auto"]]
    return ids


def executar():
    config = dados.config()
    ag = config["agenda"]
    seguras = _seguras(config)
    revisar = [c.id for c in CATEGORIAS if c.nivel == "revisar"]
    icone = icone_png()

    if ag["modo"] == "limpar":
        analises = motor.analisar(seguras)
        resultados = motor.limpar(analises, {i: None for i in seguras})
        liberado = sum(r.liberado for r in resultados.values())
        if liberado:
            dados.registrar_limpeza(resultados, "agendado",
                                    {c.id: c.nome for c in CATEGORIAS})
        pendente = sum(a.tamanho for a in motor.analisar(revisar).values())
        if liberado >= MINIMO_PARA_AVISAR_DA_LIMPEZA:
            extra = (f" Ainda dá para revisar {aviso.gb(pendente)} em instaladores,"
                     " lixeira e músicas offline." if pendente >= 2**30 else "")
            aviso.mostrar(f"A Faxina liberou {aviso.gb(liberado)}",
                          "Caches e temporários já foram embora." + extra,
                          botao="Ver detalhes", icone=icone)
        return liberado

    analises = motor.analisar(seguras + revisar)
    total = sum(a.tamanho for a in analises.values())
    seguro = sum(analises[i].tamanho for i in seguras)
    if total >= ag["limite_gb"] * 2**30:
        aviso.mostrar(f"Dá para liberar {aviso.gb(total)} no seu PC",
                      f"{aviso.gb(seguro)} são cache e saem sem susto. "
                      "Clique para revisar.",
                      botao="Abrir a Faxina", icone=icone)
    return 0
