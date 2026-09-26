package com.yydsxwh.kemiao.days.data.model

import kotlinx.serialization.Serializable

@Serializable
data class HolidayCatalogFile(
    val version: String,
    val updatedAt: String,
    val occurrences: List<HolidayOccurrence> = emptyList(),
)

@Serializable
data class HolidayOccurrence(
    val id: String,
    val stableKey: String,
    val region: String,
    val date: String,
    val name: String,
    val kind: String,
    val isDayOff: Boolean = false,
    val isAdjustedWorkday: Boolean = false,
    val source: String = "",
    val sourceYear: Int = 0,
    val sourceVersion: String = "",
    val description: String? = null,
)

fun holidayVisible(item: HolidayOccurrence, settings: HolidaySettings): Boolean {
    if (item.region == "CN" && !settings.showCn) return false
    if (item.region == "US" && !settings.showUs) return false
    if (item.kind == "adjusted_workday") return settings.showAdjusted
    if ((item.kind == "public_holiday" || item.kind == "day_off") && !settings.showPublic) return false
    if ((item.kind == "traditional_festival" || item.kind == "observance") && !settings.showTraditional) return false
    return true
}

fun holidaysOn(all: List<HolidayOccurrence>, date: String, settings: HolidaySettings) =
    all.filter { it.date == date && holidayVisible(it, settings) }

fun holidayMark(item: HolidayOccurrence) = when {
    item.isAdjustedWorkday -> "班"
    item.isDayOff -> "休"
    item.kind == "public_holiday" -> "节"
    else -> "念"
}

fun daysUntil(date: String, today: String): Int {
    val a = parseIsoDate(date).toEpochDay()
    val b = parseIsoDate(today).toEpochDay()
    return (a - b).toInt()
}
