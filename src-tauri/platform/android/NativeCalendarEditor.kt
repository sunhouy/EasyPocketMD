package cn.yhsun.md

import android.app.Activity
import androidx.appcompat.app.AlertDialog
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.widget.*
import java.util.Calendar
import java.util.concurrent.Executor

/** Form, pickers, validation, and recurrence editing run in Kotlin. */
object NativeCalendarEditor {
    data class WritableCalendar(val id: Long, val name: String)
    fun show(activity: Activity, calendars: List<WritableCalendar>, title: String, description: String,
             english: Boolean, night: Boolean, io: Executor, save: (CalendarTodoArgs) -> String,
             complete: (Map<String, Any?>) -> Unit) {
        if (activity.isFinishing || activity.isDestroyed) { complete(mapOf("canceled" to true)); return }
        val context = NativeDialogs.context(activity, night)
        fun t(zh: String, en: String) = if (english) en else zh
        val layout = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; val padding = (20 * resources.displayMetrics.density).toInt(); setPadding(padding, padding, padding, padding) }
        fun label(text: String) { layout.addView(NativeMaterial.label(context,text)) }
        fun input(caption: String, value: String, lines: Int = 1): EditText {
            label(caption)
            return NativeMaterial.field(layout,value,"",lines>1)

        }
        label(t("日历", "Calendar"))
        val calendar = Spinner(context).apply { adapter = NativeMaterial.spinnerAdapter(context,calendars.map {it.name}) }; layout.addView(calendar)
        val name = input(t("标题", "Title"), title).apply { filters = arrayOf(InputFilter.LengthFilter(500)) }
        val body = input(t("内容（纯文本）", "Details (plain text)"), description, 4)
        val useDocument = NativeMaterial.button(context,"").apply { text = t("使用当前文档内容", "Use document content"); setOnClickListener { body.setText(description) } }; layout.addView(useDocument)
        val start = Calendar.getInstance().apply { add(Calendar.HOUR_OF_DAY, 1); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val end = (start.clone() as Calendar).apply { add(Calendar.HOUR_OF_DAY, 1) }
        val session = NativeDialogSession(activity, complete)
        val editable = mutableListOf<View>(calendar, name, body, useDocument)
        fun timeButton(text: String, date: Calendar): Button {
            val button = NativeMaterial.button(context,"")
            fun update() { button.text = text + "\n" + java.text.DateFormat.getDateTimeInstance(java.text.DateFormat.SHORT, java.text.DateFormat.SHORT).format(date.time) }
            update()
            button.setOnClickListener {
                val chosen = date.clone() as Calendar
                NativePickers.date(activity,context,text,chosen,session) {year,month,day ->
                    chosen.set(year,month,day)
                    NativePickers.time(activity,context,text,chosen,session) {hour,minute ->
                        chosen.set(Calendar.HOUR_OF_DAY,hour);chosen.set(Calendar.MINUTE,minute)
                        date.timeInMillis=chosen.timeInMillis;update()
                    }
                }
            }
            layout.addView(button); editable.add(button); return button
        }
        timeButton(t("开始时间", "Start"), start); timeButton(t("结束时间", "End"), end)
        label(t("重复规则", "Repeat"))
        val frequencies = listOf("", "DAILY", "WEEKLY", "WEEKLY", "MONTHLY", "YEARLY")
        val repeat = Spinner(context).apply { adapter = NativeMaterial.spinnerAdapter(context,
            if (english) listOf("Never", "Daily", "Weekdays", "Weekly", "Monthly", "Yearly") else listOf("不重复", "每天", "工作日", "每周", "每月", "每年")) }; layout.addView(repeat); editable.add(repeat)
        val repeatOptions = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL; visibility = View.GONE }; layout.addView(repeatOptions)
        repeatOptions.addView(NativeMaterial.label(context,t("重复间隔（1–365）", "Repeat interval (1–365)")))
        val interval = NativeMaterial.field(repeatOptions,"1","").apply { inputType=InputType.TYPE_CLASS_NUMBER }; editable.add(interval)
        var until: Calendar? = null
        val cutoff = NativeMaterial.button(context,"").apply { text = t("重复截止日期（可选）", "Repeat until (optional)") }; repeatOptions.addView(cutoff); editable.add(cutoff)
        cutoff.setOnClickListener {
            val date = until ?: start
            NativePickers.date(activity,context,t("重复截止日期","Repeat until"),date,session) {year,month,day ->
                until=Calendar.getInstance().apply {set(year,month,day,23,59,59);set(Calendar.MILLISECOND,0)}
                cutoff.text=java.text.DateFormat.getDateInstance().format(until!!.time)
            }
        }
        repeatOptions.addView(NativeMaterial.button(context,"").apply { text = t("清除截止日期", "Clear end date"); setOnClickListener { until = null; cutoff.text = t("重复截止日期（可选）", "Repeat until (optional)") }; editable.add(this) })
        repeat.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) { repeatOptions.visibility = if (position == 0) View.GONE else View.VISIBLE }
            override fun onNothingSelected(parent: AdapterView<*>?) {}
        }
        val error = TextView(context).apply { setTextColor(NativeMaterial.danger); accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }; layout.addView(error)
        val scroll = ScrollView(context).apply { addView(layout) }
        val dialog = NativeMaterial.dialog(context).setTitle(t("添加日程", "Add to calendar")).setView(scroll)
            .setPositiveButton(t("写入日历", "Add to calendar"), null).setNegativeButton(t("取消", "Cancel"), null).create()
        session.bind(dialog); dialog.setCanceledOnTouchOutside(false)
        dialog.setOnShowListener {
            NativeMaterial.dialogButtons(dialog)
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                try {
                    require(name.text.toString().trim().isNotEmpty()) { t("请输入标题", "Enter a title") }
                    require(end.timeInMillis > start.timeInMillis) { t("结束时间必须晚于开始时间", "End must be later than start") }
                    val position = repeat.selectedItemPosition
                    val rule = CalendarRecurrence.build(frequencies[position], interval.text.toString().toIntOrNull() ?: 0,
                        position == 2, until?.timeInMillis, start.timeInMillis, english)
                    val args = CalendarTodoArgs().apply { calendarId = calendars[calendar.selectedItemPosition].id; this.title = name.text.toString().trim(); this.description = body.text.toString(); this.start = start.timeInMillis; this.end = end.timeInMillis; rrule = rule }
                    error.text = ""; dialog.setCancelable(false)
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = false; dialog.getButton(AlertDialog.BUTTON_NEGATIVE).isEnabled = false
                    editable.forEach { it.isEnabled = false }
                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).text = t("正在保存…", "Saving…")
                    io.execute {
                        try {
                            val uri = save(args)
                            activity.runOnUiThread { session.accept(uri); dialog.dismiss() }
                        } catch (failure: Exception) {
                            activity.runOnUiThread {
                                if (dialog.isShowing) {
                                    error.text = failure.message; dialog.setCancelable(true)
                                    dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled = true; dialog.getButton(AlertDialog.BUTTON_NEGATIVE).isEnabled = true
                                    editable.forEach { it.isEnabled = true }; dialog.getButton(AlertDialog.BUTTON_POSITIVE).text = t("写入日历", "Add to calendar")
                                }
                            }
                        }
                    }
                } catch (failure: Exception) { error.text = failure.message }
            }
        }
        dialog.show()
    }
}
