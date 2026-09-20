package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class DomainTest {
    @Test
    fun daysUntilAndYearlyOccurrence() {
        val from = LocalDate.of(2026, 9, 20)
        assertEquals(10, daysUntil("2026-09-30", from))
        val next = nextOccurrence("2020-09-10", true, from)
        assertEquals("2027-09-10", next)
    }

    @Test
    fun emptyDataHasTermAndNoUserContent() {
        val data = emptyData()
        assertTrue(isEmptyData(data))
        assertEquals(1, data.terms.size)
        assertTrue(data.currentTermId!!.isNotBlank())
    }

    @Test
    fun mergeKeepsBothSidesAndHonorsTombstone() {
        val a = emptyData().copy(todos = listOf(Todo("1", "本机", false, null, null, null, "high", 15, 10)))
        val b = emptyData().copy(todos = listOf(Todo("2", "云端", false, null, null, null, "low", 15, 20)))
        val merged = mergeAppData(a, b)
        assertEquals(2, merged.todos.size)
        val deleted = withTombstones(merged, listOf("1")).copy(todos = merged.todos.filter { it.id != "1" })
        val bounced = mergeAppData(deleted, a)
        assertTrue(bounced.todos.none { it.id == "1" })
        assertTrue(bounced.todos.any { it.id == "2" })
    }

    @Test
    fun jsonRoundTripKeepsFields() {
        val original = emptyData().copy(
            notes = listOf(Note("n1", "标题", "正文", NOTE_COLORS.first(), true, "2026-09-20", 99)),
        )
        val again = parseAppDataJson(dumpAppData(original))
        assertEquals("标题", again.notes.single().title)
        assertTrue(again.notes.single().pinned)
    }

    @Test
    fun recurrenceYearlyHitsSameMonthDay() {
        val item = RecurringReminder(
            "r1", "生日", null, "2020-09-20", "09:00",
            RecurrenceRule("interval", 1, "year"), null, true, true, 1, 1,
        )
        assertTrue(occursOn(item, "2026-09-20"))
        assertFalse(occursOn(item, "2026-09-21"))
    }

    @Test
    fun weekdayMondayIsOne() {
        assertEquals(1, weekdayOf("2026-09-21"))
        assertEquals(7, weekdayOf("2026-09-20"))
    }
}
