package com.yydsxwh.kemiao.days.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.UUID

val DaysJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
    explicitNulls = false
}

@Serializable data class Term(
    val id: String,
    val yearStart: Int,
    val kind: String,
    val title: String? = null,
    val startDate: String,
    val weekCount: Int,
)

@Serializable data class ClassPeriod(val start: String, val end: String)

@Serializable data class TimetableViewSettings(
    val weekStartsOn: Int = 1,
    val showOffWeekCourses: Boolean = false,
    val hiddenHours: List<Int> = emptyList(),
    val hiddenWeekdays: List<Int> = emptyList(),
    val classPeriods: List<ClassPeriod> = defaultPeriods(),
)

@Serializable data class Course(
    val id: String,
    val name: String,
    val weekday: Int,
    val startTime: String,
    val endTime: String,
    val location: String? = null,
    val teacher: String? = null,
    val weeks: String? = null,
    val color: String,
    val remindMinutes: Int,
    val createdAt: Long,
    val termId: String? = null,
    val note: String? = null,
)

@Serializable data class Exam(
    val id: String,
    val name: String,
    val kind: String,
    val date: String,
    val startTime: String,
    val endTime: String? = null,
    val location: String? = null,
    val seat: String? = null,
    val remindMinutes: Int,
    val createdAt: Long,
)

@Serializable data class SelfScheduleItem(
    val id: String,
    val title: String,
    val weekday: Int,
    val startTime: String,
    val endTime: String,
    val color: String,
    val note: String? = null,
    val remindMinutes: Int,
    val priority: String,
    val createdAt: Long,
)

@Serializable data class CalendarEvent(
    val id: String,
    val title: String,
    val date: String,
    val startTime: String? = null,
    val endTime: String? = null,
    val allDay: Boolean = false,
    val location: String? = null,
    val note: String? = null,
    val color: String,
    val priority: String,
    val remindMinutes: Int,
    val repeat: String = "none",
    val createdAt: Long,
    val updatedAt: Long = 0,
    val revision: Int = 1,
)

@Serializable data class RecurrenceRule(
    val kind: String = "interval",
    val interval: Int? = 1,
    val unit: String? = "year",
    val termPhase: String? = null,
    val offsetDays: Int? = null,
    val season: String? = null,
    val eventKey: String? = null,
)

@Serializable data class RecurringReminder(
    val id: String,
    val title: String,
    val body: String? = null,
    val startDate: String,
    val remindTime: String? = null,
    val rule: RecurrenceRule,
    val endDate: String? = null,
    val neverEnds: Boolean = true,
    val enabled: Boolean = true,
    val createdAt: Long,
    val updatedAt: Long,
)

@Serializable data class ReminderSettings(
    val enabled: Boolean = true,
    val classDefaultMinutes: Int = 15,
    val examDefaultMinutes: Int = 1440,
    val eventDefaultMinutes: Int = 15,
    val todoDefaultMinutes: Int = 15,
    val selfScheduleDefaultMinutes: Int = 10,
    val examAlsoHourBefore: Boolean = true,
)

@Serializable data class Todo(
    val id: String,
    val title: String,
    val done: Boolean = false,
    val dueDate: String? = null,
    val dueTime: String? = null,
    val dueEndTime: String? = null,
    val priority: String = "medium",
    val remindMinutes: Int = 15,
    val createdAt: Long,
)

@Serializable data class Countdown(
    val id: String,
    val title: String,
    val date: String,
    val color: String,
    val emoji: String,
    val repeatYearly: Boolean = false,
    val createdAt: Long,
)

@Serializable data class Note(
    val id: String,
    val title: String,
    val body: String,
    val color: String,
    val pinned: Boolean = false,
    val date: String? = null,
    val updatedAt: Long,
)

@Serializable data class Tombstone(val id: String, val deletedAt: Long)

