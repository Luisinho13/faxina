package io.github.luisinho13.faxina

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Configuração e histórico, em JSON na pasta privada do app. */
class Dados(contexto: Context) {
    private val config = File(contexto.filesDir, "config.json")
    private val historico = File(contexto.filesDir, "historico.json")

    // ------------------------------------------------------------ agenda

    class Agenda(val ativo: Boolean, val frequencia: String, val limiteGb: Double) {
        val intervaloMs: Long get() = (if (frequencia == "semanal") 7L else 30L) * 24 * 3_600_000
    }

    fun agenda(): Agenda {
        val j = ler(config).optJSONObject("agenda") ?: JSONObject()
        return Agenda(
            ativo = j.optBoolean("ativo", false),
            frequencia = j.optString("frequencia", "mensal").takeIf { it == "semanal" || it == "mensal" } ?: "mensal",
            limiteGb = j.optDouble("limite_gb", 1.0).coerceIn(0.5, 20.0),
        )
    }

    fun ultimaVerificacao(): Long = ler(config).optLong("ultima_verificacao", 0)

    @Synchronized
    fun marcarVerificacao(quando: Long) {
        gravar(config, ler(config).put("ultima_verificacao", quando))
    }

    @Synchronized
    fun salvarAgenda(nova: Agenda, agora: Long) {
        val antes = agenda()
        val j = ler(config).put(
            "agenda",
            JSONObject().put("ativo", nova.ativo).put("frequencia", nova.frequencia).put("limite_gb", nova.limiteGb),
        )
        // Ligou agora: a primeira olhada é daqui a um intervalo, não já.
        if (nova.ativo && !antes.ativo) j.put("ultima_verificacao", agora)
        gravar(config, j)
    }

    fun agendaJson(): JSONObject {
        val a = agenda()
        return JSONObject()
            .put("ativo", a.ativo)
            .put("frequencia", a.frequencia)
            .put("limite_gb", a.limiteGb)
            .put("proxima", if (a.ativo) ultimaVerificacao() + a.intervaloMs else JSONObject.NULL)
    }

    // ------------------------------------------------------------ histórico

    fun historico(): JSONArray = try {
        JSONArray(historico.readText())
    } catch (e: Exception) {
        JSONArray()
    }

    /** modo: manual, cache, lixeira (esvaziada à mão) ou expirou (30 dias). */
    @Synchronized
    fun registrar(modo: String, liberado: Long, paraLixeira: Long, categorias: List<Triple<String, Long, Long>>) {
        if (liberado <= 0 && paraLixeira <= 0) return
        val lista = historico()
        lista.put(
            JSONObject()
                .put("quando", System.currentTimeMillis() / 1000)
                .put("modo", modo)
                .put("liberado", liberado)
                .put("para_lixeira", paraLixeira)
                .put(
                    "categorias",
                    JSONArray(categorias.map { (nome, l, p) -> JSONObject().put("nome", nome).put("liberado", l).put("para_lixeira", p) }),
                ),
        )
        gravar(historico, lista)
    }

    fun ultima(): Any {
        val lista = historico()
        for (i in lista.length() - 1 downTo 0) {
            val x = lista.getJSONObject(i)
            if (x.optLong("liberado") > 0) return JSONObject().put("quando", x.getLong("quando")).put("liberado", x.getLong("liberado"))
        }
        return JSONObject.NULL
    }

    // ------------------------------------------------------------ arquivos

    private fun ler(f: File): JSONObject = try {
        JSONObject(f.readText())
    } catch (e: Exception) {
        JSONObject()
    }

    private fun gravar(f: File, conteudo: Any) {
        val tmp = File(f.parentFile, f.name + ".tmp")
        tmp.writeText(conteudo.toString())
        if (!tmp.renameTo(f)) {
            f.delete()
            tmp.renameTo(f)
        }
    }
}
