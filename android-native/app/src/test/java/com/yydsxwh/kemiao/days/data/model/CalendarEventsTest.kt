package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Test

class CalendarEventsTest {
    private fun event(id: String, title: String, createdAt: Long = 1) =
        CalendarEvent(id, title, "2026-09-25", "09:00", null, false, null, null, "#2563eb", "medium", 0, "none", createdAt)

    @Test
    fun fiveSameDayAndDuplicateTitleStay() {
        var events = emptyList<CalendarEvent>()
        for (i in 1..5) events = insertCalendarEvent(events, event("e$i", "事项 $i", i.toLong()), 10)
        events = insertCalendarEvent(events, event("dup-a", "重复标题", 6), 10)
        events = insertCalendarEvent(events, event("dup-b", "重复标题", 7), 10)
        events = insertCalendarEvent(events, event("dup-a", "重复标题", 8), 10)
        assertEquals(7, events.size)
        assertEquals(2, events.count { it.title == "重复标题" })
    }

    @Test
    fun editDeleteAndMoveOne() {
        var events = listOf("a", "b", "c", "d", "e").map { event(it, it) }
        events = replaceCalendarEvent(events, events[1].copy(title = "改过的 b"), 100)
        assertEquals("改过的 b", events.first { it.id == "b" }.title)
        assertEquals(2, events.first { it.id == "b" }.revision)
        events = events.filter { it.id != "c" }
        assertEquals(listOf("a", "b", "d", "e"), events.map { it.id })
        events = replaceCalendarEvent(events, events[0].copy(date = "2026-09-26"), 200)
        assertEquals("2026-09-26", events.first { it.id == "a" }.date)
        assertEquals(3, events.count { it.date == "2026-09-25" })
    }
}
