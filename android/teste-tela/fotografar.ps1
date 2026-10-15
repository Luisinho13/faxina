# Fotografa a tela do app como num celular (412 x 915, o tamanho de um Galaxy A),
# no Edge sem janela, com os dados de mentira do mock.js.
#   .\fotografar.ps1 -Saida C:\pasta   (gera uma foto por estado, claro e escuro)
# O Edge sem janela não fica mais estreito que ~500 px, então a página vai
# dentro de um quadro (iframe) da largura do celular.
param([Parameter(Mandatory)] [string] $Saida)

$ui = Join-Path $PSScriptRoot "..\app\src\main\assets\ui"
$tmp = Join-Path $Saida "ui"
New-Item -ItemType Directory -Force $tmp | Out-Null
Copy-Item "$ui\*" $tmp -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot "mock.js") $tmp -Force

$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }
$perfil = Join-Path $Saida "perfil-edge"

$estados = "inicio", "permissao", "resultado", "aberto", "modal", "pronto", "lixeira", "agenda", "historico"
foreach ($tema in "claro", "escuro") {
  foreach ($demo in $estados) {
    $quadro = Join-Path $tmp "quadro-$demo-$tema.html"
    Set-Content -Encoding utf8 $quadro ("<!doctype html><body style='margin:0;overflow:hidden'>" +
      "<iframe src='index.html?tema=$tema&demo=$demo' style='border:0;width:412px;height:915px;display:block'></iframe>")
    $foto = Join-Path $Saida "$demo-$tema.png"
    $url = "file:///" + ($quadro -replace '\\', '/')
    & $edge --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$perfil" `
      --window-size=412,915 --force-device-scale-factor=2 --virtual-time-budget=15000 `
      --allow-file-access-from-files --screenshot="$foto" $url 2>$null | Out-Null
    Write-Output $foto
  }
}
