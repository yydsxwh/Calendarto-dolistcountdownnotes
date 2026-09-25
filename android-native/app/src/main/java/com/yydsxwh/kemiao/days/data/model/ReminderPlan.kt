package com.yydsxwh.kemiao.days.data.model

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.format.DateTimeFormatter

data class FirePlan(
    val ruleId: String,
    val occurrenceKey: String,
    val fireAt: LocalDateTime,
    val title: String,
    val delivery: String,
)

private val clock = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")

fun parseLocalDateTime(value: String?): LocalDateTime? {
    if (value.isNullOrBlank()) return null
    val text = value.replace(' ', 'T')
    return runCatching {
        if (text.length == 10) LocalDateTime.of(LocalDate.parse(text), LocalTime.of(9, 0))
        else if (text.length == 16) LocalDateTime.parse("${text.take(16)}:00")
        else LocalDateTime.parse(text.take(19))
    }.getOrNull()
}

fun planFires(data: AppData, holidays: List<HolidayOccurrence>, now: LocalDateTime, horizonDays: Int = 21): List<FirePlan> {
    val until = now.plusDays(horizonDays.toLong())
    val plans = mutableListOf<FirePlan>()
    for (rule in data.reminderRules) {
        if (!rule.enabled) continue
        for (start in startInstants(data, holidays, rule, now.minusDays(1), until)) {
            val fire = if (rule.triggerMode == "absolute") parseLocalDateTime(rule.triggerAt) else start.at.minusMinutes((rule.offsetMinutes ?: 0).toLong())
            if (fire == null || !fire.isAfter(now) || fire.isAfter(until)) continue
            val key = "${rule.id}:${start.key}:${formatFire(fire)}:${rule.revision}"
            if (plans.any { it.occurrenceKey == key }) continue
            plans += FirePlan(rule.id, key, fire, start.title, rule.delivery)
        }
    }
    return plans
}

private data class Start(val at: LocalDateTime, val key: String, val title: String)

private fun startInstants(data: AppData, holidays: List<HolidayOccurrence>, rule: ReminderRule, from: LocalDateTime, until: LocalDateTime): List<Start> {
    val out = mutableListOf<Start>()
    fun push(at: LocalDateTime?, key: String, title: String) {
        if (at == null || at.isBefore(from) || at.isAfter(until)) return
        out += Start(at, key, title)
    }
    when (rule.targetType) {
        "todo" -> {
            val item = data.todos.find { it.id == rule.targetId } ?: return emptyList()
            if (item.done || item.dueDate.isNullOrBlank()) return emptyList()
            push(parseLocalDateTime("${item.dueDate}T${item.dueTime ?: "09:00"}"), item.dueDate, item.title)
        }
        "exam" -> {
            val item = data.exams.find { it.id == rule.targetId } ?: return emptyList()
            push(parseLocalDateTime("${item.date}T${item.startTime}"), item.date, item.name)
        }
        "event" -> {
            val item = data.calendarEvents.find { it.id == rule.targetId } ?: return emptyList()
            push(parseLocalDateTime("${item.date}T${item.startTime ?: "09:00"}"), item.date, item.title)
        }
        "day" -> {
            val item = data.countdowns.find { it.id == rule.targetId } ?: return emptyList()
            push(parseLocalDateTime("${item.date}T09:00"), item.date, item.title)
        }
        "course", "self" -> {
            val course = if (rule.targetType == "course") data.courses.find { it.id == rule.targetId } else null
            val self = if (rule.targetType == "self") data.selfSchedules.find { it.id == rule.targetId } else null
            val weekday = course?.weekday ?: self?.weekday ?: return emptyList()
            val startTime = course?.startTime ?: self?.startTime ?: return emptyList()
            val title = course?.name ?: self?.title ?: return emptyList()
            var cursor = from.toLocalDate()
            val end = until.toLocalDate()
            while (!cursor.isAfter(end)) {
                if (cursor.dayOfWeek.value == weekday) {
                    val term = data.terms.find { it.id == course?.termId } ?: data.terms.find { it.id == data.currentTermId }
                    val week = teachingWeekNumber(startOfWeek(cursor, data.timetableView.weekStartsOn), term?.startDate, data.timetableView.weekStartsOn)
                    if (course == null || courseInTeachingWeek(course, week)) {
                        push(parseLocalDateTime("${cursor}T$startTime"), cursor.toString(), title)
                    }
                }
                cursor = cursor.plusDays(1)
            }
        }
        "holiday" -> {
            val next = holidays.filter { it.stableKey == rule.targetId && it.kind != "day_off" && it.kind != "adjusted_workday" }
                .sortedBy { it.date }
                .firstOrNull { parseLocalDateTime("${it.date}T09:00")?.isBefore(from) == false }
            if (next != null) push(parseLocalDateTime("${next.date}T09:00"), next.date, next.name)
        }
        "recurring" -> {
            val item = data.recurringReminders.find { it.id == rule.targetId } ?: return emptyList()
            if (!item.remindTime.isNullOrBlank()) push(parseLocalDateTime("${item.startDate}T${item.remindTime}"), item.startDate, item.title)
        }
    }
    return out
}

fun formatFire(at: LocalDateTime): String = at.format(clock)

/** 日期必须能解析，时分秒各自落在合法范围。失败返回 null，调用方要给出可见错误。 */
fun absoluteTriggerAt(date: String, hour: Int, minute: Int, second: Int): String? {
    if (hour !in 0..23 || minute !in 0..59 || second !in 0..59) return null
    val parsed = runCatching { LocalDate.parse(date.trim()) }.getOrNull() ?: return null
    return "%sT%02d:%02d:%02d".format(parsed, hour, minute, second)
}

fun upsertReminderRule(rules: List<ReminderRule>, rule: ReminderRule, now: Long): List<ReminderRule> {
    val existing = rules.find { it.id == rule.id }
    val next = rule.copy(updatedAt = now, revision = (existing?.revision ?: 0) + 1, enabled = rule.enabled)
    return if (existing == null) rules + next else rules.map { if (it.id == rule.id) next else it }
}
