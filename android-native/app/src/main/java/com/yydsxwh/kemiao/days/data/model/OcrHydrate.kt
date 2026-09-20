package com.yydsxwh.kemiao.days.data.model

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.time.LocalDate

data class OcrImportResult(
    val courses: List<Course>,
    val exams: List<Exam>,
    val selfSchedules: List<SelfScheduleItem>,
    val warnings: List<String>,
)

private val PERIODS = defaultPeriods()

fun remapZeroBasedWeekdays(items: List<Map<String, String>>): List<Map<String, String>> {
    val nums = items.mapNotNull { it["weekday"]?.toIntOrNull() }
    if (nums.isNotEmpty() && nums.all { it in 0..6 } && nums.contains(0) && !nums.contains(7)) {
        return items.map { item ->
            val n = item["weekday"]?.toIntOrNull() ?: return@map item
            item + ("weekday" to (n + 1).toString())
        }
    }
    return items
}

fun parseWeekdayLoose(raw: String?): Int? {
    if (raw.isNullOrBlank()) return null
    val value = raw.trim()
    value.toIntOrNull()?.takeIf { it in 1..7 }?.let { return it }
    val named = mapOf(
        "周一" to 1, "周二" to 2, "周三" to 3, "周四" to 4, "周五" to 5, "周六" to 6, "周日" to 7, "周天" to 7,
        "星期一" to 1, "星期二" to 2, "星期三" to 3, "星期四" to 4, "星期五" to 5, "星期六" to 6, "星期日" to 7, "星期天" to 7,
        "mon" to 1, "monday" to 1, "tue" to 2, "tuesday" to 2, "wed" to 3, "wednesday" to 3,
        "thu" to 4, "thursday" to 4, "fri" to 5, "friday" to 5, "sat" to 6, "saturday" to 6, "sun" to 7, "sunday" to 7,
        "一" to 1, "二" to 2, "三" to 3, "四" to 4, "五" to 5, "六" to 6, "日" to 7, "天" to 7,
    )
    named[value]?.let { return it }
    named[value.lowercase()]?.let { return it }
    val week = Regex("""(?:周|星期|礼拜)\s*([一二三四五六七日天1-7])""").find(value)
    if (week != null) {
        val token = week.groupValues[1]
        return named[token] ?: token.toIntOrNull()?.takeIf { it in 1..7 }
    }
    return null
}

fun resolveOcrWeekday(item: Map<String, String>): Int? {
    val labelKeys = listOf("weekdayLabel", "dayLabel", "星期", "星期几", "周几", "weekDay", "dayName", "day")
    for (key in labelKeys) {
        val raw = item[key] ?: continue
        if (raw.isBlank() || raw.all { it.isDigit() }) continue
        parseWeekdayLoose(raw)?.let { return it }
    }
    return parseWeekdayLoose(item["weekday"])
}

fun normalizeClockInput(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    val text = raw.replace('：', ':').replace('.', ':').trim()
    Regex("""\b(\d{1,2}):(\d{2})\b""").find(text)?.let { match ->
        val h = match.groupValues[1].toInt()
        val m = match.groupValues[2].toInt()
        if (h <= 23 && m <= 59) return "%02d:%02d".format(h, m)
    }
    val compact = Regex("""^(\d{1,2})([0-5]\d)$""").find(text.trim())
    if (compact != null) return normalizeClockInput("${compact.groupValues[1]}:${compact.groupValues[2]}")
    return null
}

fun parseTimeRange(raw: String?): Pair<String, String>? {
    if (raw.isNullOrBlank()) return null
    val text = raw.replace('：', ':').replace('.', ':').replace(Regex("[～~—–－]"), "-")
    val match = Regex("""(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})""").find(text) ?: return null
    val start = normalizeClockInput(match.groupValues[1]) ?: return null
    val end = normalizeClockInput(match.groupValues[2]) ?: return null
    return start to end
}

fun parsePeriodHint(raw: String?): Pair<String, String>? {
    if (raw.isNullOrBlank()) return null
    parseTimeRange(raw)?.let { return it }
    val span = Regex("""第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*节""").find(raw)
    if (span != null) {
        val from = span.groupValues[1].toInt()
        val to = span.groupValues[2].toInt()
        val a = PERIODS.getOrNull(from - 1) ?: return null
        val b = PERIODS.getOrNull(to - 1) ?: return null
        return a.start to b.end
    }
    val single = Regex("""第?\s*(\d{1,2})\s*节""").find(raw)
    if (single != null) {
        val n = single.groupValues[1].toInt()
        val p = PERIODS.getOrNull(n - 1) ?: return null
        return p.start to p.end
    }
    return null
}

