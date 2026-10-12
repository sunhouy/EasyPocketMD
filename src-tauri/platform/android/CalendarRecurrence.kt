package cn.yhsun.md

import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
import java.util.Date

/** Provider recurrence strings are generated and validated on the native side. */
object CalendarRecurrence {
    fun build(frequency: String, interval: Int, weekdays: Boolean, until: Long?, start: Long, english: Boolean): String {
        if (frequency.isEmpty()) return ""
        require(frequency in listOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY")) { "Invalid recurrence frequency" }
        require(interval in 1..365) { if (english) "Repeat interval must be 1–365" else "重复间隔必须为 1–365" }
        var rule = "FREQ=$frequency;INTERVAL=$interval" + if (weekdays) ";BYDAY=MO,TU,WE,TH,FR" else ""
        until?.let {
            require(it >= start) { if (english) "Repeat end must not precede start" else "截止日期不能早于开始时间" }
            rule += ";UNTIL=" + SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(it))
        }
        return rule
    }
}
