# Faxina — contexto do projeto

App de limpeza de disco para Windows. Começou em 14/10/2026, a pedido do
usuário (Luis Felipe), depois de uma limpeza feita à mão que liberou 52 GB.
Plano dele: **testar no próprio PC primeiro, depois distribuir.** Pediu
"bem gourmet", com aviso e opção de agendamento ("1 vez por mês").

Nome "Faxina" é provisório, escolhido por Claude.

## Stack

Python 3.12 (venv do uv em `.venv`; o Python da máquina é 3.14 e o
pywebview/pythonnet pede ≤3.13), **pywebview** (WebView2) com a tela em
HTML/CSS/JS em `ui/`, `send2trash`, `winotify`. Empacotado com PyInstaller
(onedir, ~26 MB). Sem internet: ícones desenhados em `ui/icones.js`, fonte
Segoe UI Variable.

## Arquivos

- `faxina/pastas.py` — pastas do Windows com nome longo (`real()`;
  o %TEMP% vem como `ITXGAM~1`) e a lista de **protegidas**.
- `faxina/categorias.py` — o catálogo. Cada categoria aponta para pastas
  fixas; `nivel` seguro/revisar, `destino` apagar/lixeira/esvaziar_lixeira.
- `faxina/motor.py` — varredura (só lê) e limpeza. Regras no docstring.
- `faxina/api.py` — o que a tela chama (js_api). Atributos com `_` na
  frente: o pywebview expõe atributo público para o JS e se perde no
  objeto da janela (`_janela`).
- `faxina/agenda.py` — tarefa no Agendador por **XML** (por causa do
  `StartWhenAvailable`), protocolo `faxina://` e AUMID das notificações,
  tudo em HKCU.
- `faxina/rotina.py` — o `--agendado`: modo "avisar" ou "limpar o seguro".
- `faxina/dados.py` — config e histórico em `%LOCALAPPDATA%\Faxina`.
- `testes/test_motor.py` — 15 testes, todos numa pasta de rascunho.

## Regras de segurança (não afrouxar)

1. Limpeza só aceita **chaves da última análise**, nunca caminho da tela.
2. Antes de apagar, `motivo_para_recusar`: dentro da raiz da categoria,
   não é protegida nem contém protegida, e dentro do Windows só Temp e
   SoftwareDistribution\Download.
3. **Junção/link é removido como atalho, nunca seguido** (teste com
   `mklink /J` apontando para fora).
4. Cache sai de vez (mandar para a lixeira não libera espaço); arquivo do
   usuário vai para a lixeira. Limpeza agendada **nunca** mexe em 'revisar'.
5. Caminho com prefixo `\\?\` (passa de 260 caracteres: modpacks).

## Como testar a tela

`AppTest` não existe aqui. O que funcionou (scripts no scratchpad da
sessão de 14/10): abrir a janela de verdade com `webview.start(roteiro)`,
dirigir por `evaluate_js` (bloqueando `limpar` com um Proxy) e fotografar.
`ImageGrab` pega o que estiver na frente da tela (pegou o navegador do
usuário): usar **PrintWindow com PW_RENDERFULLCONTENT** na janela, que
funciona mesmo atrás de outras. Tema escuro: `data-tema="escuro"` no
`<html>` (o app.js põe pelo `prefers-color-scheme`).

Notificação: com vídeo em tela cheia o Windows não mostra o balão, mas
ela chega na Central de Notificações (conferir com
`ToastNotificationManager.History.GetHistory("Faxina.Limpeza")`).

## Estado (14/10/2026, madrugada)

Pronto e testado: análise, limpeza (no rascunho), tela completa (claro e
escuro), agendamento criado/conferido/removido no Agendador, rotina
`--agendado` em modo avisar, notificação, `.exe` abrindo. **Nenhuma
limpeza real foi feita pelo app**: o primeiro uso real é do usuário.
Agendamento ficou **desligado**.

Repositório **público** em https://github.com/Luisinho13/faxina (pedido
do usuário em 14/10), separado do estoque. O `gh` não está logado nesta
máquina: o push funciona pelo login do Git no Windows, mas criar
repositório novo é com o usuário (github.com/new) ou `gh auth login`.
Sem arquivo de licença, como no estoque: o README diz "todos os direitos
reservados"; não pôr licença aberta sem perguntar.

## Próximos passos

- Usuário testar no PC dele (rodar `dist\Faxina\Faxina.exe`).
- Instalador (Inno Setup) com atalho no Menu Iniciar — o agendamento
  aponta para o caminho do exe, e mover a pasta quebra a tarefa.
- Assinatura de código antes de distribuir (sem ela o SmartScreen avisa).
- Opções que ficaram de fora de propósito: desligar hibernação
  (`powercfg -h off`, admin), limpeza de componentes do Windows (DISM),
  "memória RAM" (não ajuda, foi explicado ao usuário).
