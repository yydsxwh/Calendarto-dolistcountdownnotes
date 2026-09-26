package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime

class HolidayAlarmTest {
    @Test
    fun ticketAndDinner() {
        val data = emptyData().copy(
            todos = listOf(Todo("t", "抢票", false, "2026-09-25", "10:00", null, "high", 0, 1)),
            calendarEvents = listOf(CalendarEvent("e", "聚餐", "2026-09-25", "18:00", null, false, null, null, "#2563eb", "medium", 0, "none", 1)),
            reminderRules = listOf(
                ReminderRule("a", "todo", "t", "alarm", "absolute", "2026-09-25T09:55", null, enabled = true),
                ReminderRule("b", "todo", "t", "alarm", "absolute", "2026-09-25T09:58", null, enabled = true),
                ReminderRule("c", "event", "e", "alarm", "relative", null, 60, enabled = true),
            ),
        )
        val fires = planFires(data, emptyList(), LocalDateTime.of(2026, 9, 25, 9, 0), 2)
        assertEquals(listOf("2026-09-25T09:55:00", "2026-09-25T09:58:00", "2026-09-25T17:00:00"), fires.map { formatFire(it.fireAt) })
    }

    @Test
    fun editDeletesAndCourseWindow() {
        val exam = Exam("x", "考试", "final", "2026-09-26", "08:00", null, null, null, 0, 1)
        var data = emptyData().copy(
            exams = listOf(exam),
            reminderRules = listOf(
                ReminderRule("d1", "exam", "x", "alarm", "absolute", "2026-09-25T20:00", null, enabled = true),
                ReminderRule("d2", "exam", "x", "alarm", "absolute", "2026-09-26T07:00", null, enabled = true),
            ),
        )
        assertEquals(2, planFires(data, emptyList(), LocalDateTime.of(2026, 9, 25, 12, 0), 2).size)
        data = data.copy(exams = emptyList())
        assertTrue(planFires(data, emptyList(), LocalDateTime.of(2026, 9, 25, 12, 0), 2).isEmpty())
        val course = emptyData().copy(
            courses = listOf(Course("c", "高数", 1, "09:00", "09:45", null, null, null, "#2563eb", 15, 1)),
            reminderRules = listOf(ReminderRule("k", "course", "c", "alarm", "relative", null, 10, enabled = true)),
        )
        val fires = planFires(course, emptyList(), LocalDateTime.of(2026, 9, 21, 8, 0), 14)
        assertTrue(fires.isNotEmpty())
        assertTrue(fires.all { formatFire(it.fireAt).endsWith("T08:50:00") })
    }

    @Test
    fun disabledRuleDoesNotRing() {
        val data = emptyData().copy(
            todos = listOf(Todo("t", "抢票", false, "2026-09-25", "10:00", null, "high", 0, 1)),
            reminderRules = listOf(ReminderRule("a", "todo", "t", "alarm", "absolute", "2026-09-25T09:55", enabled = false)),
        )
        assertTrue(planFires(data, emptyList(), LocalDateTime.of(2026, 9, 25, 9, 0), 2).isEmpty())
    }

    @Test
    fun secondsStayDistinct() {
        val data = emptyData().copy(
            todos = listOf(Todo("t", "抢票", false, "2026-09-25", "10:00", null, "high", 0, 1)),
            reminderRules = listOf(
                ReminderRule("s1", "todo", "t", "alarm", "absolute", "2026-09-25T09:55:30", null, enabled = true),
                ReminderRule("s2", "todo", "t", "alarm", "absolute", "2026-09-25T09:55:45", null, enabled = true),
            ),
        )
        val fires = planFires(data, emptyList(), LocalDateTime.of(2026, 9, 25, 9, 0), 2)
        assertEquals(listOf("2026-09-25T09:55:30", "2026-09-25T09:55:45"), fires.map { formatFire(it.fireAt) })
        assertEquals(2, fires.map { it.occurrenceKey }.toSet().size)
    }
}
