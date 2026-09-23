package com.yydsxwh.kemiao.days.data.model

import java.time.LocalDate

const val HOUR_PX = 56f
const val FULL_DAY_END_MIN = 24 * 60

data class TimeMark(val minutes: Int, val label: String, val kind: String)

/** 左侧时间轴：刻度跟开课、下课钟点走，范围收到最早开始到最晚结束。 */
data class TimeAxis(
    val hiddenHours: List<Int>,
    val hourPx: Float,
    val originMin: Int,
    val endMin: Int,
    val marks: List<TimeMark>,
)

data class LaidOutBlock(
    val id: String,
    val col: Int,
    val cols: Int,
    val top: Float,
    val height: Float,
)

data class WeekDay(
    val weekday: Int,
    val date: LocalDate,
    val iso: String,
    val isToday: Boolean,
)

fun clockMinutes(raw: String?): Int? {
    if (raw.isNullOrBlank()) return null
    if (raw == "23:59") return FULL_DAY_END_MIN
    val parts = raw.split(":")
    if (parts.size != 2) return null
    val hour = parts[0].toIntOrNull() ?: return null
    val minute = parts[1].toIntOrNull() ?: return null
    if (hour !in 0..23 || minute !in 0..59) return null
    return hour * 60 + minute
}

fun clockLabel(total: Int): String {
    if (total >= FULL_DAY_END_MIN) return "23:59"
    val wrapped = ((total % FULL_DAY_END_MIN) + FULL_DAY_END_MIN) % FULL_DAY_END_MIN
    return "%02d:%02d".format(wrapped / 60, wrapped % 60)
}

fun visibleHours(hiddenHours: List<Int>): List<Int> {
    val hide = hiddenHours.filter { it in 0..23 }.toSet()
    val hours = (0..23).filter { it !in hide }
    return hours.ifEmpty { listOf(8) }
}

fun weekdayOrder(weekStartsOn: Int): List<Int> =
    if (weekStartsOn == 7) listOf(7, 1, 2, 3, 4, 5, 6) else listOf(1, 2, 3, 4, 5, 6, 7)

fun weekDays(weekStart: LocalDate, today: LocalDate = LocalDate.now(), weekStartsOn: Int = 1, hiddenWeekdays: List<Int> = emptyList()): List<WeekDay> {
    val hidden = hiddenWeekdays.toSet()
    return weekdayOrder(weekStartsOn).filter { it !in hidden }.map { weekday ->
        val offset = if (weekStartsOn == 7) if (weekday == 7) 0 else weekday else weekday - 1
        val date = weekStart.plusDays(offset.toLong())
        WeekDay(weekday, date, toIsoDate(date), date == today)
    }
}

fun shiftWeek(weekStart: LocalDate, weeks: Int): LocalDate = weekStart.plusDays(weeks * 7L)

fun teachingWeekNumber(weekStart: LocalDate, termStart: String?, weekStartsOn: Int = 1): Int? {
    if (termStart.isNullOrBlank()) return null
    val start = runCatching { startOfWeek(parseIsoDate(termStart), weekStartsOn) }.getOrNull() ?: return null
    val view = startOfWeek(weekStart, weekStartsOn)
    val diffDays = java.time.temporal.ChronoUnit.DAYS.between(start, view).toInt()
    return diffDays / 7 + 1
}

fun parseWeekNumbers(raw: String?): Set<Int>? {
    if (raw.isNullOrBlank()) return null
    val text = raw.replace("\\s".toRegex(), "")
    val odd = "单" in text
    val even = "双" in text
    val nums = linkedSetOf<Int>()
    val range = Regex("""(\d{1,2})\s*[-~到至—–]\s*(\d{1,2})""")
    val rest = range.replace(text) { match ->
        val from = match.groupValues[1].toInt()
        val to = match.groupValues[2].toInt()
        for (n in minOf(from, to)..maxOf(from, to)) nums.add(n)
        " "
    }
    for (part in rest.split(',', '，', '、', ';', '；')) {
        val n = Regex("""\d{1,2}""").find(part)?.value?.toIntOrNull() ?: continue
        nums.add(n)
    }
    if (nums.isEmpty() && (odd || even)) {
        for (i in 1..30) {
            if (odd && i % 2 == 1) nums.add(i)
            if (even && i % 2 == 0) nums.add(i)
        }
    } else if (odd) {
        nums.removeAll { it % 2 == 0 }
    } else if (even) {
        nums.removeAll { it % 2 == 1 }
    }
    return nums.takeIf { it.isNotEmpty() }
}

fun courseInTeachingWeek(course: Course, week: Int?): Boolean {
    if (week == null || week < 1) return true
    val spec = parseWeekNumbers(course.weeks) ?: return true
    return week in spec
}

private fun minuteVisible(mins: Int, hiddenHours: List<Int>): Boolean {
    if (mins >= FULL_DAY_END_MIN) return 23 !in hiddenHours
    val hour = minOf(23, mins / 60)
    if (mins > 0 && mins % 60 == 0) {
        val prev = mins / 60 - 1
        return hour !in hiddenHours || (prev >= 0 && prev !in hiddenHours)
    }
    return hour !in hiddenHours
}

private fun thinMinutes(values: List<Int>, minGap: Int = 12): List<Int> {
    val sorted = values.distinct().sorted()
    if (sorted.size <= 1) return sorted
    val kept = mutableListOf(sorted.first())
    for (i in 1 until sorted.lastIndex) {
        if (sorted[i] - kept.last() >= minGap) kept.add(sorted[i])
    }
    val last = sorted.last()
    if (last - kept.last() < minGap && kept.size > 1) kept[kept.lastIndex] = last
    else if (last != kept.last()) kept.add(last)
    return kept
}

