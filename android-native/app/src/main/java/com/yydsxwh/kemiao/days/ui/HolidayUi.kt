package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.app.DaysUiState
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.local.HolidayCache
import com.yydsxwh.kemiao.days.data.model.HolidayOccurrence
import com.yydsxwh.kemiao.days.data.model.ReminderRule
import com.yydsxwh.kemiao.days.data.model.daysUntil
import com.yydsxwh.kemiao.days.data.model.holidayMark
import com.yydsxwh.kemiao.days.data.model.holidaysOn
import com.yydsxwh.kemiao.days.data.model.todayIso
import com.yydsxwh.kemiao.days.data.model.uid
import com.yydsxwh.kemiao.days.notify.ReminderScheduler
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

@Composable
fun HolidaySettingsCard(state: DaysUiState, vm: DaysViewModel) {
    val context = LocalContext.current
    val settings = state.data.holidaySettings
    val updated = remember { HolidayCache.updatedAt(context) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("节日与假期", fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
            Text("节假日数据更新时间 $updated。离线时仍用这份缓存，不会把过期安排当成最新官方通知。", style = MaterialTheme.typography.bodySmall)
            SettingSwitch("显示中国节日", settings.showCn) { vm.updateHolidaySettings(settings.copy(showCn = it)) }
            SettingSwitch("显示美国节日", settings.showUs) { vm.updateHolidaySettings(settings.copy(showUs = it)) }
            SettingSwitch("法定假日 / 放假", settings.showPublic) { vm.updateHolidaySettings(settings.copy(showPublic = it)) }
            SettingSwitch("传统节日 / 文化节日", settings.showTraditional) { vm.updateHolidaySettings(settings.copy(showTraditional = it)) }
            SettingSwitch("调休补班", settings.showAdjusted) { vm.updateHolidaySettings(settings.copy(showAdjusted = it)) }
        }
    }
}

@Composable
private fun SettingSwitch(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        Switch(checked, onChange)
    }
}

@Composable
fun HolidayLines(state: DaysUiState, date: String): List<String> {
    val context = LocalContext.current
    val items = holidaysOn(HolidayCache.all(context), date, state.data.holidaySettings)
    return items.map { "${holidayMark(it)} ${it.name}" }
}

@Composable
fun HolidayBoard(state: DaysUiState, vm: DaysViewModel, upcomingOnly: Boolean) {
    val context = LocalContext.current
    val today = todayIso()
    val items = remember(state.data.holidaySettings, today, upcomingOnly) {
        HolidayCache.all(context).filter { holidaysOn(listOf(it), it.date, state.data.holidaySettings).isNotEmpty() }
            .filter { !upcomingOnly || it.date >= today }
            .filter { if (upcomingOnly) it.kind != "day_off" else true }
            .sortedBy { it.date }
            .take(if (upcomingOnly) 20 else 30)
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (upcomingOnly) "即将到来的节日" else "节日", fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold)
        items.forEach { item -> HolidayRow(state, vm, item, today) }
    }
}

@Composable
private fun HolidayRow(state: DaysUiState, vm: DaysViewModel, item: HolidayOccurrence, today: String) {
    val delta = daysUntil(item.date, today)
    val fav = state.data.holidayFavorites.any { it.stableKey == item.stableKey }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(12.dp)) {
            Text("${holidayMark(item)} ${item.name} · ${if (item.region == "CN") "中国" else "美国"}")
            Text(item.date + " · " + when {
                delta == 0 -> "就是今天"
                delta > 0 -> "还有 $delta 天"
                else -> "已经过去 ${-delta} 天"
            } + (item.description?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
            Row {
                TextButton(onClick = { vm.toggleHolidayFavorite(item.stableKey, item.region) }) { Text(if (fav) "已收藏" else "收藏") }
                TextButton(onClick = {
                    vm.saveReminderRule(ReminderRule(uid(), "holiday", item.stableKey, "notification", "absolute", triggerAt = item.date + "T09:00", enabled = true, createdAt = System.currentTimeMillis()))
                }) { Text("提前提醒") }
            }
        }
    }
}

@Composable
fun AlarmPermissionNote() {
    val context = LocalContext.current
    val scheduler = remember { ReminderScheduler(context) }
    val notifier = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    if (!scheduler.canExact()) {
        Text("还没有精确闹钟权限。现在只会用不精确提醒，不能保证准时。", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = {
            if (Build.VERSION.SDK_INT >= 31) {
                context.startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
            }
        }) { Text("去开启精确闹钟") }
    }
    if (Build.VERSION.SDK_INT >= 33) {
        TextButton(onClick = { notifier.launch(Manifest.permission.POST_NOTIFICATIONS) }) { Text("允许通知") }
    }
}

@Composable
fun ReminderRulesButton(state: DaysUiState, vm: DaysViewModel, targetType: String, targetId: String, startLabel: String) {
    var open by remember { mutableStateOf(false) }
    TextButton(onClick = { open = true }) { Text("提醒与闹钟") }
    if (!open) return
    val rules = state.data.reminderRules.filter { it.targetType == targetType && it.targetId == targetId }
    var absolute by remember { mutableStateOf("") }
    androidx.compose.material3.AlertDialog(
        onDismissRequest = { open = false },
        title = { Text("提醒与闹钟") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(startLabel, style = MaterialTheme.typography.bodySmall)
                Text("精确响铃需要本机授权。未授权时会降级成普通提醒，不会假装已经设成精确闹钟。", style = MaterialTheme.typography.bodySmall)
                AlarmPermissionNote()
                OutlinedTextField(absolute, { absolute = it }, label = { Text("指定时间 YYYY-MM-DDTHH:MM") })
                Button(onClick = {
                    if (absolute.length >= 16) {
                        vm.saveReminderRule(ReminderRule(uid(), targetType, targetId, "alarm", "absolute", absolute.take(16), enabled = true, createdAt = System.currentTimeMillis()))
                        absolute = ""
                    }
                }) { Text("添加闹钟") }
                listOf(0 to "准时", 5 to "提前 5 分钟", 10 to "提前 10 分钟", 60 to "提前 1 小时", 1440 to "提前 1 天").forEach { (minutes, label) ->
                    TextButton(onClick = {
                        vm.saveReminderRule(ReminderRule(uid(), targetType, targetId, "alarm", "relative", offsetMinutes = minutes, enabled = true, createdAt = System.currentTimeMillis()))
                    }) { Text(label) }
                }
                rules.forEach { rule ->
                    val whenLabel = if (rule.triggerMode == "absolute") rule.triggerAt.orEmpty() else "提前 ${rule.offsetMinutes ?: 0} 分钟"
                    Text("${if (rule.delivery == "alarm") "闹钟" else "通知"} · $whenLabel · ${if (rule.enabled) "开" else "关"}")
                    Row {
                        TextButton(onClick = { vm.saveReminderRule(rule.copy(enabled = !rule.enabled)) }) { Text(if (rule.enabled) "关闭" else "开启") }
                        TextButton(onClick = { vm.removeReminderRule(rule.id) }) { Text("删除") }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { open = false }) { Text("完成") } },
    )
}

fun previewFire(start: LocalDateTime, offsetMinutes: Int): String =
    start.minusMinutes(offsetMinutes.toLong()).format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
