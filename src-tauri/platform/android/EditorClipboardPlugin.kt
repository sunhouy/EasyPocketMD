package cn.yhsun.md

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class EditorClipboardArgs { var text: String = ""; var html: String? = null }

/** User-triggered editor copy/paste; no storage or system permission changes. */
@TauriPlugin
class EditorClipboardPlugin(private val activity: Activity) : Plugin(activity) {
    @Command
    fun write(invoke: Invoke) {
        val args = invoke.parseArgs(EditorClipboardArgs::class.java)
        activity.runOnUiThread {
            try {
                val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                clipboard.setPrimaryClip(if (args.html.isNullOrEmpty()) ClipData.newPlainText("EasyPocketMD", args.text)
                    else ClipData.newHtmlText("EasyPocketMD", args.text, args.html))
                invoke.resolve(JSObject().put("success", true))
            } catch (error: Exception) { invoke.reject(error.message ?: "Copy failed") }
        }
    }
    @Command
    fun read(invoke: Invoke) {
        activity.runOnUiThread {
            try {
                val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = clipboard.primaryClip
                val text = if (clip != null && clip.itemCount > 0) clip.getItemAt(0).coerceToText(activity).toString() else ""
                invoke.resolve(JSObject().put("text", text))
            } catch (error: Exception) { invoke.reject(error.message ?: "Paste failed") }
        }
    }
}
