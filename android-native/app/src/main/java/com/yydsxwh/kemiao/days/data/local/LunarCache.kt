package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import com.yydsxwh.kemiao.days.data.model.DaysJson
import kotlinx.serialization.Serializable

@Serializable
private data class LunarFile(val labels: Map<String, String> = emptyMap())

object LunarCache {
    @Volatile private var labels: Map<String, String>? = null

    fun label(context: Context, iso: String): String {
        labels?.let { return it[iso].orEmpty() }
        val parsed = runCatching {
            context.assets.open("lunar-days.json").bufferedReader().use { reader ->
                DaysJson.decodeFromString(LunarFile.serializer(), reader.readText()).labels
            }
        }.getOrDefault(emptyMap())
        labels = parsed
        return parsed[iso].orEmpty()
    }
}
