package cn.yhsun.md

/** Standalone JVM regression checks; no calendar permission or provider required. */
fun main() {
    val cutoff = 1893456000000L // 2030-01-01T00:00:00Z
    for (frequency in listOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY")) {
        check(CalendarRecurrence.build(frequency, 2, false, cutoff, cutoff - 86400000, true) == "FREQ=$frequency;INTERVAL=2;UNTIL=20300101T000000Z")
    }
    check(CalendarRecurrence.build("WEEKLY", 1, true, null, cutoff, false) == "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR")
    check(CalendarRecurrence.build("", 0, false, 0, cutoff, false) == "")
    for (interval in listOf(0, -1, 366)) {
        check(runCatching { CalendarRecurrence.build("DAILY", interval, false, null, cutoff, false) }.isFailure)
    }
    check(runCatching { CalendarRecurrence.build("DAILY", 1, false, cutoff - 1, cutoff, true) }.isFailure)
    check(runCatching { CalendarRecurrence.build("INVALID", 1, false, null, cutoff, true) }.isFailure)
    println("Calendar recurrence checks passed")
}
