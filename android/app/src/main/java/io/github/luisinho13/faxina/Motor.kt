package io.github.luisinho13.faxina

import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.attribute.BasicFileAttributes

/*
 * Varredura e limpeza. As regras são as do Faxina do PC (faxina/motor.py),
 * testadas em MotorTest:
 *
 * 1. Só sai o que a última análise encontrou. A limpeza recebe chaves da
 *    análise, nunca um caminho vindo da tela.
 * 2. Antes de mexer, cada item é conferido de novo: tem que estar dentro da
 *    raiz da sua categoria, não pode ser uma pasta protegida nem conter uma,
 *    e nunca é um .nomedia (é ele que esconde da galeria o que é privado).
 * 3. Link é removido como link: o motor nunca entra nele.
 * 4. O que não sai (em uso, sem permissão) é pulado e contado. Nada é forçado.
 * 5. Cache sai de vez; arquivo da pessoa vai para a lixeira da Faxina.
 */

typealias Progresso = (feito: Int, total: Int, nome: String) -> Unit

class Item(
    val chave: String,
    val arquivo: File,
    val raiz: File,
    val nome: String,
    val tamanho: Long,
    val arquivos: Int,
    val ePasta: Boolean,
    val modificado: Long,
)

class Analise(val categoria: Categoria) {
    var tamanho = 0L
    var arquivos = 0
    val itens = mutableListOf<Item>()
    var puladosRecentes = 0
    var semPermissao = false
}

class Resultado(val categoria: String) {
    var liberado = 0L
    var paraLixeira = 0L
    var apagados = 0
    var pulados = 0
    var erro: String? = null
}

class Medida(var tamanho: Long = 0, var arquivos: Int = 0, var maisNovo: Long = 0)

