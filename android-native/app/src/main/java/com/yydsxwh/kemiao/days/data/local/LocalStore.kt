package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.dumpAppData
import com.yydsxwh.kemiao.days.data.model.emptyData
import com.yydsxwh.kemiao.days.data.model.hydrateAppData
import com.yydsxwh.kemiao.days.data.model.parseAppDataJson
import java.io.File

class LocalStore(context: Context) {
    private val file = File(context.filesDir, "kemiao-days-v1.json")
    private val versionFile = File(context.filesDir, "kemiao-days-version.txt")

    @Synchronized
    fun load(): AppData = try {
        if (!file.exists()) emptyData() else hydrateAppData(parseAppDataJson(file.readText()))
    } catch (_: Exception) {
        emptyData()
    }

    @Synchronized
    fun save(data: AppData) {
        file.writeText(dumpAppData(data))
    }

    fun version(): Long = try {
        versionFile.readText().trim().toLong()
    } catch (_: Exception) {
        0L
    }

    fun saveVersion(version: Long) {
        versionFile.writeText(version.toString())
    }

    fun clearAll() {
        file.delete()
        versionFile.delete()
    }
}
