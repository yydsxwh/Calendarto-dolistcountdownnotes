package com.yydsxwh.kemiao.days.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.yydsxwh.kemiao.days.data.local.HolidayCache
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.planFires
import java.time.ZoneId

class ReminderScheduler(private val context: Context) {
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun canExact(): Boolean = if (Build.VERSION.SDK_INT >= 31) alarms.canScheduleExactAlarms() else true

    fun reschedule(data: AppData) {
        ensureChannels()
        cancelStored()
        if (!data.reminderSettings.enabled) return
        val holidays = runCatching { HolidayCache.all(context) }.getOrDefault(emptyList())
        val now = java.time.LocalDateTime.now()
        val plans = planFires(data, holidays, now)
        val ids = mutableSetOf<String>()
        plans.forEach { plan ->
            val code = plan.occurrenceKey.hashCode() and 0x7fffffff
            val triggerAt = plan.fireAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
            if (triggerAt <= System.currentTimeMillis()) return@forEach
            val intent = Intent(context, ReminderReceiver::class.java)
                .putExtra("ruleId", plan.ruleId)
                .putExtra("occurrenceKey", plan.occurrenceKey)
                .putExtra("delivery", plan.delivery)
            val pending = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val show = PendingIntent.getActivity(
                context,
                code,
                Intent(context, AlarmActivity::class.java).putExtra("ruleId", plan.ruleId).putExtra("occurrenceKey", plan.occurrenceKey),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            runCatching {
                if (plan.delivery == "alarm" && canExact()) {
                    alarms.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAt, show), pending)
                } else if (canExact()) {
                    alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                } else {
                    alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
                }
                ids += code.toString()
            }
        }
        prefs.edit().putStringSet(KEY_IDS, ids).apply()
    }

    fun snooze(ruleId: String, occurrenceKey: String, minutes: Int) {
        val code = (occurrenceKey + ":snooze:" + System.currentTimeMillis()).hashCode() and 0x7fffffff
        val triggerAt = System.currentTimeMillis() + minutes * 60_000L
        val intent = Intent(context, ReminderReceiver::class.java)
            .putExtra("ruleId", ruleId)
            .putExtra("occurrenceKey", occurrenceKey)
            .putExtra("delivery", "alarm")
        val pending = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        runCatching {
            if (canExact()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
            else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending)
        }
        val ids = prefs.getStringSet(KEY_IDS, emptySet()).orEmpty().toMutableSet()
        ids += code.toString()
        prefs.edit().putStringSet(KEY_IDS, ids).apply()
    }

    private fun cancelStored() {
        val ids = prefs.getStringSet(KEY_IDS, emptySet()).orEmpty()
        ids.forEach { raw ->
            val code = raw.toIntOrNull() ?: return@forEach
            val intent = Intent(context, ReminderReceiver::class.java)
            val pending = PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
            if (pending != null) alarms.cancel(pending)
        }
        prefs.edit().remove(KEY_IDS).apply()
    }

    private fun ensureChannels() {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "日事提醒", NotificationManager.IMPORTANCE_DEFAULT))
        val alarm = NotificationChannel(ALARM_CHANNEL, "日事闹钟", NotificationManager.IMPORTANCE_HIGH)
        alarm.enableVibration(true)
        manager.createNotificationChannel(alarm)
    }

    companion object {
        const val CHANNEL = "kemiao-days-reminders"
        const val ALARM_CHANNEL = "kemiao-days-alarms"
        private const val PREFS = "kemiao-alarm-ids"
        private const val KEY_IDS = "ids"
    }
}
