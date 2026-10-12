package cn.yhsun.md

import android.app.Activity
import android.app.AlertDialog
import android.app.Application
import android.app.Dialog
import android.os.Bundle
import android.content.Context
import android.view.ContextThemeWrapper
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.EditText

/** Native dialogs settle once, including Back, cancellation, and activity destruction. */
class NativeDialogSession(private val activity: Activity, private val complete: (Map<String, Any?>) -> Unit) : Application.ActivityLifecycleCallbacks {
    private var settled = false
    private var result: Map<String, Any?> = mapOf("canceled" to true, "value" to false)
    private val dialogs = mutableListOf<Dialog>()
    init { activity.application.registerActivityLifecycleCallbacks(this) }
    fun attach(dialog: Dialog) { dialogs.add(dialog) }
    fun bind(dialog: AlertDialog) {
        attach(dialog)
        dialog.setOnDismissListener { finish() }
    }
    fun accept(value: Any?) { result = mapOf("canceled" to false, "value" to value) }
    private fun finish() {
        if (settled) return
        settled = true
        activity.application.unregisterActivityLifecycleCallbacks(this)
        dialogs.forEach { if (it.isShowing) it.dismiss() }
        complete(result)
    }
    override fun onActivityDestroyed(owner: Activity) { if (owner === activity) finish() }
    override fun onActivityCreated(owner: Activity, state: Bundle?) {}
    override fun onActivityStarted(owner: Activity) {}
    override fun onActivityResumed(owner: Activity) {}
    override fun onActivityPaused(owner: Activity) {}
    override fun onActivityStopped(owner: Activity) {}
    override fun onActivitySaveInstanceState(owner: Activity, state: Bundle) {}
}

object NativeDialogs {
    fun context(activity: Activity, night: Boolean): Context = ContextThemeWrapper(activity,
        if (night) android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert)

    fun show(activity: Activity, kind: String, title: String, message: String, defaultValue: String,
             placeholder: String, confirmText: String, cancelText: String, dismissible: Boolean,
             closeOnEsc: Boolean, showCancel: Boolean, danger: Boolean, night: Boolean,
             english: Boolean, complete: (Map<String, Any?>) -> Unit) {
        if (activity.isFinishing || activity.isDestroyed) { complete(mapOf("canceled" to true)); return }
        val context = context(activity, night)
        val input = if (kind == "prompt") EditText(context).apply {
            setSingleLine(true); setText(defaultValue); hint = placeholder; selectAll()
        } else null
        val warning = if (danger && kind == "confirm") "\n\n" + if (english) "This action cannot be undone." else "此操作不可撤销。" else ""
        val session = NativeDialogSession(activity, complete)
        val builder = AlertDialog.Builder(context).setTitle(title).setMessage(message + warning)
            .setCancelable(dismissible && closeOnEsc)
            .setPositiveButton(confirmText) { _, _ -> session.accept(if (input != null) input.text.toString() else true) }
        if (input != null) builder.setView(input)
        if (kind in arrayOf("confirm", "prompt") && showCancel) builder.setNegativeButton(cancelText) { _, _ -> }
        val dialog = builder.create()
        session.bind(dialog)
        dialog.setCanceledOnTouchOutside(false)
        dialog.setOnShowListener {
            if (danger) dialog.getButton(AlertDialog.BUTTON_POSITIVE).setTextColor(android.graphics.Color.rgb(190, 35, 35))
            if (input != null) {
                input.requestFocus()
                dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
                (activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
            }
        }
        dialog.show()
    }
}
