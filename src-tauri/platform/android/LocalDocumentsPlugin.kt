package cn.yhsun.md

import java.util.ArrayDeque
import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Environment
import android.provider.Settings
import android.provider.DocumentsContract
import java.io.File
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
class StorageArgs { var force: Boolean = false }

@InvokeArg
class DocumentArgs {
    lateinit var uri: String
    var content: String = ""
}

/** Shared by MainActivity and the Rust plugin; independent of platform cache paths. */
object IncomingDocuments {
    private val queue = ArrayDeque<String>()
    @Synchronized fun enqueue(uri: String) { queue.addLast(uri) }
    @Synchronized fun consume(): String? = if (queue.isEmpty()) null else queue.removeFirst()
}

/** Reuse persistent grants and, when authorized, shared-storage paths. */
@TauriPlugin
class LocalDocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newSingleThreadExecutor()

    @Command
    fun storageAccess(invoke: Invoke) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            invoke.resolve(JSObject().put("granted", false)); return
        }
        if (Environment.isExternalStorageManager()) {
            invoke.resolve(JSObject().put("granted", true)); return
        }
        val prefs = activity.getSharedPreferences("local-documents", Activity.MODE_PRIVATE)
        // A declined request must never repeatedly interrupt startup or file saves.
        if (!invoke.parseArgs(StorageArgs::class.java).force && prefs.getBoolean("storage-access-requested", false)) {
            invoke.resolve(JSObject().put("granted", false)); return
        }
        prefs.edit().putBoolean("storage-access-requested", true).apply()
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + activity.packageName))
        try { startActivityForResult(invoke, intent, "storageAccessResult") }
        catch (_: Exception) { invoke.resolve(JSObject().put("granted", false)) }
    }

    @ActivityCallback
    fun storageAccessResult(invoke: Invoke, result: ActivityResult) {
        invoke.resolve(JSObject().put("granted", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()))
    }

    private fun sharedFile(uri: Uri): File? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R || !Environment.isExternalStorageManager()) return null
        if (uri.scheme == "file") return uri.path?.let { File(it) }
        if (uri.authority != "com.android.externalstorage.documents") return null
        return try {
            val parts = DocumentsContract.getDocumentId(uri).split(":", limit = 2)
            if (parts.size != 2) return null
            val root = when {
                parts[0] == "primary" -> Environment.getExternalStorageDirectory().canonicalFile
                parts[0].matches(Regex("[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}")) -> File("/storage", parts[0]).canonicalFile
                else -> return null
            }
            val file = File(root, parts[1]).canonicalFile
            if (file.path.startsWith(root.path + File.separator)) file else null
        } catch (_: Exception) { null }
    }

    @Command
    fun consumeIntent(invoke: Invoke) {
        invoke.resolve(JSObject().put("path", IncomingDocuments.consume()))
    }

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
            val direct = sharedFile(uri)
            if (direct != null && direct.isFile) {
                return out.put("path", direct.path).put("name", direct.name).put("content", direct.readText(Charsets.UTF_8)).put("success", true).put("writable", direct.canWrite())
            }
            try {
                if (uri.scheme == "content") activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) out.put("name", cursor.getString(0))
                }
            } catch (_: Exception) { /* A missing display-name query must not block reading. */ }
            if (!out.has("name")) out.put("name", uri.lastPathSegment ?: "document.md")
            val content = activity.contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                ?: throw IllegalStateException("Cannot read local document")
            out.put("content", content)
            // Probe edit access without truncating or changing the original file.
            val writable = try { activity.contentResolver.openFileDescriptor(uri, "rw")?.use { true } ?: false } catch (_: Exception) { false }
            out.put("success", true).put("writable", writable)
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
            val uri = Uri.parse(args.uri)
            val direct = sharedFile(uri)
            if (direct != null) {
                direct.writeText(args.content, Charsets.UTF_8)
            } else {
                activity.contentResolver.openOutputStream(uri, "wt")?.use { it.write(args.content.toByteArray(Charsets.UTF_8)) }
                    ?: throw IllegalStateException("Cannot save local document")
            }
            invoke.resolve(JSObject().put("success", true).put("path", args.uri))
        } catch (e: Exception) {
            invoke.resolve(JSObject().put("success", false).put("path", args.uri).put("error", e.message ?: "Cannot save local document"))
        }
        }
    }
}
