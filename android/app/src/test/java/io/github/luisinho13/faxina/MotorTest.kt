package io.github.luisinho13.faxina

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.nio.file.Files

/** Tudo numa pasta de rascunho que faz papel do armazenamento do celular. */
class MotorTest {
    @get:Rule
    val rascunho = TemporaryFolder()

    private lateinit var cel: File
    private lateinit var fora: File
    private var agora = 1_800_000_000_000L
    private lateinit var motor: Motor

    private val dia = 24L * 3_600_000
    private val waVideo get() = File(cel, "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video")

    @Before
    fun preparar() {
        cel = rascunho.newFolder("celular")
        fora = rascunho.newFolder("fora")
        motor = Motor(Locais(cel), relogio = { agora })
    }

    private fun arquivo(caminho: String, bytes: Int = 1000, idadeDias: Long = 0, base: File = cel): File {
        val f = File(base, caminho)
        f.parentFile.mkdirs()
        f.writeBytes(ByteArray(bytes))
        f.setLastModified(agora - idadeDias * dia)
        return f
    }

    /** Link de pasta. No Windows sem modo de desenvolvedor, cai para junção (mklink /J). */
    private fun linkDePasta(link: File, alvo: File) {
        link.parentFile.mkdirs()
        try {
            Files.createSymbolicLink(link.toPath(), alvo.toPath())
        } catch (e: Exception) {
            val p = ProcessBuilder("cmd", "/c", "mklink", "/J", link.path, alvo.path).redirectErrorStream(true).start()
            p.inputStream.readAllBytes()
            check(p.waitFor() == 0) { "não deu para criar a junção" }
        }
    }

    private fun analisar() = motor.analisar()

    // ------------------------------------------------------------ análise

    @Test
    fun `analise acha os videos do whatsapp, o maior primeiro, e nao o nomedia`() {
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/VID-1.mp4", 500)
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/Sent/VID-2.mp4", 3000)
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/Sent/.nomedia", 0)
        val a = analisar().getValue("wa_videos")
        assertEquals(listOf("VID-2.mp4", "VID-1.mp4"), a.itens.map { it.nome })
        assertEquals(3500L, a.tamanho)
    }

    @Test
    fun `whatsapp antigo e business tambem entram`() {
        arquivo("WhatsApp/Media/WhatsApp Video/a.mp4")
        arquivo("WhatsApp Business/Media/WhatsApp Video/b.mp4")
        assertEquals(setOf("a.mp4", "b.mp4"), analisar().getValue("wa_videos").itens.map { it.nome }.toSet())
    }

    @Test
    fun `conversas e backups do whatsapp nunca aparecem`() {
        arquivo("Android/media/com.whatsapp/WhatsApp/Databases/msgstore.db.crypt14", 9000)
        arquivo("Android/media/com.whatsapp/WhatsApp/Backups/chatsettings.db.crypt14", 9000)
        val total = analisar().values.sumOf { it.tamanho }
        assertEquals(0L, total)
    }

    @Test
    fun `downloads antigos so pega o que passou de 3 meses e deixa os apk para a outra categoria`() {
        arquivo("Download/boleto-velho.pdf", 100, idadeDias = 200)
        arquivo("Download/recente.pdf", 100, idadeDias = 5)
        arquivo("Download/pasta-velha/foto.jpg", 100, idadeDias = 120)
        arquivo("Download/pasta-mista/velho.jpg", 100, idadeDias = 120)
        arquivo("Download/pasta-mista/novo.jpg", 100, idadeDias = 1)
        arquivo("Download/jogo.apk", 5000, idadeDias = 300)
        val r = analisar()
        assertEquals(setOf("boleto-velho.pdf", "pasta-velha"), r.getValue("downloads_antigos").itens.map { it.nome }.toSet())
        assertEquals(2, r.getValue("downloads_antigos").puladosRecentes)
        assertEquals(listOf("jogo.apk"), r.getValue("instaladores").itens.map { it.nome })
    }

    @Test
    fun `status visto ha menos de um dia fica`() {
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/.Statuses/velho.jpg", 100, idadeDias = 2)
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/.Statuses/hoje.jpg", 100, idadeDias = 0)
        val a = analisar().getValue("wa_status")
        assertEquals(listOf("velho.jpg"), a.itens.map { it.nome })
        assertEquals(1, a.puladosRecentes)
    }

    @Test
    fun `analise nao entra em link`() {
        arquivo("tesouro/foto.jpg", 7000, base = fora)
        linkDePasta(File(cel, "DCIM/.thumbnails/link"), File(fora, "tesouro"))
        arquivo("DCIM/.thumbnails/1.jpg", 10)
        assertEquals(10L, analisar().getValue("miniaturas").tamanho)
    }

    // ------------------------------------------------------------ limpeza

    @Test
    fun `cache seguro sai de vez`() {
        arquivo("DCIM/.thumbnails/1.jpg", 300)
        arquivo("DCIM/.thumbnails/sub/2.jpg", 200)
        analisar()
        val r = motor.limpar(mapOf("miniaturas" to null)).getValue("miniaturas")
        assertEquals(500L, r.liberado)
        assertTrue(File(cel, "DCIM/.thumbnails").isDirectory) // a raiz fica
        assertEquals(0, File(cel, "DCIM/.thumbnails").list()!!.size)
        assertFalse(File(cel, ".faxina-lixeira").exists())
    }

