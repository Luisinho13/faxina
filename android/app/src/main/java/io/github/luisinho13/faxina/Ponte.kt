package io.github.luisinho13.faxina

import android.app.Activity
import android.os.Build
import android.os.SystemClock
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * O que a tela chama (o js_api do PC). Cada chamada vem com um número e a
 * resposta volta por `Nativo_resposta(numero, deuCerto, valor)`, para a tela
 * não travar enquanto o motor trabalha. O motor roda numa fila só: nunca
 * duas coisas mexendo nos arquivos ao mesmo tempo.
 */
class Ponte(private val tela: MainActivity, private val web: WebView) {
    private val fila = Executors.newSingleThreadExecutor()
    private val dados = Dados(tela)
    private val motor = Sistema.motor(tela)
    private val local = motor.locais.raiz

    private var pedidoCache: Int? = null
    private var livreAntesDoCache = 0L
    private var pedidoAviso: Int? = null

    @JavascriptInterface
    fun chamar(id: Int, metodo: String, argumentos: String) {
        val args = JSONArray(argumentos)
        when (metodo) {
            // Estes precisam da tela do Android na frente.
            "pedir_permissao" -> tela.runOnUiThread { tela.pedirPermissaoDeArquivos(); responder(id, true, "true") }
            "limpar_cache_apps" -> tela.runOnUiThread { limparCacheDosApps(id) }
            "testar_aviso" -> tela.runOnUiThread { testarAviso(id) }
            else -> fila.execute {
                try {
                    responder(id, true, executar(metodo, args))
                } catch (e: Exception) {
                    responder(id, false, JSONObject.quote(e.message ?: e.javaClass.simpleName))
                }
            }
        }
    }

    private fun executar(metodo: String, args: JSONArray): String = when (metodo) {
        "estado" -> estado().toString()
        "analisar" -> analisar().toString()
        "limpar" -> limpar(args.getJSONObject(0)).toString()
        "ver" -> ver(args.getString(0)).toString()
        "lixeira" -> lixeira().toString()
        "devolver" -> devolver(args.getString(0)).toString()
        "esvaziar_lixeira" -> esvaziarLixeira().toString()
        "historico" -> dados.historico().toString()
        "salvar_agenda" -> salvarAgenda(args.getJSONObject(0)).toString()
        else -> throw IllegalArgumentException("não conheço '$metodo'")
    }

    private fun responder(id: Int, ok: Boolean, valor: String) {
        tela.runOnUiThread { web.evaluateJavascript("Nativo_resposta($id,$ok,$valor)", null) }
    }

    private var ultimoProgresso = 0L
    private fun progresso(fase: String): Progresso = { feito, total, nome ->
        val agora = SystemClock.uptimeMillis()
        if (agora - ultimoProgresso > 60 || feito == total) {
            ultimoProgresso = agora
            val j = JSONObject().put("feito", feito).put("total", total).put("nome", nome).put("fase", fase)
            tela.runOnUiThread { web.evaluateJavascript("Faxina.progresso($j)", null) }
        }
    }

    // ------------------------------------------------------------ estado

    private fun espacoJson(): JSONObject {
        val (total, livre) = Sistema.espaco(tela)
        return JSONObject().put("total", total).put("livre", livre)
    }

    private fun estado(): JSONObject {
        val permissao = Sistema.podeVerArquivos(tela)
        var lixeira = JSONObject().put("tamanho", 0).put("itens", 0)
        if (permissao) {
            val expirou = motor.lixeira.expirar(System.currentTimeMillis())
            dados.registrar("expirou", expirou, 0, listOf(Triple("Lixeira da Faxina", expirou, 0L)))
            val e = motor.lixeira.entradas()
            lixeira = JSONObject().put("tamanho", e.sumOf { it.tamanho }).put("itens", e.size)
        }
        return JSONObject()
            .put("permissao", permissao)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("cache_apps", Build.VERSION.SDK_INT >= 30)
            .put("armazenamento", espacoJson())
            .put("ultima", dados.ultima())
            .put("agenda", dados.agendaJson())
            .put("lixeira", lixeira)
            .put(
                "categorias",
                JSONArray(
                    CATEGORIAS.map { c ->
                        JSONObject()
                            .put("id", c.id)
                            .put("nome", c.nome)
                            .put("descricao", c.descricao)
                            .put("grupo", c.grupo)
                            .put("icone", c.icone)
                            .put("nivel", if (c.nivel == Nivel.SEGURO) "seguro" else "revisar")
                            .put("destino", c.destino.name.lowercase())
                            .put("selecao_por_item", c.porItem)
                            .put("aviso", c.aviso)
                    },
                ),
            )
    }

