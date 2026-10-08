package cn.yhsun.md

import android.graphics.Rect
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View

/** Keep WebView's selection handles; remove native actions only for custom text tools. */
object SelectionMenus {
    @Volatile var enabled: Boolean = false
    var current: ActionMode? = null

    fun wrap(delegate: ActionMode.Callback): ActionMode.Callback2 = object : ActionMode.Callback2() {
        override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
            val created = delegate.onCreateActionMode(mode, menu)
            current = mode
            if (enabled) menu.clear()
            return created
        }
        override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
            val prepared = delegate.onPrepareActionMode(mode, menu)
            if (enabled) menu.clear()
            return prepared || enabled
        }
        override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean =
            delegate.onActionItemClicked(mode, item)
        override fun onDestroyActionMode(mode: ActionMode) {
            if (current === mode) current = null
            delegate.onDestroyActionMode(mode)
        }
        override fun onGetContentRect(mode: ActionMode, view: View, rect: Rect) {
            if (delegate is ActionMode.Callback2) delegate.onGetContentRect(mode, view, rect)
            else super.onGetContentRect(mode, view, rect)
        }
    }
}
