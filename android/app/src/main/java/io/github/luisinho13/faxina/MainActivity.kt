package io.github.luisinho13.faxina

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.storage.StorageManager
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.File
import kotlin.math.roundToInt

/**
 * Uma janela só, com a tela em HTML (assets/ui), como no PC. A página vai de
 * ponta a ponta da tela; as barras do sistema viram margens em CSS
 * (--topo e --base), passadas por `Faxina.moldura`.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var ponte: Ponte
    private var topo = 0
    private var base = 0

    private val escuro: Boolean
        get() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    private val tema get() = if (escuro) "escuro" else "claro"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        web = WebView(this).apply {
            setBackgroundColor(corDeFundo())
            settings.javaScriptEnabled = true
            settings.allowFileAccess = false // os assets abrem mesmo assim
            settings.allowContentAccess = false
            // Respeita a fonte grande do celular, sem deixar a tela desmontar.
            settings.textZoom = (resources.configuration.fontScale * 100).roundToInt().coerceIn(100, 130)
            webViewClient = object : WebViewClient() {
                // A página nunca sai do app.
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest) = true
                override fun onPageFinished(v: WebView, url: String) = aplicarMolduras()
            }
        }
        ponte = Ponte(this, web)
        web.addJavascriptInterface(ponte, "Nativo")
        setContentView(web)
        telaInteira()
        web.setOnApplyWindowInsetsListener { _, insets ->
            lerMolduras(insets)
            aplicarMolduras()
            insets
        }
        val analisar = if (intent.getBooleanExtra(EXTRA_ANALISAR, false)) "&analisar=1" else ""
        web.loadUrl("file:///android_asset/ui/index.html?tema=$tema$analisar")
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getBooleanExtra(EXTRA_ANALISAR, false)) {
            web.evaluateJavascript("window.Faxina&&Faxina.analisarAgora()", null)
        }
    }

    override fun onResume() {
        super.onResume()
        // Volta das Configurações (permissão) ou de outro app: a tela confere de novo.
        if (::web.isInitialized) web.evaluateJavascript("window.Faxina&&Faxina.voltou()", null)
    }

    override fun onConfigurationChanged(nova: Configuration) {
        super.onConfigurationChanged(nova)
        web.setBackgroundColor(corDeFundo())
        telaInteira()
        aplicarMolduras()
    }

    @Deprecated("O botão voltar passa primeiro pela tela (fecha a janelinha, volta para a Limpeza).")
    override fun onBackPressed() {
        web.evaluateJavascript("window.Faxina?Faxina.voltar():false") { tratou ->
            @Suppress("DEPRECATION")
            if (tratou != "true") super.onBackPressed()
        }
    }

    // ------------------------------------------------------------ moldura

    private fun corDeFundo() = if (escuro) Color.parseColor("#0e1116") else Color.parseColor("#f4f6f8")

    @Suppress("DEPRECATION")
    private fun telaInteira() {
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
            val claras = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            window.insetsController?.setSystemBarsAppearance(if (escuro) 0 else claras, claras)
        } else {
            var flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            if (!escuro) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            window.decorView.systemUiVisibility = flags
        }
    }

    @Suppress("DEPRECATION")
    private fun lerMolduras(insets: WindowInsets) {
        val d = resources.displayMetrics.density
        if (Build.VERSION.SDK_INT >= 30) {
            val b = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            topo = (b.top / d).roundToInt()
            base = (b.bottom / d).roundToInt()
        } else {
            topo = (insets.systemWindowInsetTop / d).roundToInt()
            base = (insets.systemWindowInsetBottom / d).roundToInt()
        }
    }

    private fun aplicarMolduras() {
        web.evaluateJavascript("window.Faxina&&Faxina.moldura($topo,$base,'$tema')", null)
    }

    // ------------------------------------------------------------ pedidos ao Android

    fun pedirPermissaoDeArquivos() {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
            } catch (e: ActivityNotFoundException) {
                startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
            }
        } else {
            requestPermissions(arrayOf(Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE), PEDIDO_ARQUIVOS)
        }
    }

    fun pedirPermissaoDeAvisos() {
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PEDIDO_AVISOS)
        else ponte.avisosRespondido(true)
    }

    fun abrirLimpezaDeCache(): Boolean {
        if (Build.VERSION.SDK_INT < 30) return false
        return try {
            @Suppress("DEPRECATION")
            startActivityForResult(Intent(StorageManager.ACTION_CLEAR_APP_CACHE), PEDIDO_CACHE)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    fun abrirArquivo(f: File): Boolean {
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(Vitrine.endereco(this, f), Vitrine.tipo(f.name))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return try {
            startActivity(intent)
            true
        } catch (e: ActivityNotFoundException) {
            false
        }
    }

    @Deprecated("startActivityForResult é o que o ACTION_CLEAR_APP_CACHE pede.")
    override fun onActivityResult(pedido: Int, codigo: Int, dados: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(pedido, codigo, dados)
        if (pedido == PEDIDO_CACHE) ponte.cacheTerminou(codigo)
    }

    override fun onRequestPermissionsResult(pedido: Int, permissoes: Array<out String>, resultados: IntArray) {
        super.onRequestPermissionsResult(pedido, permissoes, resultados)
        if (pedido == PEDIDO_AVISOS) ponte.avisosRespondido(Sistema.podeAvisar(this))
        if (pedido == PEDIDO_ARQUIVOS) web.evaluateJavascript("window.Faxina&&Faxina.voltou()", null)
    }

    companion object {
        const val EXTRA_ANALISAR = "analisar"
        private const val PEDIDO_ARQUIVOS = 1
        private const val PEDIDO_AVISOS = 2
        private const val PEDIDO_CACHE = 3
    }
}
