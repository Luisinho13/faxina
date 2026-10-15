package io.github.luisinho13.faxina

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import java.io.File
import java.io.FileNotFoundException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Deixa outro app (o player, o leitor de PDF) abrir um arquivo da análise,
 * só para ver. Cada arquivo ganha um endereço sorteado; nada fora dessa lista
 * é servido, e nunca para escrita.
 */
class Vitrine : ContentProvider() {

    companion object {
        private val liberados = ConcurrentHashMap<String, File>()

        fun endereco(ctx: Context, f: File): Uri {
            val ficha = UUID.randomUUID().toString()
            liberados[ficha] = f
            return Uri.Builder()
                .scheme("content")
                .authority("${ctx.packageName}.vitrine")
                .appendPath(ficha)
                .appendPath(f.name)
                .build()
        }

        fun tipo(nome: String?): String =
            MimeTypeMap.getSingleton().getMimeTypeFromExtension(nome.orEmpty().substringAfterLast('.', "").lowercase())
                ?: "application/octet-stream"
    }

    private fun arquivo(uri: Uri): File =
        uri.pathSegments.firstOrNull()?.let { liberados[it] } ?: throw FileNotFoundException(uri.toString())

    override fun onCreate() = true

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("só leitura")
        return ParcelFileDescriptor.open(arquivo(uri), ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri) = tipo(uri.lastPathSegment)

    override fun query(uri: Uri, projection: Array<out String>?, sel: String?, args: Array<out String>?, ordem: String?): Cursor {
        val f = arquivo(uri)
        val colunas = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(colunas).apply {
            addRow(
                colunas.map {
                    when (it) {
                        OpenableColumns.DISPLAY_NAME -> f.name
                        OpenableColumns.SIZE -> f.length()
                        else -> null
                    }
                },
            )
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, sel: String?, args: Array<out String>?) = 0
    override fun delete(uri: Uri, sel: String?, args: Array<out String>?) = 0
}
