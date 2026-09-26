package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AlarmConfirmTest {
    @Test
    fun keepsChosenSecond() {
        assertEquals("2026-09-25T09:55:30", absoluteTriggerAt("2026-09-25", 9, 55, 30))
        assertEquals("2026-09-25T00:00:00", absoluteTriggerAt("2026-09-25", 0, 0, 0))
        assertEquals("2026-09-25T23:59:59", absoluteTriggerAt("2026-09-25", 23, 59, 59))
    }

    @Test
    fun rejectsIllegalTime() {
        assertNull(absoluteTriggerAt("09-25", 9, 55, 30))
        assertNull(absoluteTriggerAt("2026-09-25", 24, 0, 0))
        assertNull(absoluteTriggerAt("2026-09-25", 9, 60, 0))
        assertNull(absoluteTriggerAt("2026-02-31", 9, 0, 0))
    }

    @Test
    fun secondClickUpdatesSameRule() {
        val first = ReminderRule("draft", "event", "e", "alarm", "absolute", "2026-09-25T09:55:30", enabled = true)
        val once = upsertReminderRule(emptyList(), first, 10)
        val twice = upsertReminderRule(once, first.copy(triggerAt = "2026-09-25T09:55:31"), 11)
        assertEquals(1, twice.size)
        assertEquals("2026-09-25T09:55:31", twice.single().triggerAt)
        assertEquals(2, twice.single().revision)
    }
}
