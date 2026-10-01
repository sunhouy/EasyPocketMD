package cn.yhsun.md

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import java.util.concurrent.Executors
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class DocumentArgs {
    lateinit var uri: String
    var content: String = ""
}

/** Keep SAF document URIs and grants; never translate them into storage paths. */
@TauriPlugin
class LocalDocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()

    @Command
    fun pick(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("text/plain", "text/markdown", "application/octet-stream"))
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }
        startActivityForResult(invoke, intent, "picked")
    }

    @ActivityCallback
    fun picked(invoke: Invoke, result: ActivityResult) {
        val data = result.data
        val uri = data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            invoke.resolve(JSObject().put("canceled", true))
            return
        }
        val grants = (data?.flags ?: 0) and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        try { activity.contentResolver.takePersistableUriPermission(uri, grants) } catch (_: SecurityException) { /* Some providers only grant session access; recheck on every open. */ }
        io.execute { invoke.resolve(readDocument(uri).put("canceled", false)) }
    }

    @Command
    fun read(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        io.execute {
            try { invoke.resolve(readDocument(Uri.parse(args.uri))) }
            catch (e: Exception) { invoke.reject(e.message ?: "Cannot open local document") }
        }
    }

    private fun readDocument(uri: Uri): JSObject {
        val out = JSObject().put("path", uri.toString()).put("localFileMode", "tauri")
        try {
            activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                if (cursor.moveToFirst()) out.put("name", cursor.getString(0))
            }
            val content = activity.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: throw IllegalStateException("Cannot read local document")
            out.put("content", content)
            // Probe edit access without truncating or changing the original file.
            activity.contentResolver.openFileDescriptor(uri, "rw")?.use { } ?: throw IllegalStateException("Document is not writable")
            out.put("success", true).put("writable", true)
        } catch (e: Exception) {
            out.put("success", false).put("writable", false).put("error", e.message ?: "Document permission unavailable")
        }
        return out
    }

    @Command
    fun write(invoke: Invoke) {
        val args = invoke.parseArgs(DocumentArgs::class.java)
        io.execute {
        try {
            activity.contentResolver.openOutputStream(Uri.parse(args.uri), "wt")?.use { it.write(args.content.toByteArray(Charsets.UTF_8)) }
                ?: throw IllegalStateException("Cannot save local document")
            invoke.resolve(JSObject().put("success", true).put("path", args.uri))
        } catch (e: Exception) {
            invoke.resolve(JSObject().put("success", false).put("path", args.uri).put("error", e.message ?: "Cannot save local document"))
        }
        }
    }
}
