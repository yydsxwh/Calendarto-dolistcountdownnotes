package com.yydsxwh.kemiao.days.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OcrHydrateTest {
    @Test
    fun hydrateKeepsValidCourseAndExam() {
        val result = hydrateTimetableOcr(
            """{"courses":[{"name":"高等数学","weekday":1,"startTime":"08:00","endTime":"09:40","location":"教学楼A101","teacher":"王老师"},{"name":"空课","weekday":9,"startTime":"10:00","endTime":"09:00"}],"exams":[{"name":"大学英语","kind":"期中","date":"2026-09-18","startTime":"14:00","endTime":"16:00"}]}""",
            now = 1,
        )
        assertEquals("高等数学", result.courses.single().name)
        assertEquals("王老师", result.courses.single().teacher)
        assertEquals("midterm", result.exams.single().kind)
        assertEquals("14:00", result.exams.single().startTime)
    }

    @Test
    fun weekdayLabelAndPeriodSlots() {
        val result = hydrateTimetableOcr(
            """{"courses":[{"name":"线性代数","weekday":"周一","startTime":"第1-2节","location":"B201"},{"name":"大学物理","weekday":"三","startTime":"5-6节","teacher":"李老师"}]}""",
            now = 1,
        )
        val linear = result.courses.first { it.name == "线性代数" }
        val physics = result.courses.first { it.name == "大学物理" }
        assertEquals(1, linear.weekday)
        assertEquals("08:00", linear.startTime)
        assertEquals("09:40", linear.endTime)
        assertEquals(3, physics.weekday)
        assertEquals("14:00", physics.startTime)
        assertEquals("15:40", physics.endTime)
    }

    @Test
    fun remapsZeroBasedWeekdays() {
        val remapped = remapZeroBasedWeekdays(
            listOf(
                mapOf("name" to "A", "weekday" to "0"),
                mapOf("name" to "B", "weekday" to "2"),
            ),
        )
        assertEquals("1", remapped[0]["weekday"])
        assertEquals("3", remapped[1]["weekday"])
        val result = hydrateTimetableOcr(
            """{"courses":[{"name":"早课","weekday":0,"startTime":"08:30","endTime":"10:05"}]}""",
            now = 1,
        )
        assertEquals(1, result.courses.single().weekday)
    }

    @Test
    fun packedRoomSplitsLocationAndWeeks() {
        val packed = splitPackedLocation("教一1506/1-2节/1-16周")
        assertEquals("教一1506", packed.first)
        assertEquals("1-16周", packed.second)
    }

    @Test
    fun dropsImpossibleDatesAndReversedTimes() {
        val result = hydrateTimetableOcr(
            """{"exams":[{"name":"坏日期","date":"2026-02-31","startTime":"09:00"},{"name":"时间倒挂","date":"2026-06-01","startTime":"16:00","endTime":"14:00"},{"name":"期末","date":"2026-06-20","startTime":"09:00","endTime":"11:00"}]}""",
            now = 1,
        )
        assertEquals("期末", result.exams.single().name)
        assertTrue(result.warnings.any { it.contains("坏日期") || it.contains("时间倒挂") })
    }

    @Test
    fun applyImportKeepsExistingAndAddsNew() {
        val base = emptyData().copy(todos = listOf(Todo("t1", "已有", false, null, null, null, "medium", 15, 1)))
        val ocr = hydrateTimetableOcr("""{"courses":[{"name":"英语","weekday":2,"startTime":"08:00","endTime":"09:40"}]}""", now = 1)
        val next = applyOcrImport(base, ocr)
        assertEquals(1, next.todos.size)
        assertEquals("英语", next.courses.single().name)
        assertEquals(base.currentTermId, next.courses.single().termId)
    }
}
