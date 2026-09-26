package com.yydsxwh.kemiao.days.data.sync

import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.fingerprint
import com.yydsxwh.kemiao.days.data.model.isEmptyData
import com.yydsxwh.kemiao.days.data.model.mergeAppData
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import com.yydsxwh.kemiao.days.data.remote.SyncConflict
import com.yydsxwh.kemiao.days.data.remote.SyncUnauthorized
import com.yydsxwh.kemiao.days.data.remote.SyncUnavailable

enum class SyncState { Starting, SignedOut, Syncing, Synced, Offline, Error, LocalOnly }

data class SyncResult(
    val state: SyncState,
    val data: AppData? = null,
    val version: Long? = null,
    val pending: Boolean = false,
)

class SyncEngine(private val api: DaysApi) {
    suspend fun reconcile(local: AppData, version: Long): SyncResult {
        return try {
            val remote = api.pull()
            if (!remote.authenticated) return SyncResult(SyncState.SignedOut)
            val localEmpty = isEmptyData(local)
            val remoteEmpty = isEmptyData(remote.data)
            when {
                remote.data != null && !remoteEmpty && localEmpty ->
                    SyncResult(SyncState.Synced, remote.data, remote.version)
                !localEmpty && remoteEmpty -> {
                    val pushed = api.push(local, remote.version)
                    SyncResult(SyncState.Synced, local, pushed.version)
                }
                remote.data != null && fingerprint(local) != fingerprint(remote.data) -> {
                    val merged = mergeAppData(local, remote.data)
                    val pushed = try {
                        api.push(merged, remote.version)
                    } catch (conflict: SyncConflict) {
                        val again = mergeAppData(merged, conflict.remote.data ?: remote.data)
                        val retry = api.push(again, conflict.remote.version)
                        return SyncResult(SyncState.Synced, again, retry.version)
                    }
                    SyncResult(SyncState.Synced, merged, pushed.version)
                }
                else -> SyncResult(SyncState.Synced, local, remote.version)
            }
        } catch (_: SyncUnauthorized) {
            SyncResult(SyncState.SignedOut)
        } catch (_: SyncUnavailable) {
            SyncResult(SyncState.Offline, pending = true)
        } catch (_: Exception) {
            SyncResult(SyncState.Error, pending = true)
        }
    }

    suspend fun pushOnly(local: AppData, version: Long): SyncResult {
        return try {
            val pushed = api.push(local, version)
            SyncResult(SyncState.Synced, local, pushed.version)
        } catch (conflict: SyncConflict) {
            val merged = mergeAppData(local, conflict.remote.data ?: local)
            return try {
                val pushed = api.push(merged, conflict.remote.version)
                SyncResult(SyncState.Synced, merged, pushed.version)
            } catch (_: Exception) {
                SyncResult(SyncState.Error, merged, pending = true)
            }
        } catch (_: SyncUnauthorized) {
            SyncResult(SyncState.SignedOut)
        } catch (_: SyncUnavailable) {
            SyncResult(SyncState.Offline, pending = true)
        } catch (_: Exception) {
            SyncResult(SyncState.Error, pending = true)
        }
    }
}
