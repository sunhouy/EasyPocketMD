package cn.yhsun.md

import android.app.Activity
import androidx.appcompat.app.AlertDialog
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
    fun bind(dialog: Dialog) {
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
    fun context(activity: Activity, night: Boolean): Context = NativeMaterial.context(activity,night)

    fun show(activity: Activity, kind: String, title: String, message: String, defaultValue: String,
             placeholder: String, confirmText: String, cancelText: String, dismissible: Boolean,
             closeOnEsc: Boolean, showCancel: Boolean, danger: Boolean, night: Boolean,
             english: Boolean, complete: (Map<String, Any?>) -> Unit) {
        if (activity.isFinishing || activity.isDestroyed) { complete(mapOf("canceled" to true)); return }
        val context = context(activity, night)
        val holder = android.widget.LinearLayout(context).apply {orientation=android.widget.LinearLayout.VERTICAL;val p=NativeMaterial.dp(context,24);setPadding(p,p,p,p)}
        if(title.isNotBlank())holder.addView(NativeMaterial.label(context,title,22f).apply {setTypeface(typeface,android.graphics.Typeface.BOLD)},android.widget.LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,16)})
        val body=android.widget.LinearLayout(context).apply {orientation=android.widget.LinearLayout.VERTICAL}
        val warning=if(danger && kind=="confirm")"\n\n"+if(english)"This action cannot be undone." else "此操作不可撤销。" else ""
        if(message.isNotBlank() || warning.isNotBlank())body.addView(NativeMaterial.label(context,message+warning,16f),android.widget.LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=NativeMaterial.dp(context,16)})
        val input=if(kind=="prompt")NativeMaterial.field(body,defaultValue,placeholder).apply {selectAll()} else null
        val scroll=object:android.widget.ScrollView(context) {
            override fun onMeasure(width:Int,height:Int) {
                val cap=(resources.displayMetrics.heightPixels*.6f).toInt()
                val available=if(android.view.View.MeasureSpec.getMode(height)==android.view.View.MeasureSpec.UNSPECIFIED)cap else android.view.View.MeasureSpec.getSize(height)
                super.onMeasure(width,android.view.View.MeasureSpec.makeMeasureSpec(minOf(cap,available),android.view.View.MeasureSpec.AT_MOST))
            }
        }.apply {addView(body)}
        holder.addView(scroll)
        val footer=android.widget.LinearLayout(context).apply {orientation=android.widget.LinearLayout.HORIZONTAL;setPadding(0,NativeMaterial.dp(context,12),0,0)}
        val session=NativeDialogSession(activity,complete)
        val dialog=NativeMaterial.dialog(context).setView(holder).setCancelable(dismissible && closeOnEsc).create()
        if(kind in arrayOf("confirm","prompt") && showCancel)footer.addView(NativeMaterial.button(context,cancelText.ifBlank {if(english)"Cancel" else "取消"}).apply {setOnClickListener {dialog.dismiss()}},android.widget.LinearLayout.LayoutParams(0,-1,1f).apply {rightMargin=NativeMaterial.dp(context,8)})
        footer.addView(NativeMaterial.button(context,confirmText.ifBlank {if(english)"OK" else "确定"},true).apply {
            if(danger){backgroundTintList=android.content.res.ColorStateList.valueOf(android.graphics.Color.parseColor("#c62f38"));setTextColor(android.graphics.Color.WHITE)}
            setOnClickListener {session.accept(if(input!=null)input.text.toString() else true);dialog.dismiss()}
        },android.widget.LinearLayout.LayoutParams(0,-1,1f))
        holder.addView(footer,android.widget.LinearLayout.LayoutParams(-1,NativeMaterial.dp(context,60)))
        session.bind(dialog);dialog.setCanceledOnTouchOutside(false)
        dialog.setOnShowListener {
            NativeNavigation.dialogBack(dialog){if(dismissible && closeOnEsc)dialog.dismiss()}
            if(input!=null){input.requestFocus();dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);(activity.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(input,InputMethodManager.SHOW_IMPLICIT)}
        }
        dialog.show()
    }
}
