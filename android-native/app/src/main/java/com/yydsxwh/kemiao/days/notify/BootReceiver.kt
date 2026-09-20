package com.yydsxwh.kemiao.days.notify

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.yydsxwh.kemiao.days.data.local.LocalStore

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        ReminderScheduler(context).reschedule(LocalStore(context).load())
    }
}
