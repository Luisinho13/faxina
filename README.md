<div align="center">

<img src="recursos/faxina.png" width="96" alt="Ícone da Faxina">

# Faxina

**Limpeza de disco para Windows, sem susto.**

Mostra o que dá para apagar, separa o que é cache do que é seu<br>
e pode passar sozinha uma vez por mês.

![Windows 10 e 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white)
![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Status: em testes](https://img.shields.io/badge/status-em%20testes-0f9d84)

<img src="docs/imagens/analise.png" alt="Resultado da análise: 4,7 GB para liberar, separados por grupo" width="820">

</div>

---

## Sumário

- [Por que existe](#por-que-existe)
- [O que ela faz](#o-que-ela-faz)
- [O que ela limpa](#o-que-ela-limpa)
- [Como ela decide o que pode apagar](#como-ela-decide-o-que-pode-apagar)
- [Faxina automática](#faxina-automática)
- [Telas](#telas)
- [Instalar e rodar](#instalar-e-rodar)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Próximos passos](#próximos-passos)

---

## Por que existe

Em outubro de 2026, uma limpeza feita à mão liberou **52 GB** num PC que
parecia cheio. O maior pedaço, **23 GB**, era um cache que quase ninguém
conhece: os *shaders* que a placa de vídeo da NVIDIA compila para os
jogos e guarda para sempre. O resto estava espalhado em instaladores
esquecidos na pasta Downloads, arquivos temporários e caches de
navegador, de launcher de jogo e de ferramentas de programação.

A Limpeza de Disco do Windows não olha nada disso. Os programas que
olham costumam apagar tudo de uma vez, sem mostrar o quê. A Faxina faz
o caminho do meio: **mostra tudo antes, explica cada item e só apaga o
que você deixar.**

## O que ela faz

- **Analisa em segundos**, só lendo, e mostra quanto dá para
  liberar, separado por grupo, com os maiores itens de cada categoria.
- **Separa o seguro do pessoal.** Cache que o programa refaz sozinho vem
  marcado como *Seguro*. Instaladores, lixeira e músicas offline vêm
  como *Revisar* e pedem confirmação.
- **Cache sai de vez, arquivo seu vai para a lixeira.** Mandar cache
  para a lixeira não libera espaço; mandar um instalador permite desfazer.
- **Pula o que está em uso.** Arquivo aberto ou mexido nas últimas 24
  horas fica para a próxima, sem erro e sem forçar nada.
- **Passa sozinha, se você quiser**, toda semana ou todo mês, e avisa por
  notificação do Windows.
- **Guarda o histórico** de quanto já foi liberado.
- Tema claro e escuro, seguindo o Windows.

## O que ela limpa

| Grupo | O quê | Nível |
|---|---|---|
| **Sistema** | Arquivos temporários do usuário e do Windows, downloads do Windows Update, relatórios de erro | Seguro |
| | Lixeira | Revisar |
| **Jogos e placa de vídeo** | Cache de shaders da NVIDIA, AMD, Intel e DirectX | Seguro |
| | Drivers já instalados que a NVIDIA App guardou | Seguro |
| | Cache da Steam, Epic Games e Battle.net | Seguro |
| **Navegadores** | Cache do Chrome, Edge, Brave, Vivaldi, Opera, Opera GX e Firefox. Senhas, histórico e login não são tocados | Seguro |
| **Aplicativos** | Discord, Visual Studio Code | Seguro |
| | Spotify (inclui as músicas baixadas para ouvir offline) | Revisar |
| **Programação** | pip, uv, npm, Yarn, NuGet | Seguro |
| **Seus arquivos** | Instaladores (`.exe`, `.msi`, `.msix`) na pasta Downloads, escolhidos um a um | Revisar |

Categoria que não existe no PC (um navegador que não está instalado, por
exemplo) simplesmente não aparece.

## Como ela decide o que pode apagar

Um app que apaga arquivos tem que errar para o lado da cautela. Estas
regras estão no código (`faxina/motor.py`) e nos testes
(`testes/test_motor.py`):

1. **Só pastas conhecidas.** Cada categoria aponta para pastas fixas no
   código. Nada vem de fora, nem da própria tela: a limpeza só aceita
   itens que a análise acabou de encontrar.
2. **Última conferência antes de apagar.** Cada item tem que estar
   dentro da pasta da sua categoria, não pode ser uma pasta protegida
   (Windows, Program Files, Documentos, Downloads, Área de Trabalho, a
   raiz do disco…) nem conter uma. Dentro da pasta do Windows, só
   `Temp` e `SoftwareDistribution\Download`.
3. **Atalho de pasta não é seguido.** Uma junção dentro do Temp
   apontando para Documentos é removida como atalho; Documentos fica
   intacto. Esse é o erro clássico de limpadores, e tem teste para ele.
4. **Nada é forçado.** Arquivo em uso ou sem permissão é pulado e
   contado na tela final.
5. **A limpeza automática nunca mexe no que é *Revisar*.**

## Faxina automática

<img src="docs/imagens/agendamento.png" alt="Tela de agendamento" width="720">

- **Frequência:** toda semana (escolhe o dia) ou todo mês (dia 1 a 28),
  no horário que você quiser.
- **Dois modos:**
  - *Só me avisar*: analisa e manda uma notificação quando dá para
    liberar mais do que o limite escolhido.
  - *Limpar o que é seguro e me avisar*: apaga caches e temporários
    sozinha e conta quanto liberou.
- **PC desligado na hora marcada?** Ela roda assim que ele ligar.
- Usa o **Agendador de Tarefas do Windows**: não fica nenhum processo
  rodando em segundo plano.
- Clicar na notificação abre a Faxina.

## Telas

| | |
|:---:|:---:|
| <img src="docs/imagens/inicio.png" alt="Tela inicial" width="400"><br>**Início** | <img src="docs/imagens/analise-escuro.png" alt="Análise no tema escuro" width="400"><br>**Análise, tema escuro** |
| <img src="docs/imagens/confirmacao.png" alt="Confirmação antes de esvaziar a lixeira" width="400"><br>**Confirmação do que não é cache** | <img src="docs/imagens/pronto.png" alt="Tela final com o espaço liberado" width="400"><br>**Fim da faxina (exemplo)** |

## Instalar e rodar

A Faxina ainda está em testes e não tem instalador. Para rodar, é preciso
o [uv](https://docs.astral.sh/uv/) (ou Python 3.12 com pip) e o
WebView2, que já vem no Windows 11.

```powershell
git clone https://github.com/Luisinho13/faxina.git
cd faxina
uv venv -p 3.12 .venv
uv pip install --python .venv\Scripts\python.exe pywebview send2trash winotify
.venv\Scripts\python.exe main.py
```

> Python 3.12 de propósito: o pywebview depende do pythonnet, e é no
> 3.12 que o projeto foi testado.

### Testes

```powershell
uv pip install --python .venv\Scripts\python.exe pytest
.venv\Scripts\python.exe -m pytest
```

Os testes criam uma pasta de rascunho e não tocam em nada fora dela.

### Gerar o executável

```powershell
uv pip install --python .venv\Scripts\python.exe pyinstaller pillow
.venv\Scripts\pyinstaller.exe --noconfirm --clean --windowed --name Faxina `
  --icon recursos\faxina.ico --add-data "ui;ui" --add-data "recursos;recursos" main.py
```

O app sai em `dist\Faxina\` (cerca de 26 MB). Para usar no dia a dia,
copie essa pasta para um lugar fixo: o agendamento aponta para o
caminho do `Faxina.exe`.

## Estrutura do projeto

```
faxina/
├── main.py              abre a janela; com --agendado, roda sem janela
├── faxina/
│   ├── categorias.py    o catálogo: o que limpar, onde e com que nível
│   ├── motor.py         análise (só lê) e limpeza, com as regras de segurança
│   ├── pastas.py        pastas do Windows e a lista de protegidas
│   ├── api.py           a ponte entre a tela e o Python
│   ├── agenda.py        tarefa no Agendador, protocolo faxina:// e notificações
│   ├── rotina.py        o que roda na faxina automática
│   ├── aviso.py         notificação do Windows
│   └── dados.py         configuração e histórico (%LOCALAPPDATA%\Faxina)
├── ui/                  a tela: HTML, CSS e JavaScript, sem internet
├── recursos/            ícone
├── testes/              testes do motor
└── docs/imagens/        prints deste README
```

## Próximos passos

- [ ] Instalador, com atalho no Menu Iniciar
- [ ] Assinatura digital do executável (sem ela, o Windows mostra o aviso
      do SmartScreen)
- [ ] Mais launchers de jogo (Ubisoft Connect, EA App, Riot)
- [ ] Opção de desligar a hibernação (libera o tamanho da memória RAM em
      disco)
- [ ] Nome definitivo

---

<div align="center">
<sub>Criado por Luis Felipe · © 2026 · Todos os direitos reservados.<br>
O código é público para consulta; uso e cópia dependem de autorização.</sub>
</div>
