"""Configuração e histórico, em %LOCALAPPDATA%\\Faxina."""

import copy
import json
import os
import time
from pathlib import Path

PASTA = Path(os.environ.get("LOCALAPPDATA", ".")) / "Faxina"
CONFIG = PASTA / "config.json"
HISTORICO = PASTA / "historico.json"

PADRAO = {
    "agenda": {
        "ativo": False,
        "frequencia": "mensal",   # 'semanal' | 'mensal'
        "dia_mes": 1,             # 1–28
        "dia_semana": 0,          # 0 = segunda
        "hora": "10:00",
        "modo": "avisar",         # 'avisar' | 'limpar'
        "limite_gb": 1.0,         # não avisa por menos que isso
    },
    # Categorias 'seguro' que entram na limpeza agendada. None = todas.
    "categorias_auto": None,
}


def _ler(caminho, padrao):
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return copy.deepcopy(padrao)


def _gravar(caminho, dados):
    PASTA.mkdir(parents=True, exist_ok=True)
    temporario = caminho.with_suffix(".tmp")
    temporario.write_text(json.dumps(dados, ensure_ascii=False, indent=2),
                          encoding="utf-8")
    os.replace(temporario, caminho)  # nunca deixa o arquivo pela metade


def config():
    dados = _ler(CONFIG, PADRAO)
    completo = copy.deepcopy(PADRAO)
    completo.update({k: v for k, v in dados.items() if k != "agenda"})
    completo["agenda"].update(dados.get("agenda", {}))
    return completo


def salvar_config(dados):
    _gravar(CONFIG, dados)


def historico():
    return _ler(HISTORICO, [])


def registrar_limpeza(resultados, modo, nomes):
    """Guarda uma limpeza: quando, quanto e de onde."""
    lista = historico()
    lista.append({
        "quando": time.time(),
        "modo": modo,  # 'manual' | 'agendado'
        "liberado": sum(r.liberado for r in resultados.values()),
        "categorias": [
            {"id": cid, "nome": nomes.get(cid, cid), "liberado": r.liberado}
            for cid, r in resultados.items() if r.liberado
        ],
    })
    _gravar(HISTORICO, lista[-500:])
