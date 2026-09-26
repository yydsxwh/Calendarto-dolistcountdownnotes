package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RemarksTest {
    @Test
    fun sameDaySaveStaysOneRow() {
        var remarks = upsertRemark(emptyList(), Remark(dayRemarkId("2026-09-25"), "day", "2026-09-25", body = "第一遍"), 10)
        remarks = upsertRemark(remarks, Remark(dayRemarkId("2026-09-25"), "day", "2026-09-25", body = "第二遍"), 11)
        remarks = upsertRemark(remarks, Remark(dayRemarkId("2026-09-25"), "day", "2026-09-25", body = "第二遍"), 12)
        assertEquals(1, remarks.size)
        assertEquals("第二遍", remarks[0].body)
        assertEquals(3, remarks[0].revision)
    }

    @Test
    fun occurrenceNoteDoesNotReplaceCourseNote() {
        var remarks = upsertRemark(emptyList(), Remark(occurrenceRemarkId("c1", "2026-09-25", "08:00"), "occurrence", "2026-09-25", "c1", "c1:2026-09-25:08:00", "带计算器"), 1)
        remarks = upsertRemark(remarks, Remark(occurrenceRemarkId("c1", "2026-10-02", "08:00"), "occurrence", "2026-10-02", "c1", "c1:2026-10-02:08:00", "别的课"), 2)
        remarks = upsertRemark(remarks, Remark(courseRemarkId("c1"), "course", courseId = "c1", body = "教材第三章"), 3)
        remarks = remarks.filter { it.id != occurrenceRemarkId("c1", "2026-09-25", "08:00") }
        assertEquals("教材第三章", remarks.first { it.id == courseRemarkId("c1") }.body)
        assertEquals("别的课", remarks.first { it.id == occurrenceRemarkId("c1", "2026-10-02", "08:00") }.body)
        assertTrue(remarks.none { it.id == occurrenceRemarkId("c1", "2026-09-25", "08:00") })
    }

    @Test
    fun tombstoneDropsRemarkAndKeepsEvent() {
        val event = CalendarEvent("e", "讨论", "2026-09-25", "09:00", "10:00", false, null, null, "#2563eb", "medium", 15, "none", 1, 1, 1)
        val remark = Remark(dayRemarkId("2026-09-25"), "day", "2026-09-25", body = "备注", createdAt = 10, updatedAt = 20, revision = 1)
        val local = emptyData().copy(calendarEvents = listOf(event), remarks = emptyList(), tombstones = listOf(Tombstone(remark.id, 30)))
        val remote = emptyData().copy(calendarEvents = listOf(event), remarks = listOf(remark))
        val merged = mergeAppData(local, remote)
        assertTrue(merged.remarks.isEmpty())
        assertEquals(1, merged.calendarEvents.size)
    }

    @Test
    fun remarksOnlyBlobIsNotEmpty() {
        val data = emptyData().copy(remarks = listOf(Remark(dayRemarkId("2026-09-25"), "day", "2026-09-25", body = "只剩备注")))
        assertFalse(isEmptyData(data))
    }
}
