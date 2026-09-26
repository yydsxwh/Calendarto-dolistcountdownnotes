package com.yydsxwh.kemiao.days

import android.app.Application
import com.yydsxwh.kemiao.days.data.sync.SyncWorker

class DaysApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        SyncWorker.enqueue(this)
    }
}
