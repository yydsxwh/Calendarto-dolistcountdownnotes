package com.yydsxwh.kemiao.days.data.model

fun insertCalendarEvent(events: List<CalendarEvent>, item: CalendarEvent, now: Long): List<CalendarEvent> {
    val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: now)
    if (ready.title.isBlank() || ready.date.isBlank() || events.any { it.id == ready.id }) return events
    return events + ready.copy(updatedAt = now, revision = 1)
}

fun replaceCalendarEvent(events: List<CalendarEvent>, item: CalendarEvent, now: Long): List<CalendarEvent> =
    events.map { event ->
        if (event.id == item.id) item.copy(updatedAt = now, revision = event.revision + 1) else event
    }
