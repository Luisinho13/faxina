# Faxina

Limpeza de disco para Windows, sem susto. Mostra o que dá para apagar,
separa o que é cache (sai sem perguntar) do que é seu (vai para a lixeira,
com confirmação) e pode rodar sozinha uma vez por semana ou por mês.

Nasceu de uma faxina feita à mão em 13/10/2026 que liberou 52 GB num PC
"cheio". 23 GB eram de um cache que quase ninguém conhece: os shaders
que a placa de vídeo da NVIDIA compila para os jogos.

## O que ela limpa

| Grupo | Exemplos | Como sai |
|---|---|---|
| Sistema | Temp, Windows Update, relatórios de erro | apagado (cache) |
| Jogos e placa de vídeo | shaders NVIDIA/AMD/Intel/DirectX, drivers baixados pela NVIDIA App, cache da Steam/Epic/Battle.net | apagado |
| Navegadores | cache do Chrome, Edge, Brave, Opera, Firefox (sem senhas, histórico ou login) | apagado |
| Aplicativos | Discord, VS Code, Spotify (músicas offline: pede confirmação) | apagado |
| Programação | pip, uv, npm, Yarn, NuGet | apagado |
| Seus arquivos | instaladores em Downloads, lixeira | **lixeira**, com confirmação |

Nada fora dessas pastas é tocado. Arquivo mexido nas últimas 24 horas
(Temp, Windows Update) fica, porque pode estar em uso.

## Rodar

```
uv venv -p 3.12 .venv
uv pip install --python .venv\Scripts\python.exe pywebview send2trash winotify pytest pillow pyinstaller
.venv\Scripts\python.exe main.py
```

Testes: `.venv\Scripts\python.exe -m pytest`

Gerar o `.exe` (sai em `dist\Faxina\`):

```
.venv\Scripts\pyinstaller.exe --noconfirm --clean --windowed --name Faxina --icon recursos\faxina.ico --add-data "ui;ui" --add-data "recursos;recursos" main.py
```

---

Criado por Luis Felipe · © 2026 · Todos os direitos reservados.