fun parseOcrDate(raw: String?, year: Int = LocalDate.now().year): String? {
    if (raw.isNullOrBlank()) return null
    val iso = Regex("""(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})""").find(raw)
    if (iso != null) {
        return "%s-%02d-%02d".format(iso.groupValues[1], iso.groupValues[2].toInt(), iso.groupValues[3].toInt())
    }
    val md = Regex("""^(\d{1,2})[-/.月](\d{1,2})""").find(raw.trim())
    if (md != null) {
        return "%d-%02d-%02d".format(year, md.groupValues[1].toInt(), md.groupValues[2].toInt())
    }
    return null
}

fun parseExamKind(raw: String): String = when {
    raw.contains("补") -> "makeup"
    raw.contains("期末") || raw.contains("final", true) -> "final"
    raw.contains("期中") || raw.contains("mid", true) -> "midterm"
    raw in EXAM_KIND_LABEL -> raw
    else -> "other"
}

fun splitPackedLocation(raw: String): Pair<String?, String?> {
    val cleaned = raw.replace(Regex("\\s+"), "")
    val packed = Regex("""^(.+?)/(\d{1,2}[-~到至]\d{1,2}节)/(.+)$""").find(cleaned)
    return if (packed != null) packed.groupValues[1] to packed.groupValues[3].replace("/", " ") else null to null
}

fun durationMinutes(start: String, end: String): Int {
    val (sh, sm) = start.split(":").map { it.toIntOrNull() ?: 0 }
    val (eh, em) = end.split(":").map { it.toIntOrNull() ?: 0 }
    return (eh * 60 + em) - (sh * 60 + sm)
}

private fun resolveSlot(item: Map<String, String>): Pair<String, String>? {
    val startRaw = item["startTime"].orEmpty()
    val endRaw = item["endTime"].orEmpty()
    val periodRaw = item["period"] ?: item["time"] ?: item["slot"].orEmpty()
    return parseTimeRange("$startRaw-$endRaw")
        ?: parseTimeRange(periodRaw)
        ?: parsePeriodHint(periodRaw)
        ?: parsePeriodHint(startRaw)
        ?: parsePeriodHint(if (endRaw.isBlank()) startRaw else "$startRaw-$endRaw")
        ?: run {
            val start = normalizeClockInput(startRaw)
            val end = normalizeClockInput(endRaw)
            if (start != null && end != null) start to end else null
        }
}

private fun textOf(el: JsonElement?): String = when (el) {
    null -> ""
    is JsonPrimitive -> el.contentOrNull?.trim().orEmpty()
    else -> el.toString().trim().trim('"')
}

private fun asObjectMap(obj: JsonObject): Map<String, String> = obj.mapValues { textOf(it.value) }

private fun arrayOfObjects(el: JsonElement?): List<JsonObject> {
    val arr = when (el) {
        is JsonArray -> el
        is JsonObject -> el["items"]?.let { if (it is JsonArray) it else null } ?: return emptyList()
        else -> return emptyList()
    }
    return arr.mapNotNull { if (it is JsonObject) it else null }
}

private fun flattenCourses(root: JsonObject): List<Map<String, String>> {
    val out = mutableListOf<Map<String, String>>()
    arrayOfObjects(root["courses"]).forEach { out += asObjectMap(it) }
    val headers = arrayOfObjects(root["dayHeaders"]).ifEmpty { arrayOfObjects(root["headers"]) }
        .map { textOf(it["label"].let { label -> label } ?: it.values.firstOrNull()) }
        .ifEmpty {
            (root["dayHeaders"] as? JsonArray)?.map { textOf(it) } ?: emptyList()
        }
    val slots = root["slots"]
    val cells = when (slots) {
        is JsonObject -> arrayOfObjects(slots["cells"])
        is JsonArray -> slots.mapNotNull { if (it is JsonObject) it else null }
        else -> emptyList()
    }
    for (cell in cells) {
        val map = asObjectMap(cell).toMutableMap()
        val col = cell["col"]?.jsonPrimitive?.contentOrNull?.toIntOrNull()
            ?: cell["weekday"]?.jsonPrimitive?.contentOrNull?.toIntOrNull()
        if (map["weekdayLabel"].isNullOrBlank() && col != null && col in 1..headers.size) {
            map["weekdayLabel"] = headers[col - 1]
        }
        if (map["name"].isNullOrBlank()) map["name"] = textOf(cell["text"])
        out += map
    }
    return out
}

