package com.yydsxwh.kemiao.days.notify

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.occursOn
import com.yydsxwh.kemiao.days.data.model.parseIsoDate
import com.yydsxwh.kemiao.days.data.model.todayIso
import com.yydsxwh.kemiao.days.data.model.weekdayOf
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId

class ReminderScheduler(private val context: Context) {
    private val alarms = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    fun reschedule(data: AppData) {
        ensureChannel()
        if (!data.reminderSettings.enabled) return
        val today = todayIso()
        val weekday = weekdayOf(today)
        var request = 1000
        data.todos.filter { !it.done && it.dueDate == today }.forEach { todo ->
            schedule(request++, "待办", todo.title, today, todo.dueTime, todo.remindMinutes)
        }
        data.exams.filter { it.date == today }.forEach { exam ->
            schedule(request++, "考试", exam.name, exam.date, exam.startTime, exam.remindMinutes)
            if (data.reminderSettings.examAlsoHourBefore) {
                schedule(request++, "考试", exam.name + "（1小时）", exam.date, exam.startTime, 60)
            }
        }
        data.courses.filter { it.weekday == weekday }.forEach { course ->
            schedule(request++, "上课", course.name, today, course.startTime, course.remindMinutes)
        }
        data.selfSchedules.filter { it.weekday == weekday }.forEach { item ->
            schedule(request++, "自律", item.title, today, item.startTime, item.remindMinutes)
        }
        data.calendarEvents.filter { it.date == today }.forEach { event ->
            schedule(request++, "日程", event.title, event.date, event.startTime, event.remindMinutes)
        }
        data.recurringReminders.filter { it.enabled && occursOn(it, today) }.forEach { item ->
            schedule(request++, "周期提醒", item.title, today, item.remindTime, 0)
        }
    }

    private fun schedule(id: Int, kind: String, title: String, date: String, time: String?, minutesBefore: Int) {
        val clock = time?.takeIf { it.length >= 4 } ?: "09:00"
        val parts = clock.split(":")
        val hour = parts.getOrNull(0)?.toIntOrNull() ?: 9
        val minute = parts.getOrNull(1)?.toIntOrNull() ?: 0
        val whenAt = LocalDateTime.of(parseIsoDate(date), LocalTime.of(hour.coerceIn(0, 23), minute.coerceIn(0, 59)))
            .minusMinutes(minutesBefore.toLong())
        val millis = whenAt.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        if (millis <= System.currentTimeMillis()) return
        val intent = Intent(context, ReminderReceiver::class.java)
            .putExtra("title", kind)
            .putExtra("body", title)
        val pending = PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        runCatching {
            if (Build.VERSION.SDK_INT >= 31) {
                if (alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pending)
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pending)
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, millis, pending)
            }
        }
    }

    private fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "日事提醒", NotificationManager.IMPORTANCE_HIGH))
    }

    companion object { const val CHANNEL = "kemiao-days-reminders" }
}