    // ------------------------------------------------------------ análise e limpeza

    private fun relativo(f: File) = f.absolutePath.removePrefix(local.path).trimStart(File.separatorChar)

    private fun analisar(): JSONObject {
        val r = motor.analisar(progresso("analisar"))
        val cats = JSONObject()
        for ((id, a) in r) {
            cats.put(
                id,
                JSONObject()
                    .put("tamanho", a.tamanho)
                    .put("arquivos", a.arquivos)
                    .put("total_itens", a.itens.size)
                    .put("pulados_recentes", a.puladosRecentes)
                    .put("sem_permissao", a.semPermissao)
                    .put(
                        "itens",
                        JSONArray(
                            a.itens.take(MOSTRAR).map { i ->
                                JSONObject()
                                    .put("chave", i.chave)
                                    .put("nome", i.nome)
                                    .put("local", relativo(i.arquivo))
                                    .put("tamanho", i.tamanho)
                                    .put("arquivos", i.arquivos)
                                    .put("e_pasta", i.ePasta)
                                    .put("modificado", i.modificado / 1000)
                                    .put("enviado", i.arquivo.parentFile?.name == "Sent")
                            },
                        ),
                    ),
            )
        }
        return JSONObject().put("categorias", cats)
    }

    private fun limpar(escolhaJs: JSONObject): JSONObject {
        val escolha = LinkedHashMap<String, List<String>?>()
        for (id in escolhaJs.keys()) {
            val v = escolhaJs.opt(id)
            escolha[id] = if (v is JSONArray) List(v.length()) { v.getString(it) } else null
        }
        val r = motor.limpar(escolha, progresso("limpar"))
        val liberado = r.values.sumOf { it.liberado }
        val paraLixeira = r.values.sumOf { it.paraLixeira }
        dados.registrar(
            "manual",
            liberado,
            paraLixeira,
            r.values.map { Triple(POR_ID.getValue(it.categoria).nome, it.liberado, it.paraLixeira) },
        )
        val resultados = JSONObject()
        for ((id, x) in r) {
            resultados.put(
                id,
                JSONObject()
                    .put("liberado", x.liberado)
                    .put("para_lixeira", x.paraLixeira)
                    .put("apagados", x.apagados)
                    .put("pulados", x.pulados)
                    .put("erro", x.erro ?: JSONObject.NULL),
            )
        }
        return JSONObject()
            .put("liberado", liberado)
            .put("para_lixeira", paraLixeira)
            .put("resultados", resultados)
            .put("armazenamento", espacoJson())
            .put("ultima", dados.ultima())
    }

    /** Abre no app do celular (player, galeria, leitor de PDF) um arquivo da última análise. */
    private fun ver(chave: String): Boolean {
        val item = motor.item(chave) ?: return false
        if (item.ePasta || !item.arquivo.isFile) return false
        var abriu = false
        val pronto = java.util.concurrent.CountDownLatch(1)
        tela.runOnUiThread {
            abriu = tela.abrirArquivo(item.arquivo)
            pronto.countDown()
        }
        pronto.await()
        return abriu
    }

    // ------------------------------------------------------------ lixeira

    private fun lixeira(): JSONArray {
        val agora = System.currentTimeMillis()
        return JSONArray(
            motor.lixeira.entradas().map { e ->
                val pai = e.original?.parentFile
                val origem = when {
                    pai == null -> ""
                    pai.name == "Sent" -> (pai.parentFile?.name ?: "") + " (enviados)"
                    else -> pai.name
                }
                JSONObject()
                    .put("id", e.id)
                    .put("nome", e.nome)
                    .put("origem", origem)
                    .put("tamanho", e.tamanho)
                    .put("quando", e.quando / 1000)
                    .put("dias_restantes", (30 - (agora - e.quando) / (24L * 3_600_000)).coerceAtLeast(0))
            },
        )
    }

