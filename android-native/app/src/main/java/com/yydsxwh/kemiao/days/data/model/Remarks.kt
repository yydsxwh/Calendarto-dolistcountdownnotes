package com.yydsxwh.kemiao.days.data.model

fun dayRemarkId(date: String) = "day:$date"
fun courseRemarkId(courseId: String) = "course:$courseId"
fun occurrenceKey(courseId: String, date: String, startTime: String) = "$courseId:$date:$startTime"
fun occurrenceRemarkId(courseId: String, date: String, startTime: String) = "occ:${occurrenceKey(courseId, date, startTime)}"

fun upsertRemark(remarks: List<Remark>, next: Remark, now: Long): List<Remark> {
    if (next.body.isBlank()) return remarks
    val existing = remarks.find { it.id == next.id }
    val saved = next.copy(
        createdAt = existing?.createdAt?.takeIf { it > 0 } ?: now,
        updatedAt = now,
        revision = (existing?.revision ?: 0) + 1,
    )
    return if (existing == null) remarks + saved else remarks.map { if (it.id == saved.id) saved else it }
}