fun buildTimeAxis(
    hiddenHours: List<Int> = emptyList(),
    hourPx: Float = HOUR_PX,
    courses: List<Course> = emptyList(),
    exams: List<Exam> = emptyList(),
): TimeAxis {
    val hours = visibleHours(hiddenHours)
    val fallbackOrigin = hours.first() * 60
    val fallbackEnd = minOf(FULL_DAY_END_MIN, hours.last() * 60 + 60)
    val eventMins = buildList {
        for (course in courses) {
            clockMinutes(course.startTime)?.let { add(it) }
            clockMinutes(course.endTime)?.let { add(it) }
        }
        for (exam in exams) {
            clockMinutes(exam.startTime)?.let { add(it) }
            clockMinutes(exam.endTime ?: exam.startTime)?.let { add(it) }
        }
    }.filter { it in 0..FULL_DAY_END_MIN && minuteVisible(it, hiddenHours) }

    if (eventMins.isEmpty()) {
        return TimeAxis(
            hiddenHours,
            hourPx,
            fallbackOrigin,
            fallbackEnd,
            hours.map { hour ->
                val minutes = hour * 60
                TimeMark(minutes, if (hour == 0) "00:00" else clockLabel(minutes), "hour")
            },
        )
    }

    val originMin = eventMins.min()
    val endMin = eventMins.max()
    val eventSet = thinMinutes(eventMins, 12)
    val marks = eventSet.map { minutes ->
        TimeMark(minutes, if (minutes >= FULL_DAY_END_MIN) "23:59" else clockLabel(minutes), "event")
    }.toMutableList()
    for (hour in hours) {
        val minutes = hour * 60
        if (minutes < originMin || minutes > endMin) continue
        if (eventSet.any { kotlin.math.abs(it - minutes) < 20 }) continue
        marks.add(TimeMark(minutes, clockLabel(minutes), "hour"))
    }
    marks.sortBy { it.minutes }
    return TimeAxis(hiddenHours, hourPx, originMin, endMin, marks)
}

fun visibleOffset(mins: Int, hiddenHours: List<Int>, hourPx: Float): Float {
    val hours = visibleHours(hiddenHours)
    var y = 0f
    for (hour in hours) {
        val start = hour * 60
        val end = start + 60
        if (mins <= start) return y
        if (mins < end) return y + ((mins - start) / 60f) * hourPx
        y += hourPx
    }
    return y
}

fun axisOffset(mins: Int, axis: TimeAxis): Float =
    visibleOffset(mins, axis.hiddenHours, axis.hourPx) - visibleOffset(axis.originMin, axis.hiddenHours, axis.hourPx)

fun axisHeight(axis: TimeAxis): Float = maxOf(axis.hourPx / 2f, axisOffset(axis.endMin, axis))

fun layoutBlocks(
    blocks: List<Triple<String, Int, Int>>,
    hiddenHours: List<Int>,
    hourPx: Float,
    axis: TimeAxis,
): List<LaidOutBlock> {
    val items = blocks.mapNotNull { (id, start, end) ->
        if (end <= start) null else Triple(id, start, end)
    }.sortedWith(compareBy<Triple<String, Int, Int>> { it.second }.thenBy { it.third })
    if (items.isEmpty()) return emptyList()
    val clusters = mutableListOf<MutableList<Triple<String, Int, Int>>>()
    var cluster = mutableListOf<Triple<String, Int, Int>>()
    var clusterEnd = -1
    for (item in items) {
        if (cluster.isNotEmpty() && item.second >= clusterEnd) {
            clusters.add(cluster)
            cluster = mutableListOf(item)
            clusterEnd = item.third
        } else {
            cluster.add(item)
            clusterEnd = maxOf(clusterEnd, item.third)
        }
    }
    if (cluster.isNotEmpty()) clusters.add(cluster)
    val result = mutableListOf<LaidOutBlock>()
    for (group in clusters) {
        val columns = mutableListOf<Int>()
        val assigned = mutableListOf<Pair<Triple<String, Int, Int>, Int>>()
        for (item in group) {
            var col = columns.indexOfFirst { it <= item.second }
            if (col < 0) {
                col = columns.size
                columns.add(item.third)
            } else {
                columns[col] = item.third
            }
            assigned.add(item to col)
        }
        val cols = maxOf(1, columns.size)
        for ((item, col) in assigned) {
            val top = axisOffset(item.second, axis)
            val bottom = axisOffset(item.third, axis)
            val height = bottom - top
            if (height < 8f) continue
            result.add(LaidOutBlock(item.first, col, cols, top, maxOf(28f, height - 3f)))
        }
    }
    return result
}

fun withNewTerm(data: AppData, kind: String = guessTermKind(), yearStart: Int = currentAcademicYearStart(), id: String = uid()): AppData {
    val term = Term(id, yearStart, kind, null, "", defaultWeekCount(kind))
    return data.copy(terms = data.terms + term, currentTermId = term.id, termStart = term.startDate.ifBlank { null })
}

/** 至少留一个学期。删掉当前学期时切到剩下的第一个。课程仍留在原学期 id 上，不混进别的学期。 */
fun withoutTerm(data: AppData, id: String): AppData {
    if (data.terms.size <= 1 || data.terms.none { it.id == id }) return data
    val terms = data.terms.filter { it.id != id }
    val currentId = if (data.currentTermId == id) terms.first().id else data.currentTermId
    val current = terms.first { it.id == currentId }
    return data.copy(terms = terms, currentTermId = currentId, termStart = current.startDate.ifBlank { null })
}
