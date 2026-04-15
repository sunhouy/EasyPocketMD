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
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val action = intent?.action
        val data = intent?.dataString
        if ((Intent.ACTION_VIEW == action || Intent.ACTION_EDIT == action) && data != null) {
            try {
                val file = java.io.File(cacheDir, "startup_intent.txt")
                file.writeText(data)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
