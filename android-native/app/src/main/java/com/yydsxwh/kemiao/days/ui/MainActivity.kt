package com.yydsxwh.kemiao.days.ui

import android.Manifest
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.core.app.ActivityCompat
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.sync.SyncWorker
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme

class MainActivity : ComponentActivity() {
    private val viewModel: DaysViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        SyncWorker.enqueue(this)
        if (Build.VERSION.SDK_INT >= 33) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11)
        }
        viewModel.consumeHandoff(intent?.data)
        setContent {
            DaysTheme {
                LaunchedEffect(intent?.data) { viewModel.consumeHandoff(intent?.data) }
                DaysApp(viewModel = viewModel, activity = this)
            }
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        viewModel.consumeHandoff(intent.data)
    }

    override fun onResume() {
        super.onResume()
        viewModel.syncNow()
    }
}
