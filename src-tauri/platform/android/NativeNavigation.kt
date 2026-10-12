package cn.yhsun.md

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import org.json.JSONObject

object NativeNavigation {
    private var routing=false
    fun reset(){routing=false}
    private fun web(view: View): WebView? {
        if(view is WebView)return view
        if(view is ViewGroup)for(index in 0 until view.childCount)web(view.getChildAt(index))?.let { return it }
        return null
    }
    fun emit(activity: Activity, data: JSONObject) {
        web(activity.window.decorView)?.evaluateJavascript("window.dispatchEvent(new CustomEvent('epmd-native-ui',{detail:"+data.toString()+"}));",null)
    }
    fun dialogBack(dialog:android.app.Dialog,action:()->Unit) {
        dialog.setOnKeyListener {_,key,event->
            if(key==android.view.KeyEvent.KEYCODE_BACK){if(event.action==android.view.KeyEvent.ACTION_UP)action();true}else false
        }
        if(android.os.Build.VERSION.SDK_INT>=33) {
            val callback=android.window.OnBackInvokedCallback {action()}
            val dispatcher=dialog.window?.onBackInvokedDispatcher
            dispatcher?.registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,callback)
            dialog.setOnDismissListener {dispatcher?.unregisterOnBackInvokedCallback(callback)}
        }
    }
    fun back(activity: Activity) {
        if(routing)return
        val view=web(activity.window.decorView) ?: return
        routing=true
        view.evaluateJavascript("typeof window.epmdAndroidBack==='function'?window.epmdAndroidBack():true") { handled ->
            routing=false
            if(handled=="false" && !activity.isFinishing)activity.finish()
        }
    }
}
