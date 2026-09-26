package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class WeekGridTest {
    @Test
    fun timelineFollowsClassClocksAndSkipsInventedSplits() {
        val courses = listOf(
            course("a", "08:30", "09:30"),
            course("b", "11:30", "12:10"),
        )
        val axis = buildTimeAxis(courses = courses)
        assertEquals(8 * 60 + 30, axis.originMin)
        assertEquals(12 * 60 + 10, axis.endMin)
        val labels = axis.marks.map { it.label }
        assertTrue(labels.containsAll(listOf("08:30", "09:30", "11:30", "12:10")))
        assertFalse(labels.contains("08:45"))
        assertFalse(labels.contains("08:00"))
    }

    @Test
    fun teachingWeekKeepsOddWeeksOnly() {
        val odd = course("a", "08:00", "09:40").copy(weeks = "1-16单周")
        assertTrue(courseInTeachingWeek(odd, 1))
        assertFalse(courseInTeachingWeek(odd, 2))
        val monday = LocalDate.of(2026, 9, 7)
        assertEquals(2, teachingWeekNumber(monday.plusDays(7), "2026-09-07", 1))
    }

    @Test
    fun removeTermSwitchesAwayAndKeepsTheLastOne() {
        val first = emptyData()
        val second = withNewTerm(first, "summer", id = "summer")
        assertEquals("summer", second.currentTermId)
        assertEquals(2, second.terms.size)
        val back = withoutTerm(second, "summer")
        assertEquals(first.currentTermId, back.currentTermId)
        assertEquals(1, back.terms.size)
        assertEquals(back, withoutTerm(back, back.currentTermId!!))
    }
}

private fun course(id: String, start: String, end: String) = Course(
    id = id,
    name = id,
    weekday = 1,
    startTime = start,
    endTime = end,
    color = "#2563eb",
    remindMinutes = 15,
    createdAt = 1,
)
