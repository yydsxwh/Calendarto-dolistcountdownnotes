package com.yydsxwh.kemiao.days.data.model

fun emptyData(): AppData {
    val kind = guessTermKind()
    val term = Term(
        id = uid(),
        yearStart = currentAcademicYearStart(),
        kind = kind,
        startDate = "",
        weekCount = defaultWeekCount(kind),
    )
    return AppData(terms = listOf(term), currentTermId = term.id, reminderSettings = ReminderSettings())
}

fun hydrateAppData(raw: AppData?): AppData {
    val base = emptyData()
    if (raw == null) return base
    val terms = raw.terms.filter { it.id.isNotBlank() }.ifEmpty { base.terms }
    val currentId = raw.currentTermId?.takeIf { id -> terms.any { it.id == id } } ?: terms.first().id
    val current = terms.first { it.id == currentId }
    return AppData(
        todos = raw.todos.map { it.copy(remindMinutes = it.remindMinutes, priority = it.priority.ifBlank { "medium" }) },
        countdowns = raw.countdowns,
        notes = raw.notes,
        courses = raw.courses.map { it.copy(termId = it.termId ?: current.id, remindMinutes = it.remindMinutes) },
        exams = raw.exams,
        selfSchedules = raw.selfSchedules.map { it.copy(priority = it.priority.ifBlank { "medium" }) },
        calendarEvents = raw.calendarEvents.map { it.copy(priority = it.priority.ifBlank { "medium" }, repeat = it.repeat.ifBlank { "none" }) },
        recurringReminders = raw.recurringReminders.map { item ->
            item.copy(
                rule = item.rule.copy(
                    kind = item.rule.kind.ifBlank { "interval" },
                    interval = item.rule.interval ?: 1,
                    unit = item.rule.unit ?: "year",
                ),
                neverEnds = item.neverEnds || item.endDate.isNullOrBlank(),
            )
        },
        reminderRules = raw.reminderRules,
        holidaySettings = raw.holidaySettings,
        holidayFavorites = raw.holidayFavorites,
        reminderSettings = raw.reminderSettings,
        terms = terms,
        currentTermId = current.id,
        timetableView = raw.timetableView.copy(
            weekStartsOn = if (raw.timetableView.weekStartsOn == 7) 7 else 1,
            classPeriods = raw.timetableView.classPeriods.ifEmpty { defaultPeriods() },
        ),
        termStart = current.startDate.ifBlank { raw.termStart },
        tombstones = raw.tombstones,
    )
}

fun parseAppDataJson(text: String): AppData = hydrateAppData(DaysJson.decodeFromString(AppData.serializer(), text))

fun dumpAppData(data: AppData): String = DaysJson.encodeToString(AppData.serializer(), data)

fun isEmptyData(data: AppData?): Boolean {
    if (data == null) return true
    return data.todos.isEmpty() && data.countdowns.isEmpty() && data.notes.isEmpty() &&
        data.courses.isEmpty() && data.exams.isEmpty() && data.selfSchedules.isEmpty() &&
        data.calendarEvents.isEmpty() && data.recurringReminders.isEmpty()
}

fun fingerprint(data: AppData): String = DaysJson.encodeToString(AppData.serializer(), data)

private fun stamp(updatedAt: Long?, createdAt: Long?): Long = updatedAt ?: createdAt ?: 0L

fun mergeById(mine: List<Map<String, Any?>>, theirs: List<Map<String, Any?>>): List<Map<String, Any?>> {
    val merged = LinkedHashMap<String, Map<String, Any?>>()
    for (item in mine) merged[item["id"].toString()] = item
    for (item in theirs) {
        val id = item["id"].toString()
        val existing = merged[id]
        val mineStamp = stamp(existing?.get("updatedAt") as? Long, existing?.get("createdAt") as? Long)
        val theirStamp = stamp(item["updatedAt"] as? Long, item["createdAt"] as? Long)
        if (existing == null || theirStamp > mineStamp) merged[id] = item
    }
    return merged.values.toList()
}

