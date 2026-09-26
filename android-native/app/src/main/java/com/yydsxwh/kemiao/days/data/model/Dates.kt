package com.yydsxwh.kemiao.days.data.model

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.time.temporal.TemporalAdjusters
import java.util.Locale

private val ISO = DateTimeFormatter.ISO_LOCAL_DATE
private val WEEKDAYS = listOf("日", "一", "二", "三", "四", "五", "六")
private val MONTHS = listOf("一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月")

fun todayIso(): String = LocalDate.now().format(ISO)

fun parseIsoDate(iso: String): LocalDate = LocalDate.parse(iso.take(10), ISO)

fun toIsoDate(date: LocalDate): String = date.format(ISO)

fun daysUntil(iso: String, from: LocalDate = LocalDate.now()): Long =
    ChronoUnit.DAYS.between(from, parseIsoDate(iso))

fun nextOccurrence(iso: String, repeatYearly: Boolean, from: LocalDate = LocalDate.now()): String {
    if (!repeatYearly) return iso
    val origin = parseIsoDate(iso)
    var next = LocalDate.of(from.year, origin.month, origin.dayOfMonth.coerceAtMost(origin.month.length(from.isLeapYear)))
    if (next.isBefore(from)) {
        val y = from.year + 1
        next = LocalDate.of(y, origin.month, origin.dayOfMonth.coerceAtMost(origin.month.length(y % 4 == 0)))
    }
    return toIsoDate(next)
}

fun formatLong(date: LocalDate = LocalDate.now()): String {
    val week = WEEKDAYS[date.dayOfWeek.value % 7]
    return "${date.year} 年 ${MONTHS[date.monthValue - 1]} ${date.dayOfMonth} 日 星期$week"
}

fun formatShort(iso: String): String {
    val date = parseIsoDate(iso)
    return "${date.monthValue} 月 ${date.dayOfMonth} 日"
}

fun greeting(now: LocalTime = LocalTime.now()): String = when (now.hour) {
    in 5..10 -> "早上好"
    in 11..13 -> "中午好"
    in 14..17 -> "下午好"
    else -> "晚上好"
}

fun weekdayOf(iso: String): Int {
    val d = parseIsoDate(iso).dayOfWeek
    return if (d == DayOfWeek.SUNDAY) 7 else d.value
}

fun startOfWeek(date: LocalDate = LocalDate.now(), weekStartsOn: Int = 1): LocalDate {
    val first = if (weekStartsOn == 7) DayOfWeek.SUNDAY else DayOfWeek.MONDAY
    return date.with(TemporalAdjusters.previousOrSame(first))
}

fun daysInMonth(year: Int, month: Int): Int = LocalDate.of(year, month, 1).lengthOfMonth()

fun formatRecurrence(rule: RecurrenceRule): String {
    if (rule.kind != "interval") {
        return when (rule.kind) {
            "term" -> "学期规则（尚未启用）"
            "season" -> "季节/事件规则（尚未启用）"
            "onThisDay" -> "那年今日（尚未启用）"
            else -> "未设置周期"
        }
    }
    val interval = rule.interval ?: 1
    val unit = rule.unit ?: "year"
    if (interval == 1) {
        return when (unit) {
            "day" -> "每天"
            "week" -> "每周"
            "month" -> "每月"
            else -> "每年"
        }
    }
    return when (unit) {
        "day" -> "每 $interval 天"
        "week" -> "每 $interval 周"
        "month" -> "每 $interval 个月"
        else -> "每 $interval 年"
    }
}

fun addCalendarMonths(date: LocalDate, months: Int): LocalDate = date.plusMonths(months.toLong())

fun occursOn(item: RecurringReminder, iso: String): Boolean {
    if (item.rule.kind != "interval") return false
    val interval = item.rule.interval ?: return false
    if (interval <= 0) return false
    val unit = item.rule.unit ?: return false
    val day = parseIsoDate(iso)
    val start = parseIsoDate(item.startDate)
    if (day.isBefore(start)) return false
    if (!item.neverEnds && !item.endDate.isNullOrBlank() && day.isAfter(parseIsoDate(item.endDate))) return false
    var cursor = start
    var guard = 0
    while (!cursor.isAfter(day) && guard < 4000) {
        if (cursor == day) return true
        cursor = when (unit) {
            "day" -> cursor.plusDays(interval.toLong())
            "week" -> cursor.plusWeeks(interval.toLong())
            "month" -> addCalendarMonths(cursor, interval)
            "year" -> addCalendarMonths(cursor, interval * 12)
            else -> return false
        }
        guard++
    }
    return false
}

fun eventMatchesDate(event: CalendarEvent, iso: String): Boolean {
    if (event.date == iso) return true
    return when (event.repeat) {
        "daily" -> !parseIsoDate(iso).isBefore(parseIsoDate(event.date))
        "weekly" -> weekdayOf(event.date) == weekdayOf(iso) && !parseIsoDate(iso).isBefore(parseIsoDate(event.date))
        "monthly" -> parseIsoDate(event.date).dayOfMonth == parseIsoDate(iso).dayOfMonth && !parseIsoDate(iso).isBefore(parseIsoDate(event.date))
        "yearly" -> {
            val a = parseIsoDate(event.date)
            val b = parseIsoDate(iso)
            a.month == b.month && a.dayOfMonth == b.dayOfMonth && !b.isBefore(a)
        }
        else -> false
    }
}

fun termLabel(term: Term): String {
    if (!term.title.isNullOrBlank()) return term.title
    val kind = TERM_KIND_LABEL[term.kind] ?: term.kind
    return "${term.yearStart}-${term.yearStart + 1} $kind"
}

fun currentAcademicYearStart(date: LocalDate = LocalDate.now()): Int =
    if (date.monthValue >= 8) date.year else date.year - 1

fun guessTermKind(date: LocalDate = LocalDate.now()): String = when (date.monthValue) {
    in 8..12 -> "fall"
    in 2..6 -> "spring"
    7 -> "summer"
    else -> "winter"
}

fun defaultWeekCount(kind: String): Int = when (kind) {
    "summer", "winter" -> 4
    "practice", "intern" -> 8
    else -> 16
}

fun formatDateTime(iso: String?, time: String?): String {
    if (iso.isNullOrBlank()) return ""
    return listOf(formatShort(iso), time.orEmpty()).filter { it.isNotBlank() }.joinToString(" ")
}

fun nowMillis(): Long = System.currentTimeMillis()

fun LocalDateTime.toStamp(): Long = this.atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
