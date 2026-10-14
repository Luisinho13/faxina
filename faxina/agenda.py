"""Agendamento pelo Agendador de Tarefas do Windows.

A tarefa é criada por XML (e não pelas opções do schtasks) por causa de uma
coisa: StartWhenAvailable. Com ela, se o PC estiver desligado no dia marcado,
a Faxina roda assim que ele ligar, em vez de esperar o mês seguinte.

Também registra o protocolo faxina:// (o clique na notificação abre o app)
e o nome do app nas notificações do Windows. Tudo em HKEY_CURRENT_USER: não
precisa de administrador.
"""

import calendar
import datetime as dt
import os
import subprocess
import sys
import tempfile
import winreg
from pathlib import Path
from xml.sax.saxutils import escape

NOME_TAREFA = "Faxina - limpeza agendada"
APP_ID = "Faxina.Limpeza"
DIAS_XML = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
            "Saturday", "Sunday"]
MESES_XML = ["January", "February", "March", "April", "May", "June", "July",
             "August", "September", "October", "November", "December"]
SEM_JANELA = 0x08000000  # CREATE_NO_WINDOW


def comando(*argumentos):
    """(programa, argumentos) para abrir a Faxina, empacotada ou não."""
    if getattr(sys, "frozen", False):
        return sys.executable, " ".join(argumentos)
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    principal = Path(__file__).resolve().parent.parent / "main.py"
    return str(pythonw), " ".join([f'"{principal}"', *argumentos])


def _xml(agenda):
    hora, minuto = (int(x) for x in agenda["hora"].split(":"))
    inicio = dt.datetime.now().replace(hour=hora, minute=minuto, second=0,
                                       microsecond=0)
    if agenda["frequencia"] == "semanal":
        quando = (f"<ScheduleByWeek><DaysOfWeek><{DIAS_XML[agenda['dia_semana']]} />"
                  "</DaysOfWeek><WeeksInterval>1</WeeksInterval></ScheduleByWeek>")
    else:
        meses = "".join(f"<{m} />" for m in MESES_XML)
        quando = (f"<ScheduleByMonth><DaysOfMonth><Day>{agenda['dia_mes']}</Day>"
                  f"</DaysOfMonth><Months>{meses}</Months></ScheduleByMonth>")
    programa, argumentos = comando("--agendado")
    return f"""<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Author>Faxina</Author>
    <Description>Analisa o disco e avisa (ou limpa o que é seguro), como combinado na Faxina.</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>{inicio.isoformat()}</StartBoundary>
      <Enabled>true</Enabled>
      {quando}
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{escape(programa)}</Command>
      <Arguments>{escape(argumentos)}</Arguments>
    </Exec>
  </Actions>
</Task>
"""


def _schtasks(*argumentos):
    return subprocess.run(["schtasks", *argumentos], capture_output=True,
                          text=True, creationflags=SEM_JANELA)


def ativar(agenda):
    """Cria ou substitui a tarefa. Devolve (ok, mensagem de erro)."""
    with tempfile.NamedTemporaryFile("w", suffix=".xml", delete=False,
                                     encoding="utf-16") as f:
        f.write(_xml(agenda))
        caminho = f.name
    try:
        r = _schtasks("/Create", "/TN", NOME_TAREFA, "/XML", caminho, "/F")
    finally:
        os.remove(caminho)
    if r.returncode != 0:
        return False, (r.stderr or r.stdout).strip()
    registrar_no_windows()
    return True, ""


def desativar():
    if existe():
        _schtasks("/Delete", "/TN", NOME_TAREFA, "/F")


def existe():
    return _schtasks("/Query", "/TN", NOME_TAREFA).returncode == 0


def rodar_agora():
    return _schtasks("/Run", "/TN", NOME_TAREFA).returncode == 0


def proxima_execucao(agenda, agora=None):
    """Calculada pela própria configuração (a saída do schtasks muda com o idioma)."""
    agora = agora or dt.datetime.now()
    hora, minuto = (int(x) for x in agenda["hora"].split(":"))
    if agenda["frequencia"] == "semanal":
        dias = (agenda["dia_semana"] - agora.weekday()) % 7
        candidato = (agora + dt.timedelta(days=dias)).replace(
            hour=hora, minute=minuto, second=0, microsecond=0)
        if candidato <= agora:
            candidato += dt.timedelta(days=7)
        return candidato
    ano, mes = agora.year, agora.month
    for _ in range(2):
        dia = min(agenda["dia_mes"], calendar.monthrange(ano, mes)[1])
        candidato = dt.datetime(ano, mes, dia, hora, minuto)
        if candidato > agora:
            return candidato
        ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)
    return candidato


def registrar_no_windows(icone=None):
    """faxina:// abre o app; e as notificações saem com nome e ícone da Faxina."""
    programa, argumentos = comando("--abrir")
    linha = f'"{programa}" {argumentos}'
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Classes\faxina") as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, "URL:Faxina")
        winreg.SetValueEx(k, "URL Protocol", 0, winreg.REG_SZ, "")
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER,
                          r"Software\Classes\faxina\shell\open\command") as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, linha)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER,
                          rf"Software\Classes\AppUserModelId\{APP_ID}") as k:
        winreg.SetValueEx(k, "DisplayName", 0, winreg.REG_SZ, "Faxina")
        if icone:
            winreg.SetValueEx(k, "IconUri", 0, winreg.REG_SZ, str(icone))
