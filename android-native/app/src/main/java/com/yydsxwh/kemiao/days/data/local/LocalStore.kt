package com.yydsxwh.kemiao.days.data.local

import android.content.Context
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.dumpAppData
import com.yydsxwh.kemiao.days.data.model.emptyData
import com.yydsxwh.kemiao.days.data.model.hydrateAppData
import com.yydsxwh.kemiao.days.data.model.parseAppDataJson
import java.io.File

/**
 * 每个账号一份本地文件。退出登录只是切回未登录目录，不把上一个账号的数据留在界面上，
 * 也不让下一个账号的同步把两份数据并到一起。
 */
class LocalStore(context: Context) {
    private val root = File(context.filesDir, "accounts").apply { mkdirs() }
    private val legacyData = File(context.filesDir, "kemiao-days-v1.json")
    private val legacyVersion = File(context.filesDir, "kemiao-days-version.txt")
    private var bucket = ANONYMOUS

    init {
        migrateLegacy()
    }

    fun currentBucket(): String = bucket

    fun bucketId(sub: String?): String = sanitize(sub)

    @Synchronized
    fun useAccount(sub: String?) {
        bucket = sanitize(sub)
    }

    /**
     * 只在「还没有人领走过未登录数据」时，把离线编辑交给第一次登录的账号。
     * 之后换账号不会再复制这份数据。
     */
    @Synchronized
    fun adoptAnonymousIfUnclaimed(sub: String?): Boolean {
        val safe = sanitize(sub)
        if (safe == ANONYMOUS) return false
        val marker = File(root, "anonymous-adopted-by.txt")
        if (marker.exists()) return false
        val source = File(root, "$ANONYMOUS/data.json")
        val dest = File(root, "$safe/data.json")
        if (!source.exists() || dest.exists()) {
            marker.writeText(safe)
            return false
        }
        dest.parentFile?.mkdirs()
        source.copyTo(dest, overwrite = false)
        val version = File(root, "$ANONYMOUS/version.txt")
        if (version.exists()) version.copyTo(File(root, "$safe/version.txt"), overwrite = false)
        marker.writeText(safe)
        return true
    }

    @Synchronized
    fun load(): AppData = read(dataFile())

    @Synchronized
    fun save(data: AppData) {
        val file = dataFile()
        file.parentFile?.mkdirs()
        file.writeText(dumpAppData(data))
    }

    fun version(): Long = try {
        versionFile().readText().trim().toLong()
    } catch (_: Exception) {
        0L
    }

    fun saveVersion(version: Long) {
        val file = versionFile()
        file.parentFile?.mkdirs()
        file.writeText(version.toString())
    }

    fun clearAll() {
        dataFile().delete()
        versionFile().delete()
    }

    private fun migrateLegacy() {
        if (!legacyData.exists()) return
        val dest = File(root, "$ANONYMOUS/data.json")
        if (!dest.exists()) {
            dest.parentFile?.mkdirs()
            legacyData.copyTo(dest)
            if (legacyVersion.exists()) legacyVersion.copyTo(File(root, "$ANONYMOUS/version.txt"))
        }
        legacyData.delete()
        legacyVersion.delete()
    }

    private fun dataFile() = File(root, "$bucket/data.json")
    private fun versionFile() = File(root, "$bucket/version.txt")

    private fun read(file: File): AppData = try {
        if (!file.exists()) emptyData() else hydrateAppData(parseAppDataJson(file.readText()))
    } catch (_: Exception) {
        emptyData()
    }

    private fun sanitize(sub: String?): String {
        val raw = sub?.trim().orEmpty()
        if (raw.isEmpty()) return ANONYMOUS
        val cleaned = raw.replace(Regex("[^A-Za-z0-9_-]"), "_")
        return cleaned.ifBlank { ANONYMOUS }
    }

    companion object {
        const val ANONYMOUS = "anonymous"
    }
}
