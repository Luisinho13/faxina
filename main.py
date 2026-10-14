"""Faxina: limpeza de disco sem susto.

    main.py              abre a janela
    main.py --agendado   o que o Agendador de Tarefas chama (sem janela)
"""

import ctypes
import sys


def _ja_aberta():
    """Uma janela só. Se já houver uma, traz ela para a frente."""
    ctypes.windll.kernel32.CreateMutexW(None, False, "Faxina.Janela.Unica")
    if ctypes.windll.kernel32.GetLastError() != 183:  # ERROR_ALREADY_EXISTS
        return False
    janela = ctypes.windll.user32.FindWindowW(None, "Faxina")
    if janela:
        ctypes.windll.user32.ShowWindow(janela, 9)  # SW_RESTORE
        ctypes.windll.user32.SetForegroundWindow(janela)
    return True


def _tema_escuro():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize") as k:
            return winreg.QueryValueEx(k, "AppsUseLightTheme")[0] == 0
    except OSError:
        return False


def abrir_janela():
    import webview

    from faxina.api import Api, recursos

    # A cópia com administrador nasce enquanto a antiga ainda fecha.
    if "--elevado" not in sys.argv and _ja_aberta():
        return
    api = Api()
    janela = webview.create_window(
        "Faxina", url=str(recursos() / "ui" / "index.html"), js_api=api,
        width=1120, height=780, min_size=(900, 640),
        background_color="#0e1116" if _tema_escuro() else "#f4f6f8")
    api._janela = janela
    webview.start(gui="edgechromium", private_mode=True)


def main():
    if "--agendado" in sys.argv:
        from faxina import rotina
        rotina.executar()
    else:
        abrir_janela()


if __name__ == "__main__":
    main()
