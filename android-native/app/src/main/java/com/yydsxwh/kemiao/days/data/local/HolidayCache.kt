package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import com.yydsxwh.kemiao.days.data.model.DaysJson
import com.yydsxwh.kemiao.days.data.model.HolidayCatalogFile
import com.yydsxwh.kemiao.days.data.model.HolidayOccurrence

object HolidayCache {
    @Volatile private var cached: HolidayCatalogFile? = null

    fun load(context: Context): HolidayCatalogFile {
        cached?.let { return it }
        val parsed = context.assets.open("holidays.json").bufferedReader().use { reader ->
            DaysJson.decodeFromString(HolidayCatalogFile.serializer(), reader.readText())
        }
        cached = parsed
        return parsed
    }

    fun all(context: Context): List<HolidayOccurrence> = load(context).occurrences

    fun updatedAt(context: Context): String = load(context).updatedAt
}
