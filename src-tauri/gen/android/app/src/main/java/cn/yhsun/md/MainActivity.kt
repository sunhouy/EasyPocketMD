package cn.yhsun.md

import android.os.Bundle
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 保持状态栏非沉浸布局，让内容不绘制到状态栏后方。
        WindowCompat.setDecorFitsSystemWindows(window, true)

        val decorView = window.decorView
        val rootView = decorView.findViewById<android.view.View>(android.R.id.content)

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
            val imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime())
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())

            view.updatePadding(
                bottom = if (imeInsets.bottom > 0) imeInsets.bottom else systemBars.bottom
            )
            insets
        }
    }
}