@Serializable data class ReminderRule(
    val id: String,
    val targetType: String,
    val targetId: String,
    val delivery: String = "notification",
    val triggerMode: String = "relative",
    val triggerAt: String? = null,
    val offsetMinutes: Int? = null,
    val timezone: String = "Asia/Shanghai",
    val enabled: Boolean = false,
    val snoozeMinutes: Int = 5,
    val vibrationEnabled: Boolean = true,
    val createdAt: Long = 0,
    val updatedAt: Long = 0,
    val revision: Int = 1,
)

@Serializable data class HolidaySettings(
    val showCn: Boolean = true,
    val showUs: Boolean = false,
    val showPublic: Boolean = true,
    val showTraditional: Boolean = true,
    val showAdjusted: Boolean = true,
    val updatedAt: Long = 0,
)

@Serializable data class HolidayFavorite(
    val id: String,
    val stableKey: String,
    val region: String,
    val createdAt: Long = 0,
)

@Serializable data class AppData(
    val todos: List<Todo> = emptyList(),
    val countdowns: List<Countdown> = emptyList(),
    val notes: List<Note> = emptyList(),
    val courses: List<Course> = emptyList(),
    val exams: List<Exam> = emptyList(),
    val selfSchedules: List<SelfScheduleItem> = emptyList(),
    val calendarEvents: List<CalendarEvent> = emptyList(),
    val recurringReminders: List<RecurringReminder> = emptyList(),
    val reminderRules: List<ReminderRule> = emptyList(),
    val holidaySettings: HolidaySettings = HolidaySettings(),
    val holidayFavorites: List<HolidayFavorite> = emptyList(),
    val reminderSettings: ReminderSettings = ReminderSettings(),
    val terms: List<Term> = emptyList(),
    val currentTermId: String? = null,
    val timetableView: TimetableViewSettings = TimetableViewSettings(),
    val termStart: String? = null,
    val tombstones: List<Tombstone> = emptyList(),
)

@Serializable data class SessionUser(val id: String? = null, val sub: String? = null, val name: String? = null, val email: String? = null, val avatarUrl: String? = null) {
    val accountSub: String get() = sub ?: id.orEmpty()
}

fun uid(): String = UUID.randomUUID().toString()

fun defaultPeriods(): List<ClassPeriod> = listOf(
    ClassPeriod("08:00", "08:45"),
    ClassPeriod("08:55", "09:40"),
    ClassPeriod("10:00", "10:45"),
    ClassPeriod("10:55", "11:40"),
    ClassPeriod("14:00", "14:45"),
    ClassPeriod("14:55", "15:40"),
    ClassPeriod("16:00", "16:45"),
    ClassPeriod("16:55", "17:40"),
    ClassPeriod("19:00", "19:45"),
    ClassPeriod("19:55", "20:40"),
)

val COURSE_COLORS = listOf("#2563eb", "#3b82f6", "#fb7185", "#e11d48", "#ff6b35", "#ffb703", "#10b981", "#8b5cf6")
val NOTE_COLORS = listOf("#fef08a", "#fecdd3", "#bbf7d0", "#bae6fd", "#ddd6fe", "#fed7aa")
val COUNTDOWN_COLORS = listOf("#2563eb", "#ff6b35", "#e11d48", "#fb7185", "#38bdf8", "#ffb703")
val COUNTDOWN_EMOJIS = listOf("🎯", "🎂", "✈️", "📚", "💍", "🎓", "🏠", "🎉")
val EXAM_KIND_LABEL = mapOf("midterm" to "期中", "final" to "期末", "makeup" to "补考", "other" to "其他")
val TERM_KIND_LABEL = mapOf(
    "fall" to "第1学期",
    "spring" to "第2学期",
    "summer" to "暑假小学期",
    "winter" to "寒假小学期",
    "practice" to "社会实践",
    "intern" to "实习项目",
)
val PRIORITY_LABEL = mapOf("high" to "高", "medium" to "中", "low" to "低")
val WEEKDAY_LABEL = listOf("", "一", "二", "三", "四", "五", "六", "日")
