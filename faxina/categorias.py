"""O que a Faxina sabe limpar.

Cada categoria aponta para pastas conhecidas, nunca para algo que o usuário
digite. O motor apaga só o *conteúdo* de cada raiz (a raiz fica), e só o que
passar pelo filtro.

nivel:
  'seguro'  — cache que o programa refaz sozinho. Entra na limpeza agendada.
  'revisar' — mexe em algo do usuário (instalador, lixeira, música offline).
              Nunca entra na limpeza automática, e a tela pede confirmação.
destino:
  'apagar'  — apaga de vez. Mandar cache para a lixeira não liberaria espaço.
  'lixeira' — vai para a lixeira, dá para desfazer.
  'esvaziar_lixeira' — esvazia a lixeira do Windows.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from . import pastas
from .pastas import LOCAL, LOCAL_LOW, PROGRAMDATA, ROAMING, TEMP, WINDOWS

DIA = 24.0


@dataclass(frozen=True)
class Alvo:
    raiz: Path
    # Recebe a entrada de primeiro nível (os.DirEntry); None = tudo.
    filtro: Callable | None = None


@dataclass(frozen=True)
class Categoria:
    id: str
    nome: str
    descricao: str
    grupo: str
    icone: str
    alvos: Callable[[], list]
    nivel: str = "seguro"
    destino: str = "apagar"
    admin: bool = False
    idade_minima_h: float = 0.0
    aviso: str = ""
    selecao_por_item: bool = False
    extras: dict = field(default_factory=dict)


def _sub(base, *partes):
    """Alvos para cada subpasta que existir."""
    if base is None:
        return []
    return [Alvo(base / p) for p in partes if (base / p).is_dir()]


def _globs(base, padrao, *subpastas):
    """Alvos para subpastas de cada pasta que casar com o padrão (perfis)."""
    if base is None or not base.is_dir():
        return []
    alvos = []
    for pasta in sorted(base.glob(padrao)):
        if pasta.is_dir():
            alvos += _sub(pasta, *subpastas)
    return alvos


# ---------------------------------------------------------------- navegadores

CACHE_CHROMIUM = ("Cache", "Code Cache", "GPUCache", "DawnGraphiteCache",
                  "DawnWebGPUCache", r"Service Worker\CacheStorage",
                  r"Service Worker\ScriptCache")
CACHE_CHROMIUM_RAIZ = ("ShaderCache", "GrShaderCache", "GraphiteDawnCache")


def _chromium(dados_do_usuario):
    def alvos():
        base = LOCAL / dados_do_usuario
        lista = _sub(base, *CACHE_CHROMIUM_RAIZ)
        for perfil in ("Default", "Profile *", "Guest Profile"):
            lista += _globs(base, perfil, *CACHE_CHROMIUM)
        return lista
    return alvos


def _opera(nome):
    def alvos():
        return _sub(LOCAL / "Opera Software" / nome, "Cache", "Code Cache",
                    "GPUCache") + _sub(ROAMING / "Opera Software" / nome,
                                       "Code Cache", "GPUCache",
                                       r"Service Worker\CacheStorage")
    return alvos


def _firefox():
    return _globs(LOCAL / "Mozilla" / "Firefox" / "Profiles", "*",
                  "cache2", "startupCache", "thumbnails")


NAVEGADOR = "Navegadores"
AVISO_NAVEGADOR = ("Não apaga senhas, histórico nem login. Com o navegador "
                   "aberto, o que estiver em uso fica para a próxima.")

# ---------------------------------------------------------------- downloads

EXTENSOES_INSTALADOR = {".exe", ".msi", ".msix", ".msixbundle", ".appx",
                        ".appxbundle"}


def _instaladores():
    if pastas.DOWNLOADS is None:
        return []

    def e_instalador(entrada):
        return (entrada.is_file(follow_symlinks=False)
                and Path(entrada.name).suffix.lower() in EXTENSOES_INSTALADOR)
    return [Alvo(pastas.DOWNLOADS, e_instalador)]


# ---------------------------------------------------------------- catálogo

CATEGORIAS = [
    # Sistema
    Categoria(
        "temp_usuario", "Arquivos temporários",
        "Sobras de instalações e programas na sua pasta Temp.",
        "Sistema", "temp",
        lambda: [Alvo(TEMP)] if TEMP else [],
        idade_minima_h=DIA,
        aviso="Arquivos mexidos nas últimas 24 horas ficam, porque podem estar em uso."),
    Categoria(
        "temp_windows", "Temporários do Windows",
        "A pasta Temp do próprio Windows.",
        "Sistema", "windows",
        lambda: [Alvo(WINDOWS / "Temp")],
        admin=True, idade_minima_h=DIA),
    Categoria(
        "windows_update", "Downloads do Windows Update",
        "Atualizações que já foram baixadas e instaladas.",
        "Sistema", "update",
        lambda: [Alvo(WINDOWS / "SoftwareDistribution" / "Download")],
        admin=True, idade_minima_h=DIA),
    Categoria(
        "relatorios_erro", "Relatórios de erro",
        "Despejos de memória e relatórios de travamento de programas.",
        "Sistema", "erro",
        lambda: (_sub(LOCAL, "CrashDumps",
                      r"Microsoft\Windows\WER\ReportArchive",
                      r"Microsoft\Windows\WER\ReportQueue")
                 + _sub(PROGRAMDATA, r"Microsoft\Windows\WER\ReportArchive",
                        r"Microsoft\Windows\WER\ReportQueue"))),
    Categoria(
        "lixeira", "Lixeira",
        "O que você já mandou para a lixeira.",
        "Sistema", "lixeira",
        lambda: [],
        nivel="revisar", destino="esvaziar_lixeira",
        aviso="Esvaziar a lixeira é definitivo."),

    # Jogos e placa de vídeo
    Categoria(
        "shader_nvidia", "Cache de shaders da NVIDIA",
        "Shaders que a placa compila para os jogos. Costuma ser o maior de todos.",
        "Jogos e placa de vídeo", "gpu",
        lambda: (_sub(LOCAL, r"NVIDIA\DXCache", r"NVIDIA\GLCache",
                      r"NVIDIA Corporation\NV_Cache")),
        aviso="O jogo refaz o cache: a primeira partida de cada um pode engasgar um pouco."),
    Categoria(
        "shader_amd", "Cache de shaders da AMD",
        "Shaders que a placa compila para os jogos.",
        "Jogos e placa de vídeo", "gpu",
        lambda: _sub(LOCAL, r"AMD\DxCache", r"AMD\DxcCache", r"AMD\VkCache",
                     r"AMD\GLCache"),
        aviso="O jogo refaz o cache: a primeira partida de cada um pode engasgar um pouco."),
    Categoria(
        "shader_intel", "Cache de shaders da Intel",
        "Shaders que a placa compila para os jogos.",
        "Jogos e placa de vídeo", "gpu",
        lambda: _sub(LOCAL_LOW, r"Intel\ShaderCache") if LOCAL_LOW else []),
    Categoria(
        "shader_directx", "Cache do DirectX",
        "Shaders guardados pelo próprio DirectX.",
        "Jogos e placa de vídeo", "gpu",
        lambda: _sub(LOCAL, "D3DSCache")),
    Categoria(
        "nvidia_app", "Atualizações baixadas pela NVIDIA App",
        "Cópias de drivers que já foram instalados.",
        "Jogos e placa de vídeo", "update",
        lambda: _sub(PROGRAMDATA,
                     r"NVIDIA Corporation\NVIDIA App\UpdateFramework\ota-artifacts"),
        idade_minima_h=DIA,
        aviso="Se a NVIDIA App tiver uma atualização esperando, ela baixa de novo."),
    Categoria(
        "launchers", "Cache das lojas de jogos",
        "Páginas guardadas pela Steam, Epic Games e Battle.net.",
        "Jogos e placa de vídeo", "jogo",
        lambda: (_sub(LOCAL, r"Steam\htmlcache", r"Battle.net\Cache",
                      r"Battle.net\BrowserCaches")
                 + _globs(LOCAL / "EpicGamesLauncher" / "Saved", "webcache*", "."))),

    # Navegadores
    Categoria("chrome", "Google Chrome", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "chrome", _chromium(r"Google\Chrome\User Data"),
              aviso=AVISO_NAVEGADOR),
    Categoria("edge", "Microsoft Edge", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "edge", _chromium(r"Microsoft\Edge\User Data"),
              aviso=AVISO_NAVEGADOR),
    Categoria("brave", "Brave", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "navegador",
              _chromium(r"BraveSoftware\Brave-Browser\User Data"),
              aviso=AVISO_NAVEGADOR),
    Categoria("vivaldi", "Vivaldi", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "navegador", _chromium(r"Vivaldi\User Data"),
              aviso=AVISO_NAVEGADOR),
    Categoria("opera", "Opera", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "navegador", _opera("Opera Stable"),
              aviso=AVISO_NAVEGADOR),
    Categoria("opera_gx", "Opera GX", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "navegador", _opera("Opera GX Stable"),
              aviso=AVISO_NAVEGADOR),
    Categoria("firefox", "Firefox", "Cache de páginas, imagens e scripts.",
              NAVEGADOR, "navegador", _firefox, aviso=AVISO_NAVEGADOR),

    # Aplicativos
    Categoria(
        "discord", "Discord", "Imagens e vídeos de conversas já vistas.",
        "Aplicativos", "chat",
        lambda: _sub(ROAMING / "discord", "Cache", "Code Cache", "GPUCache")),
    Categoria(
        "vscode", "Visual Studio Code",
        "Cache do editor e cópias de extensões já instaladas.",
        "Aplicativos", "codigo",
        lambda: _sub(ROAMING / "Code", "Cache", "CachedData",
                     "CachedExtensionVSIXs", "Code Cache", "GPUCache")),
    Categoria(
        "spotify", "Spotify",
        "Músicas guardadas para tocar mais rápido e as baixadas para ouvir offline.",
        "Aplicativos", "musica",
        lambda: (_sub(LOCAL / "Spotify", "Data", r"Browser\Cache")
                 + _globs(LOCAL / "Packages", "SpotifyAB.SpotifyMusic_*",
                          r"LocalCache\Spotify\Data",
                          r"LocalCache\Spotify\Browser\Cache")),
        nivel="revisar",
        aviso="Apaga as músicas baixadas para ouvir offline. Login e playlists ficam."),

    # Programação
    Categoria(
        "dev", "Caches de programação",
        "Pacotes baixados pelo pip, uv, npm, Yarn e NuGet. Baixam de novo quando precisar.",
        "Programação", "codigo",
        lambda: _sub(LOCAL, r"pip\Cache", r"uv\cache", "npm-cache",
                     r"Yarn\Cache", r"NuGet\v3-cache", "puccinialin")),

    # Seus arquivos
    Categoria(
        "instaladores", "Instaladores em Downloads",
        "Arquivos .exe e .msi que você baixou para instalar programas.",
        "Seus arquivos", "download", _instaladores,
        nivel="revisar", destino="lixeira", idade_minima_h=DIA,
        selecao_por_item=True,
        aviso="Vão para a lixeira: dá para desfazer. Desmarque o que quiser guardar."),
]

POR_ID = {c.id: c for c in CATEGORIAS}
