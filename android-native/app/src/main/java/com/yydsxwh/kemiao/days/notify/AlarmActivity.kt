package com.yydsxwh.kemiao.days.notify

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme

class AlarmActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ruleId = intent.getStringExtra("ruleId").orEmpty()
        val occurrenceKey = intent.getStringExtra("occurrenceKey").orEmpty()
        val data = LocalStore(this).load()
        val rule = data.reminderRules.find { it.id == ruleId && it.enabled }
        val title = rule?.let { displayTitle(data, it.targetType, it.targetId) } ?: intent.getStringExtra("title")
        setContent {
            DaysTheme {
                if (title == null || rule == null) {
                    Text("这条事项已经完成或删除", modifier = Modifier.padding(24.dp))
                } else {
                    AlarmScreen(title, rule.snoozeMinutes) { minutes ->
                        if (minutes != null) ReminderScheduler(this).snooze(ruleId, occurrenceKey, minutes)
                        finish()
                    }
                }
            }
        }
    }
}

@Composable
private fun AlarmScreen(title: String, snoozeMinutes: Int, onDone: (Int?) -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("闹钟", style = MaterialTheme.typography.labelLarge)
        Text(title, style = MaterialTheme.typography.headlineMedium)
        Button(onClick = { onDone(null) }) { Text("关闭") }
        Button(onClick = { onDone(snoozeMinutes.coerceIn(1, 120)) }) { Text("稍后提醒 $snoozeMinutes 分钟") }
        TextButton(onClick = { onDone(10) }) { Text("稍后提醒 10 分钟") }
    }
}
