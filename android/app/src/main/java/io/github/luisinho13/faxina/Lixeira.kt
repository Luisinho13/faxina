package io.github.luisinho13.faxina

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.Properties
import java.util.UUID

/**
 * A lixeira da Faxina: uma pasta escondida da galeria (.nomedia) no próprio
 * armazenamento, para mover ser só renomear.
 *
 * Cada coisa que entra ganha uma caixa `<quando>-<sorteio>/` com o arquivo
 * dentro e um `.faxina-info` dizendo de onde veio. Depois de [dias] dias a
 * caixa sai sozinha.
 */
class Lixeira(val pasta: File, private val raizPermitida: File, private val dias: Int = 30) {

    class Entrada(
        val id: String,
        val caixa: File,
        val nome: String,
        val original: File?,
        val quando: Long,
        val tamanho: Long,
    )

    fun mover(f: File, agora: Long): File? {
        preparar()
        val id = "$agora-" + UUID.randomUUID().toString().take(8)
        val caixa = File(pasta, id)
        if (!caixa.mkdirs()) return null
        val destino = File(caixa, f.name)
        val tamanho = medir(f).tamanho
        if (!mudar(f, destino)) {
            caixa.delete()
            return null
        }
        val info = Properties().apply {
            setProperty("original", f.absolutePath)
            setProperty("quando", agora.toString())
            setProperty("tamanho", tamanho.toString())
        }
        File(caixa, INFO).outputStream().use { info.store(it, "Faxina") }
        return destino
    }

    fun entradas(): List<Entrada> {
        val caixas = pasta.listFiles { f -> f.isDirectory && ID.matches(f.name) } ?: return emptyList()
        return caixas.mapNotNull(::ler).sortedByDescending { it.quando }
    }

    fun nomeOriginal(caixa: File): String? = ler(caixa)?.nome

    /** Põe de volta onde estava. Se já tiver outro arquivo com o mesmo nome, ganha "(devolvido)". */
    fun devolver(id: String): File? {
        if (!ID.matches(id)) return null
        val e = ler(File(pasta, id)) ?: return null
        val original = e.original ?: return null
        val pai = original.absoluteFile.parentFile?.canonicalFile ?: return null
        val raiz = raizPermitida.canonicalFile
        val lixo = pasta.canonicalFile
        if (pai != raiz && !pai.path.startsWith(raiz.path + File.separator)) return null
        if (pai == lixo || pai.path.startsWith(lixo.path + File.separator)) return null

        val dentro = File(e.caixa, e.nome)
        if (!dentro.exists()) return null
        pai.mkdirs()
        val destino = livre(File(pai, original.name))
        if (!mudar(dentro, destino)) return null
        File(e.caixa, INFO).delete()
        e.caixa.delete()
        return destino
    }

    /** Tira o que passou do prazo. Devolve quanto liberou. */
    fun expirar(agora: Long): Long {
        val r = Resultado("lixeira")
        val prazo = dias * 24L * 3_600_000
        entradas().filter { agora - it.quando > prazo }.forEach { apagar(it.caixa, r) }
        return r.liberado
    }

    private fun preparar() {
        pasta.mkdirs()
        val nomedia = File(pasta, ".nomedia")
        if (!nomedia.exists()) {
            try {
                nomedia.createNewFile()
            } catch (_: IOException) {
            }
        }
    }

    private fun ler(caixa: File): Entrada? {
        val dentro = caixa.listFiles { f -> f.name != INFO }?.firstOrNull() ?: return null
        val info = Properties()
        val arquivoInfo = File(caixa, INFO)
        if (arquivoInfo.isFile) arquivoInfo.inputStream().use { info.load(it) }
        return Entrada(
            id = caixa.name,
            caixa = caixa,
            nome = dentro.name,
            original = info.getProperty("original")?.let(::File),
            quando = info.getProperty("quando")?.toLongOrNull() ?: caixa.name.substringBefore('-').toLongOrNull() ?: 0,
            tamanho = info.getProperty("tamanho")?.toLongOrNull() ?: medir(dentro).tamanho,
        )
    }

    private fun livre(alvo: File): File {
        if (!alvo.exists()) return alvo
        val base = alvo.nameWithoutExtension
        val ext = if (alvo.extension.isEmpty()) "" else "." + alvo.extension
        var n = 1
        while (true) {
            val nome = if (n == 1) "$base (devolvido)$ext" else "$base (devolvido $n)$ext"
            val f = File(alvo.parentFile, nome)
            if (!f.exists()) return f
            n++
        }
    }

    /** Renomeia; se o sistema não deixar (outra partição), copia e apaga o original. */
    private fun mudar(de: File, para: File): Boolean {
        if (de.renameTo(para)) return true
        if (!de.isFile) return false
        return try {
            Files.copy(de.toPath(), para.toPath(), StandardCopyOption.COPY_ATTRIBUTES)
            Files.delete(de.toPath())
            true
        } catch (e: IOException) {
            para.delete()
            false
        }
    }

    companion object {
        const val INFO = ".faxina-info"
        private val ID = Regex("[0-9]+-[0-9a-f]{8}")
    }
}
