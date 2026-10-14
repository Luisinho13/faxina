"""O que a tela pode pedir ao Python (pywebview js_api).

A tela nunca manda um caminho para apagar: manda chaves da última análise,
e só elas valem.
"""

import ctypes
import json
import os
import subprocess
import sys
import threading
from dataclasses import asdict
from pathlib import Path

from . import agenda, aviso, dados, motor
from .categorias import CATEGORIAS, POR_ID

ITENS_NA_TELA = 8


def _local(item):
    """Onde o item está, de um jeito que dá para ler (sem C:\\Users\\fulano\\AppData)."""
    caminho = item.caminho
    for base, nome in ((os.environ.get("LOCALAPPDATA"), "AppData\\Local"),
                       (os.environ.get("APPDATA"), "AppData\\Roaming"),
                       (os.environ.get("USERPROFILE"), "~")):
        if base:
            real = os.path.realpath(base)
            if caminho.lower().startswith(real.lower() + "\\"):
                return nome + caminho[len(real):]
    return caminho


class Api:
    def __init__(self):
        self._janela = None
        self._analises = {}
        self._trava = threading.Lock()

    # ------------------------------------------------------------ apoio
    def _progresso(self, fase):
        def avisar(feito, total, categoria):
            if self._janela is None:
                return
            dados_js = {"feito": feito, "total": total, "fase": fase,
                        "nome": categoria.nome if categoria else ""}
            try:
                self._janela.evaluate_js(f"Faxina.progresso({json.dumps(dados_js)})")
            except Exception:
                pass
        return avisar

    @staticmethod
    def _agenda():
        ag = dados.config()["agenda"]
        return {**ag, "existe": agenda.existe(),
                "proxima": agenda.proxima_execucao(ag).isoformat()}

    @staticmethod
    def _ultima():
        lista = dados.historico()
        return lista[-1] if lista else None

    # ------------------------------------------------------------ tela
    def estado(self):
        return {
            "discos": motor.discos(),
            "admin": motor.e_admin(),
            "categorias": [{
                "id": c.id, "nome": c.nome, "descricao": c.descricao,
                "grupo": c.grupo, "icone": c.icone, "nivel": c.nivel,
                "destino": c.destino, "admin": c.admin, "aviso": c.aviso,
                "selecao_por_item": c.selecao_por_item,
            } for c in CATEGORIAS],
            "agenda": self._agenda(),
            "ultima": self._ultima(),
        }

    def analisar(self):
        with self._trava:
            self._analises = motor.analisar(progresso=self._progresso("analisar"))
            saida = {}
            for cid, a in self._analises.items():
                categoria = POR_ID[cid]
                mostrar = a.itens if categoria.selecao_por_item else a.itens[:ITENS_NA_TELA]
                saida[cid] = {
                    "tamanho": a.tamanho, "arquivos": a.arquivos,
                    "sem_permissao": a.sem_permissao,
                    "pulados_recentes": a.pulados_recentes,
                    "total_itens": len(a.itens),
                    "itens": [{
                        "chave": i.chave, "nome": Path(i.caminho).name,
                        "local": _local(i), "tamanho": i.tamanho,
                        "arquivos": i.arquivos, "e_pasta": i.e_pasta,
                        "modificado": i.modificado,
                    } for i in mostrar],
                }
            return {"categorias": saida}

    def limpar(self, escolha):
        with self._trava:
            pedido = {}
            for cid, chaves in (escolha or {}).items():
                if cid in self._analises:
                    pedido[cid] = None if chaves is None else set(chaves)
            resultados = motor.limpar(self._analises, pedido,
                                      progresso=self._progresso("limpar"))
            if any(r.liberado for r in resultados.values()):
                dados.registrar_limpeza(resultados, "manual",
                                        {c.id: c.nome for c in CATEGORIAS})
            self._analises = {}  # a análise envelheceu: para limpar de novo, analisar de novo
            return {
                "resultados": {cid: asdict(r) for cid, r in resultados.items()},
                "liberado": sum(r.liberado for r in resultados.values()),
                "discos": motor.discos(),
                "ultima": self._ultima(),
            }

    def abrir_local(self, chave):
        cid = str(chave).split(":")[0]
        analise = self._analises.get(cid)
        item = next((i for i in analise.itens if i.chave == chave), None) if analise else None
        if item:
            subprocess.Popen(["explorer", "/select,", item.caminho])

    def historico(self):
        return dados.historico()

    def salvar_agenda(self, nova):
        config = dados.config()
        ag = config["agenda"]
        ag.update({
            "ativo": bool(nova.get("ativo")),
            "frequencia": "semanal" if nova.get("frequencia") == "semanal" else "mensal",
            "dia_mes": min(28, max(1, int(nova.get("dia_mes", 1)))),
            "dia_semana": min(6, max(0, int(nova.get("dia_semana", 0)))),
            "hora": _hora(nova.get("hora", "10:00")),
            "modo": "limpar" if nova.get("modo") == "limpar" else "avisar",
            "limite_gb": min(100.0, max(0.1, float(nova.get("limite_gb", 1)))),
        })
        if ag["ativo"]:
            ok, erro = agenda.ativar(ag)
            if not ok:
                return {"ok": False, "erro": erro}
        else:
            agenda.desativar()
        dados.salvar_config(config)
        return {"ok": True, "agenda": self._agenda()}

    def testar_aviso(self):
        aviso.mostrar("Dá para liberar 12 GB no seu PC",
                      "É assim que a Faxina avisa. Clique para abrir e revisar.",
                      icone=icone_png())
        return True

    def reiniciar_como_admin(self):
        programa, argumentos = agenda.comando("--abrir", "--elevado")
        if ctypes.windll.shell32.ShellExecuteW(None, "runas", programa,
                                               argumentos, None, 1) > 32:
            os._exit(0)  # a cópia com administrador assume


def _hora(texto):
    try:
        h, m = (int(x) for x in str(texto).split(":")[:2])
        if 0 <= h < 24 and 0 <= m < 60:
            return f"{h:02d}:{m:02d}"
    except ValueError:
        pass
    return "10:00"


def recursos():
    """Pasta dos arquivos do app (ui/, ícone), empacotado ou não."""
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def icone_png():
    caminho = recursos() / "recursos" / "faxina.png"
    return caminho if caminho.exists() else ""
