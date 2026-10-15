package io.github.luisinho13.faxina

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.app.usage.StorageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.storage.StorageManager
import java.io.File
import java.text.NumberFormat
import java.util.Locale

/** Permissões, espaço, galeria, avisos e agenda: o que fala com o Android. */
object Sistema {

    fun motor(ctx: Context) = Motor(
        Locais(Environment.getExternalStorageDirectory()),
        aoMover = { caminhos -> avisarGaleria(ctx, caminhos) },
    )

    // ------------------------------------------------------------ permissões

    fun podeVerArquivos(ctx: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 30) {
            Environment.isExternalStorageManager()
        } else {
            ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }

    fun podeAvisar(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    // ------------------------------------------------------------ espaço

    /** (total, livre) do armazenamento interno, como as Configurações mostram. */
    fun espaco(ctx: Context): Pair<Long, Long> = try {
        val s = ctx.getSystemService(StorageStatsManager::class.java)
        s.getTotalBytes(StorageManager.UUID_DEFAULT) to s.getFreeBytes(StorageManager.UUID_DEFAULT)
    } catch (e: Exception) {
        val st = StatFs(Environment.getDataDirectory().path)
        st.totalBytes to st.availableBytes
    }

    fun tamanho(b: Long): String {
        val gb = 1L shl 30
        val mb = 1L shl 20
        val nf = NumberFormat.getNumberInstance(Locale("pt", "BR"))
        return when {
            b >= gb -> nf.apply { maximumFractionDigits = 1; minimumFractionDigits = 1 }.format(b.toDouble() / gb) + " GB"
            b >= mb -> nf.apply { maximumFractionDigits = 0 }.format(b.toDouble() / mb) + " MB"
            else -> "menos de 1 MB"
        }
    }

    // ------------------------------------------------------------ galeria

    /** Arquivo mudou de lugar: a galeria precisa saber (no Android 11+ ela já sabe, mas não custa). */
    private fun avisarGaleria(ctx: Context, caminhos: List<File>) {
        val arquivos = caminhos.filter { it.isFile || !it.exists() }.map { it.absolutePath }
        if (arquivos.isNotEmpty()) MediaScannerConnection.scanFile(ctx, arquivos.toTypedArray(), null, null)
    }

    // ------------------------------------------------------------ avisos

    private const val CANAL = "faxina"

    fun avisar(ctx: Context, titulo: String, texto: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CANAL, "Avisos da Faxina", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Quando der para liberar espaço no celular."
            },
        )
        val abrir = PendingIntent.getActivity(
            ctx,
            0,
            Intent(ctx, MainActivity::class.java)
                .putExtra(MainActivity.EXTRA_ANALISAR, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(ctx, CANAL)
            .setSmallIcon(R.drawable.ic_aviso)
            .setColor(0xFF0F9D84.toInt())
            .setContentTitle(titulo)
            .setContentText(texto)
            .setStyle(Notification.BigTextStyle().bigText(texto))
            .setContentIntent(abrir)
            .setAutoCancel(true)
            .build()
        nm.notify(1, n)
    }

    fun avisosLigados(ctx: Context) = ctx.getSystemService(NotificationManager::class.java).areNotificationsEnabled()

    // ------------------------------------------------------------ agenda

    private const val TAREFA = 1

    /**
     * O Android não deixa marcar hora certa sem gastar bateria. A tarefa roda
     * uma vez a cada meio dia, quando ele achar bom, e o [Vigia] decide se já
     * passou a semana ou o mês.
     */
    fun aplicarAgenda(ctx: Context, ativo: Boolean) {
        val js = ctx.getSystemService(JobScheduler::class.java)
        if (!ativo) {
            js.cancel(TAREFA)
            return
        }
        js.schedule(
            JobInfo.Builder(TAREFA, ComponentName(ctx, Vigia::class.java))
                .setPeriodic(12L * 3_600_000)
                .setRequiresBatteryNotLow(true)
                .setPersisted(true)
                .build(),
        )
    }
}
