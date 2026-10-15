package io.github.luisinho13.faxina

import java.io.File

/*
 * O que a Faxina sabe limpar no celular.
 *
 * Mesma ideia do catálogo do PC (faxina/categorias.py): cada categoria aponta
 * para pastas conhecidas, nunca para algo vindo da tela.
 *
 * nivel:
 *   SEGURO  — o app refaz sozinho. Já vem marcado.
 *   REVISAR — é coisa da pessoa (vídeo, documento, instalador). Vem desmarcado
 *             e a tela pede confirmação.
 * destino:
 *   APAGAR           — sai de vez (cache: mandar para a lixeira não libera nada).
 *   LIXEIRA          — vai para a lixeira da Faxina, dá para devolver por 30 dias.
 *   ESVAZIAR_LIXEIRA — esvazia a lixeira da Faxina.
 */

enum class Nivel { SEGURO, REVISAR }
enum class Destino { APAGAR, LIXEIRA, ESVAZIAR_LIXEIRA }

/**
 * Uma pasta da categoria. Por padrão cada entrada do primeiro nível é um item
 * (pasta inteira medida junto); com [arquivosSoltos], cada arquivo da árvore é
 * um item (para escolher vídeo por vídeo).
 */
class Alvo(
    val raiz: File,
    val arquivosSoltos: Boolean = false,
    val filtro: (File) -> Boolean = { true },
)

class Categoria(
    val id: String,
    val nome: String,
    val descricao: String,
    val grupo: String,
    val icone: String,
    val nivel: Nivel = Nivel.SEGURO,
    val destino: Destino = Destino.APAGAR,
    val porItem: Boolean = false,
    val aviso: String = "",
    val idadeMinimaH: Double = 0.0,
    val alvos: (Locais) -> List<Alvo>,
)

/** As pastas do armazenamento do celular. Nos testes, a raiz é uma pasta de rascunho. */
class Locais(armazenamento: File) {
    val raiz: File = armazenamento.canonicalFile
    fun em(caminho: String) = File(raiz, caminho)

    val lixeira = em(".faxina-lixeira")
    val download = em("Download")

    /** Pastas do WhatsApp: a de antes do Android 11 e a de agora, com e sem Business. */
    val whatsapps: List<File> get() = WHATSAPPS.map(::em).filter { it.isDirectory }

    fun midiaDoWhatsapp(pasta: String) =
        whatsapps.map { File(it, "Media/$pasta") }.filter { it.isDirectory }

    /**
     * Nunca saem, nem algo que as contenha. Não basta "não apagar a pasta":
     * também não pode sair nada acima dela. O motor recusa os dois casos.
     */
    val protegidas: List<File> by lazy {
        val fixas = listOf(
            "", "Android", "Android/data", "Android/media", "Android/obb",
            "DCIM", "DCIM/Camera", "Pictures", "Pictures/Screenshots", "DCIM/Screenshots",
            "Movies", "Music", "Documents", "Download", "Recordings", "Alarms",
            "Notifications", "Ringtones", "Podcasts", "Audiobooks", ".faxina-lixeira",
        )
        val doWhatsapp = WHATSAPPS.flatMap { wa ->
            listOf("", "/Media", "/Databases", "/Backups").map { wa + it }
        }
        (fixas + doWhatsapp).map { em(it).canonicalFile }
    }

    companion object {
        val WHATSAPPS = listOf(
            "Android/media/com.whatsapp/WhatsApp",
            "Android/media/com.whatsapp.w4b/WhatsApp Business",
            "WhatsApp",
            "WhatsApp Business",
        )
    }
}

private val INSTALADORES = setOf("apk", "apks", "xapk", "apkm")
private fun eInstalador(f: File) = f.isFile && f.extension.lowercase() in INSTALADORES

private const val DIA = 24.0

val CATEGORIAS: List<Categoria> = listOf(
    // ------------------------------------------------------------ WhatsApp
    Categoria(
        id = "wa_videos",
        nome = "Vídeos do WhatsApp",
        descricao = "Vídeos recebidos e enviados nas conversas. Os maiores aparecem primeiro.",
        grupo = "WhatsApp",
        icone = "video",
        nivel = Nivel.REVISAR,
        destino = Destino.LIXEIRA,
        porItem = true,
        aviso = "Confira antes: pode ter vídeo de família. Toque no olho para assistir.",
    ) { l -> l.midiaDoWhatsapp("WhatsApp Video").map { Alvo(it, arquivosSoltos = true) } },

    Categoria(
        id = "wa_documentos",
        nome = "Documentos do WhatsApp",
        descricao = "PDFs, planilhas e outros arquivos recebidos nas conversas.",
        grupo = "WhatsApp",
        icone = "documento",
        nivel = Nivel.REVISAR,
        destino = Destino.LIXEIRA,
        porItem = true,
    ) { l -> l.midiaDoWhatsapp("WhatsApp Documents").map { Alvo(it, arquivosSoltos = true) } },

    Categoria(
        id = "wa_status",
        nome = "Status já vistos",
        descricao = "Fotos e vídeos de status que já passaram. O WhatsApp não usa mais.",
        grupo = "WhatsApp",
        icone = "olho",
        idadeMinimaH = DIA,
    ) { l -> l.midiaDoWhatsapp(".Statuses").map { Alvo(it) } },

    // ------------------------------------------------------------ arquivos
    Categoria(
        id = "instaladores",
        nome = "Instaladores de apps",
        descricao = "Arquivos .apk baixados. O app já instalado não depende deles.",
        grupo = "Seus arquivos",
        icone = "download",
        nivel = Nivel.REVISAR,
        destino = Destino.LIXEIRA,
        porItem = true,
    ) { l -> listOf(Alvo(l.download, filtro = ::eInstalador)) },

    Categoria(
        id = "downloads_antigos",
        nome = "Downloads antigos",
        descricao = "O que está na pasta Download há mais de 3 meses.",
        grupo = "Seus arquivos",
        icone = "pasta",
        nivel = Nivel.REVISAR,
        destino = Destino.LIXEIRA,
        porItem = true,
        idadeMinimaH = 90 * DIA,
    ) { l -> listOf(Alvo(l.download, filtro = { !eInstalador(it) })) },

    // ------------------------------------------------------------ sistema
    Categoria(
        id = "miniaturas",
        nome = "Miniaturas da galeria",
        descricao = "Imagens pequenas que a galeria guarda para abrir rápido. Ela refaz sozinha.",
        grupo = "Sistema",
        icone = "imagem",
    ) { l -> listOf("DCIM/.thumbnails", "Pictures/.thumbnails").map(l::em).filter { it.isDirectory }.map { Alvo(it) } },

    Categoria(
        id = "lixeira",
        nome = "Lixeira da Faxina",
        descricao = "O que saiu nas últimas faxinas. Some sozinho depois de 30 dias.",
        grupo = "Sistema",
        icone = "lixeira",
        nivel = Nivel.REVISAR,
        destino = Destino.ESVAZIAR_LIXEIRA,
    ) { l -> listOf(Alvo(l.lixeira)) },
)

val POR_ID: Map<String, Categoria> = CATEGORIAS.associateBy { it.id }