    private fun devolver(id: String): JSONObject {
        val destino = motor.devolver(id)
            ?: return JSONObject().put("ok", false).put("erro", "Não deu para devolver este item.")
        return JSONObject().put("ok", true).put("onde", destino.parentFile?.name ?: "")
    }

    private fun esvaziarLixeira(): JSONObject {
        val r = motor.esvaziarLixeira()
        dados.registrar("lixeira", r.liberado, 0, listOf(Triple("Lixeira da Faxina", r.liberado, 0L)))
        return JSONObject()
            .put("liberado", r.liberado)
            .put("pulados", r.pulados)
            .put("armazenamento", espacoJson())
            .put("ultima", dados.ultima())
    }

    // ------------------------------------------------------------ cache dos apps

    /** O Android 11+ limpa o cache de todos os apps de uma vez, perguntando antes na tela dele. */
    private fun limparCacheDosApps(id: Int) {
        if (Build.VERSION.SDK_INT < 30 || !Sistema.podeVerArquivos(tela)) {
            responder(id, true, JSONObject().put("ok", false).put("erro", "Este Android não tem essa opção.").toString())
            return
        }
        livreAntesDoCache = Sistema.espaco(tela).second
        if (tela.abrirLimpezaDeCache()) {
            pedidoCache = id
        } else {
            responder(id, true, JSONObject().put("ok", false).put("erro", "Este Android não tem essa opção.").toString())
        }
    }

    fun cacheTerminou(codigo: Int) {
        val id = pedidoCache ?: return
        pedidoCache = null
        fila.execute {
            Thread.sleep(800) // o número de espaço livre demora um instante para mudar
            val liberado = (Sistema.espaco(tela).second - livreAntesDoCache).coerceAtLeast(0)
            if (codigo == Activity.RESULT_OK) {
                dados.registrar("cache", liberado, 0, listOf(Triple("Cache dos aplicativos", liberado, 0L)))
            }
            val r = JSONObject()
                .put("ok", codigo == Activity.RESULT_OK)
                .put("cancelado", codigo == Activity.RESULT_CANCELED)
                .put("liberado", liberado)
                .put("armazenamento", espacoJson())
                .put("ultima", dados.ultima())
            responder(id, true, r.toString())
        }
    }

    // ------------------------------------------------------------ agenda e avisos

    private fun salvarAgenda(j: JSONObject): JSONObject {
        val nova = Dados.Agenda(
            ativo = j.optBoolean("ativo"),
            frequencia = if (j.optString("frequencia") == "semanal") "semanal" else "mensal",
            limiteGb = j.optDouble("limite_gb", 1.0).coerceIn(0.5, 20.0),
        )
        dados.salvarAgenda(nova, System.currentTimeMillis())
        Sistema.aplicarAgenda(tela, nova.ativo)
        if (nova.ativo && !Sistema.podeAvisar(tela)) tela.runOnUiThread { tela.pedirPermissaoDeAvisos() }
        return JSONObject().put("ok", true).put("agenda", dados.agendaJson())
    }

    private fun testarAviso(id: Int) {
        if (!Sistema.podeAvisar(tela)) {
            pedidoAviso = id
            tela.pedirPermissaoDeAvisos()
            return
        }
        mostrarAvisoDeTeste(id)
    }

    fun avisosRespondido(permitiu: Boolean) {
        val id = pedidoAviso ?: return
        pedidoAviso = null
        if (permitiu) {
            mostrarAvisoDeTeste(id)
        } else {
            responder(id, true, JSONObject().put("ok", false).put("erro", "Sem permissão para mandar notificações.").toString())
        }
    }

    private fun mostrarAvisoDeTeste(id: Int) {
        if (!Sistema.avisosLigados(tela)) {
            responder(id, true, JSONObject().put("ok", false).put("erro", "As notificações da Faxina estão desligadas nas Configurações.").toString())
            return
        }
        Sistema.avisar(tela, "Dá para liberar 2,3 GB no celular", "Este é só um teste. É assim que a Faxina vai te chamar.")
        responder(id, true, JSONObject().put("ok", true).toString())
    }

    companion object {
        /** Quantos itens de cada categoria vão para a tela. */
        const val MOSTRAR = 80
    }
}
