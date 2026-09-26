package com.yydsxwh.kemiao.days.notify

import android.Manifest
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.yydsxwh.kemiao.days.R
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.data.model.AppData

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val ruleId = intent.getStringExtra("ruleId") ?: return
        val occurrenceKey = intent.getStringExtra("occurrenceKey") ?: ruleId
        val data = LocalStore(context).load()
        val rule = data.reminderRules.find { it.id == ruleId && it.enabled } ?: return
        val title = displayTitle(data, rule.targetType, rule.targetId) ?: return
        if (rule.delivery == "alarm") {
            val open = Intent(context, AlarmActivity::class.java)
                .putExtra("ruleId", ruleId)
                .putExtra("occurrenceKey", occurrenceKey)
                .putExtra("title", title)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(open)
        }
        if (!canNotify(context)) return
        val launch = PendingIntent.getActivity(
            context,
            occurrenceKey.hashCode(),
            Intent(context, AlarmActivity::class.java).putExtra("ruleId", ruleId).putExtra("occurrenceKey", occurrenceKey).putExtra("title", title),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, if (rule.delivery == "alarm") ReminderScheduler.ALARM_CHANNEL else ReminderScheduler.CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_days)
            .setContentTitle(if (rule.delivery == "alarm") "闹钟" else "提醒")
            .setContentText(title)
            .setAutoCancel(true)
            .setContentIntent(launch)
            .setCategory(if (rule.delivery == "alarm") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .build()
        NotificationManagerCompat.from(context).notify(occurrenceKey.hashCode() and 0x7fffffff, notification)
    }

    private fun canNotify(context: Context): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
}

fun displayTitle(data: AppData, targetType: String, targetId: String): String? {
    return when (targetType) {
        "todo" -> data.todos.find { it.id == targetId && !it.done }?.title
        "exam" -> data.exams.find { it.id == targetId }?.name
        "event" -> data.calendarEvents.find { it.id == targetId }?.title
        "course" -> data.courses.find { it.id == targetId }?.name
        "self" -> data.selfSchedules.find { it.id == targetId }?.title
        "day" -> data.countdowns.find { it.id == targetId }?.title
        "holiday" -> targetId
        "recurring" -> data.recurringReminders.find { it.id == targetId && it.enabled }?.title
        else -> null
    }
}