fun atributos(f: File): BasicFileAttributes? = try {
    Files.readAttributes(f.toPath(), BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
} catch (e: IOException) {
    null
} catch (e: SecurityException) {
    null
}

/** Link simbólico, ou (no Windows dos testes) junção: isOther vem antes de isDirectory. */
fun eAtalho(a: BasicFileAttributes) = a.isSymbolicLink || a.isOther

fun medir(f: File, m: Medida = Medida()): Medida {
    val a = atributos(f) ?: return m
    when {
        eAtalho(a) -> {}
        a.isDirectory -> f.listFiles()?.forEach { medir(it, m) }
        else -> {
            m.tamanho += a.size()
            m.arquivos++
            m.maisNovo = maxOf(m.maisNovo, a.lastModifiedTime().toMillis())
        }
    }
    return m
}

/** Apaga de vez, sem nunca entrar num link. */
fun apagar(f: File, r: Resultado) {
    val a = atributos(f) ?: return
    when {
        eAtalho(a) -> tentar(r) { Files.delete(f.toPath()) }
        a.isDirectory -> {
            f.listFiles()?.forEach { apagar(it, r) }
            try {
                Files.delete(f.toPath())
            } catch (_: IOException) {
                // sobrou algo pulado lá dentro; a pasta fica
            }
        }
        else -> if (tentar(r) { Files.delete(f.toPath()) }) {
            r.liberado += a.size()
            r.apagados++
        }
    }
}

private inline fun tentar(r: Resultado, acao: () -> Unit): Boolean = try {
    acao()
    true
} catch (e: IOException) {
    r.pulados++
    false
} catch (e: SecurityException) {
    r.pulados++
    false
}

private fun dentro(filho: File, pai: File) = filho.path.startsWith(pai.path + File.separator)

class Motor(
    val locais: Locais,
    private val catalogo: List<Categoria> = CATEGORIAS,
    private val relogio: () -> Long = System::currentTimeMillis,
    /** Avisado com os caminhos que mudaram de lugar (a galeria precisa saber). */
    private val aoMover: (List<File>) -> Unit = {},
) {
    val lixeira = Lixeira(locais.lixeira, locais.raiz)
    private var ultima: Map<String, Analise> = emptyMap()

    // ------------------------------------------------------------ análise

    fun analisar(progresso: Progresso = { _, _, _ -> }): Map<String, Analise> {
        val agora = relogio()
        val resultado = LinkedHashMap<String, Analise>()
        catalogo.forEachIndexed { i, c ->
            progresso(i, catalogo.size, c.nome)
            resultado[c.id] = analisarCategoria(c, agora)
        }
        progresso(catalogo.size, catalogo.size, "")
        ultima = resultado
        return resultado
    }

    private fun analisarCategoria(c: Categoria, agora: Long): Analise {
        val analise = Analise(c)
        val achados = mutableListOf<Triple<File, File, Medida>>()
        for (alvo in c.alvos(locais)) {
            if (!alvo.raiz.isDirectory) continue
            val raiz = alvo.raiz.canonicalFile
            val candidatos = if (alvo.arquivosSoltos) {
                arquivosDentro(raiz)
            } else {
                raiz.listFiles()?.toList() ?: run { analise.semPermissao = true; emptyList() }
            }
            for (f in candidatos) {
                if (f.name == ".nomedia" || !alvo.filtro(f)) continue
                val a = atributos(f) ?: continue
                if (eAtalho(a)) continue
                val m = medir(f)
                val quando = if (a.isDirectory) m.maisNovo else a.lastModifiedTime().toMillis()
                if (c.idadeMinimaH > 0 && agora - quando < c.idadeMinimaH * 3_600_000) {
                    analise.puladosRecentes++
                    continue
                }
                if (m.tamanho == 0L && a.isDirectory && c.destino != Destino.ESVAZIAR_LIXEIRA) continue
                achados += Triple(f, raiz, m)
            }
        }
        achados.sortByDescending { it.third.tamanho }
        achados.forEachIndexed { i, (f, raiz, m) ->
            val nome = if (c.destino == Destino.ESVAZIAR_LIXEIRA) lixeira.nomeOriginal(f) ?: f.name else f.name
            analise.itens += Item(
                chave = "${c.id}/$i",
                arquivo = f,
                raiz = raiz,
                nome = nome,
                tamanho = m.tamanho,
                arquivos = m.arquivos,
                ePasta = f.isDirectory,
                modificado = if (f.isDirectory) m.maisNovo else f.lastModified(),
            )
            analise.tamanho += m.tamanho
            analise.arquivos += m.arquivos
        }
        return analise
    }

    private fun arquivosDentro(pasta: File, saida: MutableList<File> = mutableListOf()): List<File> {
        for (f in pasta.listFiles() ?: return saida) {
            val a = atributos(f) ?: continue
            when {
                eAtalho(a) -> {}
                a.isDirectory -> arquivosDentro(f, saida)
                a.isRegularFile -> saida += f
            }
        }
        return saida
    }

    /** O item da última análise com esta chave (para mostrar o arquivo antes de apagar). */
    fun item(chave: String): Item? =
        ultima[chave.substringBefore('/')]?.itens?.firstOrNull { it.chave == chave }

    // ------------------------------------------------------------ limpeza

    /** null = pode mexer; senão, o motivo da recusa. */
    fun motivoParaRecusar(f: File, raiz: File): String? {
        if (f.name == ".nomedia") return "arquivo .nomedia"
        val pai = f.absoluteFile.parentFile ?: return "sem pasta"
        // O próprio item não é resolvido: se for link, vale o link, não o destino.
        val caminho = File(pai.canonicalFile, f.name)
        if (!dentro(caminho, raiz.canonicalFile)) return "fora da pasta da categoria"
        for (p in locais.protegidas) {
            if (caminho == p || dentro(p, caminho)) return "pasta protegida"
        }
        return null
    }

    /**
     * escolha: id da categoria -> chaves escolhidas (categorias por item) ou
     * null (a categoria inteira). Só vale o que está na última análise.
     */
    fun limpar(escolha: Map<String, List<String>?>, progresso: Progresso = { _, _, _ -> }): Map<String, Resultado> {
        val resultados = LinkedHashMap<String, Resultado>()
        val trabalho = mutableListOf<Pair<Categoria, Item>>()
        for ((id, chaves) in escolha) {
            val analise = ultima[id] ?: continue
            val c = analise.categoria
            val itens = if (c.porItem) {
                val quero = chaves.orEmpty().toSet()
                analise.itens.filter { it.chave in quero }
            } else {
                analise.itens
            }
            resultados[id] = Resultado(id)
            itens.forEach { trabalho += c to it }
        }

        val movidos = mutableListOf<File>()
        trabalho.forEachIndexed { i, (c, item) ->
            progresso(i, trabalho.size, item.nome)
            val r = resultados.getValue(c.id)
            val motivo = motivoParaRecusar(item.arquivo, item.raiz)
            if (motivo != null) {
                r.pulados++
                r.erro = motivo
                return@forEachIndexed
            }
            when (c.destino) {
                Destino.APAGAR, Destino.ESVAZIAR_LIXEIRA -> apagar(item.arquivo, r)
                Destino.LIXEIRA -> {
                    val destino = lixeira.mover(item.arquivo, relogio())
                    if (destino != null) {
                        r.paraLixeira += item.tamanho
                        r.apagados += item.arquivos
                        movidos += item.arquivo
                        movidos += destino
                    } else {
                        r.pulados++
                    }
                }
            }
        }
        progresso(trabalho.size, trabalho.size, "")
        if (movidos.isNotEmpty()) aoMover(movidos)
        ultima = emptyMap()
        return resultados
    }

    /** Esvazia a lixeira da Faxina inteira (o botão da aba Lixeira). */
    fun esvaziarLixeira(): Resultado {
        val r = Resultado("lixeira")
        for (e in lixeira.entradas()) {
            if (motivoParaRecusar(e.caixa, lixeira.pasta) == null) apagar(e.caixa, r)
        }
        return r
    }

    /** Devolve um item da lixeira para onde estava. */
    fun devolver(id: String): File? {
        val destino = lixeira.devolver(id) ?: return null
        aoMover(listOf(destino))
        return destino
    }
}