fun <T> mergeByIdTyped(mine: List<T>, theirs: List<T>, idOf: (T) -> String, stampOf: (T) -> Long): List<T> {
    val merged = LinkedHashMap<String, T>()
    for (item in mine) merged[idOf(item)] = item
    for (item in theirs) {
        val existing = merged[idOf(item)]
        if (existing == null || stampOf(item) > stampOf(existing)) merged[idOf(item)] = item
    }
    return merged.values.toList()
}

fun mergeTombstones(mine: List<Tombstone>, theirs: List<Tombstone>): List<Tombstone> {
    val merged = LinkedHashMap<String, Tombstone>()
    for (item in mine + theirs) {
        val existing = merged[item.id]
        if (existing == null || item.deletedAt > existing.deletedAt) merged[item.id] = item
    }
    return merged.values.toList()
}

fun <T> rejectTombstoned(items: List<T>, tombstones: List<Tombstone>, idOf: (T) -> String, stampOf: (T) -> Long): List<T> {
    val deleted = tombstones.associate { it.id to it.deletedAt }
    return items.filter { item ->
        val at = deleted[idOf(item)]
        at == null || stampOf(item) > at
    }
}

fun mergeAppData(preferred: AppData, other: AppData): AppData {
    val tombstones = mergeTombstones(preferred.tombstones, other.tombstones)
    fun todoStamp(t: Todo) = t.createdAt
    fun noteStamp(n: Note) = n.updatedAt
    fun reminderStamp(r: RecurringReminder) = r.updatedAt
    return hydrateAppData(
        preferred.copy(
            todos = rejectTombstoned(mergeByIdTyped(preferred.todos, other.todos, { it.id }, ::todoStamp), tombstones, { it.id }, ::todoStamp),
            countdowns = rejectTombstoned(mergeByIdTyped(preferred.countdowns, other.countdowns, { it.id }, { it.createdAt }), tombstones, { it.id }, { it.createdAt }),
            notes = rejectTombstoned(mergeByIdTyped(preferred.notes, other.notes, { it.id }, ::noteStamp), tombstones, { it.id }, ::noteStamp),
            courses = rejectTombstoned(mergeByIdTyped(preferred.courses, other.courses, { it.id }, { it.createdAt }), tombstones, { it.id }, { it.createdAt }),
            exams = rejectTombstoned(mergeByIdTyped(preferred.exams, other.exams, { it.id }, { it.createdAt }), tombstones, { it.id }, { it.createdAt }),
            selfSchedules = rejectTombstoned(mergeByIdTyped(preferred.selfSchedules, other.selfSchedules, { it.id }, { it.createdAt }), tombstones, { it.id }, { it.createdAt }),
            calendarEvents = rejectTombstoned(mergeByIdTyped(preferred.calendarEvents, other.calendarEvents, { it.id }, { maxOf(it.updatedAt, it.createdAt) }), tombstones, { it.id }, { maxOf(it.updatedAt, it.createdAt) }),
            recurringReminders = rejectTombstoned(mergeByIdTyped(preferred.recurringReminders, other.recurringReminders, { it.id }, ::reminderStamp), tombstones, { it.id }, ::reminderStamp),
            reminderRules = rejectTombstoned(mergeByIdTyped(preferred.reminderRules, other.reminderRules, { it.id }, { it.updatedAt }), tombstones, { it.id }, { it.updatedAt }),
            holidayFavorites = rejectTombstoned(mergeByIdTyped(preferred.holidayFavorites, other.holidayFavorites, { it.id }, { it.createdAt }), tombstones, { it.id }, { it.createdAt }),
            holidaySettings = if (preferred.holidaySettings.updatedAt >= other.holidaySettings.updatedAt) preferred.holidaySettings else other.holidaySettings,
            terms = mergeByIdTyped(preferred.terms, other.terms, { it.id }, { 0 }),
            tombstones = tombstones,
        ),
    )
}

fun withTombstones(data: AppData, ids: List<String>): AppData {
    val now = nowMillis()
    val extra = ids.map { Tombstone(it, now) }
    val keep = data.tombstones.filter { it.id !in ids }
    return data.copy(tombstones = keep + extra)
}
