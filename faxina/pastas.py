"""Onde ficam as pastas do Windows, com o nome longo e verdadeiro.

O %TEMP% costuma vir no formato curto do DOS (C:\\Users\\ITXGAM~1\\...), e a
comparação com as pastas protegidas falharia. Tudo passa por `real()`, que
devolve o caminho final, com nome longo.
"""

import ctypes
import functools
import os
import uuid
from ctypes import wintypes
from pathlib import Path

FOLDERID_DOWNLOADS = "{374DE290-123F-4565-9164-39C4925E467B}"
FOLDERID_DOCUMENTS = "{FDD39AD0-238F-46AF-ADB4-6C85480369C7}"
FOLDERID_DESKTOP = "{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}"
FOLDERID_PICTURES = "{33E28130-4E1E-4676-835A-98395C3BC3BB}"
FOLDERID_VIDEOS = "{18989B1D-99B5-455B-841C-AB7C74E4DDFC}"
FOLDERID_MUSIC = "{4BD8D571-6D19-48D3-BE97-422220080E43}"
FOLDERID_LOCALAPPDATALOW = "{A520A1A4-1780-4FF6-BD18-167343C5AF16}"


class _GUID(ctypes.Structure):
    _fields_ = [
        ("Data1", wintypes.DWORD),
        ("Data2", wintypes.WORD),
        ("Data3", wintypes.WORD),
        ("Data4", ctypes.c_ubyte * 8),
    ]

    def __init__(self, texto):
        u = uuid.UUID(texto)
        super().__init__(u.fields[0], u.fields[1], u.fields[2],
                         (ctypes.c_ubyte * 8).from_buffer_copy(u.bytes[8:]))


def pasta_conhecida(folder_id):
    """Pasta do usuário pelo Windows (respeita Downloads movido para outro disco)."""
    ponteiro = ctypes.c_wchar_p()
    guid = _GUID(folder_id)
    resultado = ctypes.windll.shell32.SHGetKnownFolderPath(
        ctypes.byref(guid), 0, None, ctypes.byref(ponteiro))
    if resultado != 0:
        return None
    try:
        return Path(ponteiro.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(ponteiro)


def real(caminho):
    return Path(os.path.realpath(caminho))


def env(nome, padrao=""):
    valor = os.environ.get(nome, padrao)
    return real(valor) if valor else None


LOCAL = env("LOCALAPPDATA")
ROAMING = env("APPDATA")
TEMP = env("TEMP")
WINDOWS = env("SystemRoot", r"C:\Windows")
PROGRAMDATA = env("ProgramData", r"C:\ProgramData")
PERFIL = env("USERPROFILE")
LOCAL_LOW = pasta_conhecida(FOLDERID_LOCALAPPDATALOW)
DOWNLOADS = pasta_conhecida(FOLDERID_DOWNLOADS)


@functools.lru_cache(maxsize=1)
def protegidas():
    """Pastas que nunca podem ser apagadas, nem conter algo apagado acima delas.

    Não basta "não apagar a pasta": também não pode apagar nada de que ela
    dependa (um ancestral). O motor recusa os dois casos.
    """
    lista = [WINDOWS, PROGRAMDATA, PERFIL, LOCAL, ROAMING, TEMP, LOCAL_LOW,
             env("ProgramFiles"), env("ProgramFiles(x86)"), env("ProgramW6432"),
             env("PUBLIC"), env("OneDrive"), env("OneDriveConsumer")]
    for fid in (FOLDERID_DOWNLOADS, FOLDERID_DOCUMENTS, FOLDERID_DESKTOP,
                FOLDERID_PICTURES, FOLDERID_VIDEOS, FOLDERID_MUSIC):
        lista.append(pasta_conhecida(fid))
    if PERFIL:
        lista.append(PERFIL.parent)  # C:\Users
    for letra in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        raiz = Path(f"{letra}:\\")
        if raiz.exists():
            lista.append(raiz)
    return tuple(real(p) for p in lista if p)


# Dentro do Windows só se mexe nestas pastas.
DENTRO_DO_WINDOWS_PERMITIDO = [
    WINDOWS / "Temp",
    WINDOWS / "SoftwareDistribution" / "Download",
]