fun hydrateTimetableOcr(
    payload: String,
    classRemind: Int = 15,
    examRemind: Int = 1440,
    now: Long = nowMillis(),
): OcrImportResult {
    val root = runCatching { DaysJson.parseToJsonElement(payload) as JsonObject }.getOrElse {
        return OcrImportResult(emptyList(), emptyList(), emptyList(), listOf("识别结果不是有效 JSON"))
    }
    val error = textOf(root["error"])
    if (error.isNotBlank()) return OcrImportResult(emptyList(), emptyList(), emptyList(), listOf(error))
    val warnings = mutableListOf<String>()
    (root["warnings"] as? JsonArray)?.forEach { warnings += textOf(it) }

    val rawCourses = flattenCourses(root)
    val dated = mutableListOf<Map<String, String>>()
    val courseDrafts = mutableListOf<Map<String, String>>()
    for (item in rawCourses) {
        if (parseOcrDate(item["date"] ?: item["examDate"] ?: item["日期"]) != null) dated += item else courseDrafts += item
    }
    val drafts = remapZeroBasedWeekdays(courseDrafts)
    val courses = mutableListOf<Course>()
    for (item in drafts) {
        val name = item["name"]?.trim().orEmpty().ifBlank { item["course"].orEmpty().ifBlank { item["title"].orEmpty() } }
        val packed = splitPackedLocation(item["location"].orEmpty())
        val location = packed.first ?: item["location"]
        val weeks = packed.second ?: item["weeks"]
        val weekday = resolveOcrWeekday(item)
        val slot = resolveSlot(item)
        if (name.isBlank() || weekday == null || slot == null) {
            warnings += "已跳过无法核对的课程：${name.ifBlank { "（无课名）" }}"
            continue
        }
        if (durationMinutes(slot.first, slot.second) <= 0) {
            warnings += "「$name」结束时间不晚于开始时间，已跳过"
            continue
        }
        courses += Course(
            id = uid(),
            name = name,
            weekday = weekday,
            startTime = slot.first,
            endTime = slot.second,
            location = location?.ifBlank { null },
            teacher = item["teacher"]?.ifBlank { null },
            weeks = weeks?.ifBlank { null },
            color = COURSE_COLORS[courses.size % COURSE_COLORS.size],
            remindMinutes = classRemind,
            createdAt = now,
        )
    }

    val examItems = arrayOfObjects(root["exams"]).map { asObjectMap(it) } + dated
    val exams = mutableListOf<Exam>()
    for (item in examItems) {
        val name = item["name"].orEmpty().ifBlank { item["course"].orEmpty().ifBlank { item["subject"].orEmpty().ifBlank { item["title"].orEmpty() } } }
        val date = parseOcrDate(item["date"] ?: item["examDate"] ?: item["日期"])
        val start = normalizeClockInput(item["startTime"] ?: item["time"]) ?: "09:00"
        val end = item["endTime"]?.let { normalizeClockInput(it) }
        if (name.isBlank() || date == null) {
            warnings += "已跳过无法核对的考试：${name.ifBlank { "（无科目）" }}"
            continue
        }
        exams += Exam(
            id = uid(),
            name = name,
            kind = parseExamKind(item["kind"].orEmpty().ifBlank { name }),
            date = date,
            startTime = start,
            endTime = end,
            location = item["location"]?.ifBlank { null },
            seat = item["seat"]?.ifBlank { null },
            remindMinutes = examRemind,
            createdAt = now,
        )
    }

    val selfDrafts = remapZeroBasedWeekdays(arrayOfObjects(root["selfSchedules"]).map { asObjectMap(it) })
    val selves = mutableListOf<SelfScheduleItem>()
    for (item in selfDrafts) {
        val title = item["title"].orEmpty().ifBlank { item["name"].orEmpty() }
        val weekday = resolveOcrWeekday(item)
        val slot = resolveSlot(item)
        if (title.isBlank() || weekday == null || slot == null) continue
        selves += SelfScheduleItem(
            id = uid(),
            title = title,
            weekday = weekday,
            startTime = slot.first,
            endTime = slot.second,
            color = COURSE_COLORS[(selves.size + 1) % COURSE_COLORS.size],
            note = item["note"]?.ifBlank { null },
            remindMinutes = 10,
            priority = "medium",
            createdAt = now,
        )
    }
    return OcrImportResult(courses, exams, selves, warnings)
}

fun applyOcrImport(data: AppData, result: OcrImportResult): AppData {
    val termId = data.currentTermId
    return data.copy(
        courses = data.courses + result.courses.map { it.copy(termId = it.termId ?: termId) },
        exams = (data.exams + result.exams).sortedBy { it.date },
        selfSchedules = data.selfSchedules + result.selfSchedules,
    )
}