    @Test
    fun `limpeza sem analise antes nao faz nada`() {
        val f = arquivo("DCIM/.thumbnails/1.jpg")
        assertTrue(motor.limpar(mapOf("miniaturas" to null)).isEmpty())
        assertTrue(f.exists())
    }

    @Test
    fun `chave inventada e ignorada`() {
        val f = arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/a.mp4")
        analisar()
        motor.limpar(mapOf("wa_videos" to listOf("wa_videos/99", "../../DCIM", "instaladores/0")))
        assertTrue(f.exists())
    }

    @Test
    fun `por item so sai o que foi marcado e vai para a lixeira`() {
        arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/grande.mp4", 3000)
        val pequeno = arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/pequeno.mp4", 100)
        val a = analisar().getValue("wa_videos")
        val r = motor.limpar(mapOf("wa_videos" to listOf(a.itens.first().chave))).getValue("wa_videos")
        assertEquals(0L, r.liberado)
        assertEquals(3000L, r.paraLixeira)
        assertTrue(pequeno.exists())
        assertEquals(listOf("grande.mp4"), motor.lixeira.entradas().map { it.nome })
    }

    @Test
    fun `link dentro do cache sai como link e o destino fica intacto`() {
        val tesouro = arquivo("tesouro/foto.jpg", 7000, base = fora)
        linkDePasta(File(cel, "DCIM/.thumbnails/pasta/link"), File(fora, "tesouro"))
        arquivo("DCIM/.thumbnails/pasta/1.jpg", 10)
        analisar()
        motor.limpar(mapOf("miniaturas" to null))
        assertTrue(tesouro.exists())
        assertEquals(7000L, tesouro.length())
        assertFalse(File(cel, "DCIM/.thumbnails/pasta").exists())
    }

    @Test
    fun `recusa o que esta fora da raiz, o que e protegido e o nomedia`() {
        val raiz = File(cel, "DCIM/.thumbnails").apply { mkdirs() }
        assertNull(motor.motivoParaRecusar(File(raiz, "1.jpg"), raiz))
        assertNotNull(motor.motivoParaRecusar(File(raiz, "../Camera/foto.jpg"), raiz))
        assertNotNull(motor.motivoParaRecusar(raiz, raiz))
        assertNotNull(motor.motivoParaRecusar(File(raiz, ".nomedia"), raiz))
        val download = File(cel, "Download")
        assertNotNull(motor.motivoParaRecusar(download, cel)) // protegida
        assertNotNull(motor.motivoParaRecusar(File(cel, "DCIM"), cel)) // contém DCIM/Camera
    }

    // ------------------------------------------------------------ lixeira

    @Test
    fun `devolver poe o arquivo de volta onde estava`() {
        val video = arquivo("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/Sent/neta.mp4", 4000)
        val a = analisar().getValue("wa_videos")
        motor.limpar(mapOf("wa_videos" to a.itens.map { it.chave }))
        assertFalse(video.exists())
        val e = motor.lixeira.entradas().single()
        assertEquals(4000L, e.tamanho)
        assertEquals(video.canonicalFile, motor.devolver(e.id)?.canonicalFile)
        assertTrue(video.exists())
        assertTrue(motor.lixeira.entradas().isEmpty())
    }

    @Test
    fun `devolver nao passa por cima de arquivo com o mesmo nome`() {
        val doc = arquivo("Download/nota.pdf", 100, idadeDias = 200)
        val a = analisar().getValue("downloads_antigos")
        motor.limpar(mapOf("downloads_antigos" to a.itens.map { it.chave }))
        arquivo("Download/nota.pdf", 5)
        val volta = motor.devolver(motor.lixeira.entradas().single().id)!!
        assertEquals("nota (devolvido).pdf", volta.name)
        assertEquals(5L, doc.length())
        assertEquals(100L, volta.length())
    }

    @Test
    fun `devolver recusa id inventado`() {
        assertNull(motor.devolver("../../DCIM"))
        assertNull(motor.devolver("123-abcdef12"))
    }

    @Test
    fun `lixeira some sozinha depois de 30 dias`() {
        arquivo("Download/velho1.pdf", 100, idadeDias = 200)
        var a = analisar().getValue("downloads_antigos")
        motor.limpar(mapOf("downloads_antigos" to a.itens.map { it.chave }))
        agora += 20 * dia
        arquivo("Download/velho2.pdf", 300, idadeDias = 200)
        a = analisar().getValue("downloads_antigos")
        motor.limpar(mapOf("downloads_antigos" to a.itens.map { it.chave }))
        agora += 15 * dia
        val liberado = motor.lixeira.expirar(agora) // o arquivo e a etiqueta .faxina-info
        assertTrue(liberado in 100L..1000L)
        assertEquals(listOf("velho2.pdf"), motor.lixeira.entradas().map { it.nome })
    }

    @Test
    fun `esvaziar a lixeira libera o espaco e mantem o nomedia`() {
        arquivo("Download/velho.pdf", 800, idadeDias = 200)
        val a = analisar().getValue("downloads_antigos")
        motor.limpar(mapOf("downloads_antigos" to a.itens.map { it.chave }))
        val l = analisar().getValue("lixeira")
        assertEquals(listOf("velho.pdf"), l.itens.map { it.nome })
        val r = motor.limpar(mapOf("lixeira" to null)).getValue("lixeira")
        assertTrue(r.liberado in 800L..1800L) // o arquivo e a etiqueta .faxina-info
        assertTrue(File(cel, ".faxina-lixeira/.nomedia").exists())
        assertTrue(motor.lixeira.entradas().isEmpty())
    }
}
