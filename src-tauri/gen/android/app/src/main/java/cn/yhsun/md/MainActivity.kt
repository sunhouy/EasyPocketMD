package cn.yhsun.md

import android.os.Bundle
import android.content.Intent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleIntent(intent)

        val decorView = window.decorView
        val rootView = decorView.findViewById<android.view.View>(android.R.id.content)

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { v, insets ->
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            v.updatePadding(
                top = systemBars.top,
                bottom = if (imeInsets.bottom > 0) imeInsets.bottom else systemBars.bottom
            )
            insets
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        if (intent == null || intent.action !in arrayOf(Intent.ACTION_VIEW, Intent.ACTION_EDIT, Intent.ACTION_SEND)) return
        val uri = intent.data ?: intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)
            ?: intent.clipData?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.uri ?: return
        val grants = intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (intent.flags and Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION != 0) {
            try { contentResolver.takePersistableUriPermission(uri, grants) } catch (_: SecurityException) { }
        }
        IncomingDocuments.enqueue(uri.toString())
    }
}
