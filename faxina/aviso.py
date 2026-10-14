"""Notificação do Windows (a que aparece no canto da tela)."""

from winotify import Notification, audio

from .agenda import APP_ID, registrar_no_windows


def mostrar(titulo, mensagem, botao="Abrir a Faxina", icone=""):
    registrar_no_windows(icone or None)
    n = Notification(app_id=APP_ID, title=titulo, msg=mensagem,
                     icon=str(icone) if icone else "", launch="faxina://abrir")
    n.set_audio(audio.Default, loop=False)
    if botao:
        n.add_actions(label=botao, launch="faxina://abrir")
    n.show()


def gb(numero_de_bytes):
    valor = numero_de_bytes / 2**30
    if valor >= 10:
        return f"{valor:.0f} GB".replace(".", ",")
    if valor >= 1:
        return f"{valor:.1f} GB".replace(".", ",")
    return f"{numero_de_bytes / 2**20:.0f} MB"
