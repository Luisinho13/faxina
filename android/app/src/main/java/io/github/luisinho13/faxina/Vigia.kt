package io.github.luisinho13.faxina

import android.app.job.JobParameters
import android.app.job.JobService

/**
 * A faxina automática. Só olha e avisa: no celular ela nunca apaga nada
 * sozinha (o que sai dá trabalho de recuperar, e o cache dos apps só sai com
 * a pessoa confirmando na tela do Android).
 */
class Vigia : JobService() {

    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
            try {
                trabalhar()
            } finally {
                jobFinished(params, false)
            }
        }.start()
        return true
    }

    override fun onStopJob(params: JobParameters) = true

    private fun trabalhar() {
        val dados = Dados(this)
        val agenda = dados.agenda()
        if (!agenda.ativo || !Sistema.podeVerArquivos(this)) return

        val agora = System.currentTimeMillis()
        val motor = Sistema.motor(this)
        val expirou = motor.lixeira.expirar(agora)
        dados.registrar("expirou", expirou, 0, listOf(Triple("Lixeira da Faxina", expirou, 0L)))

        // Folga de meio dia: a tarefa não roda na hora exata.
        if (agora - dados.ultimaVerificacao() < agenda.intervaloMs - 12L * 3_600_000) return

        val total = motor.analisar().values.sumOf { it.tamanho }
        dados.marcarVerificacao(agora)
        if (total >= agenda.limiteGb * (1L shl 30)) {
            Sistema.avisar(
                this,
                "Dá para liberar ${Sistema.tamanho(total)} no celular",
                "Toque para ver o que pode sair. Nada sai sem você ver antes.",
            )
        }
    }
}
