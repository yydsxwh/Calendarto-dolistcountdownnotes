package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalTime

private val WheelItem = 40.dp

@Composable
fun SecondClockWheels(
    hour: Int,
    minute: Int,
    second: Int,
    onChange: (Int, Int, Int) -> Unit,
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        SnapWheel("小时", 24, hour, Modifier.weight(1f)) { onChange(it, minute, second) }
        Text(":")
        SnapWheel("分钟", 60, minute, Modifier.weight(1f)) { onChange(hour, it, second) }
        Text(":")
        SnapWheel("秒", 60, second, Modifier.weight(1f)) { onChange(hour, minute, it) }
    }
}

fun nextMinute(now: LocalTime = LocalTime.now()): LocalTime =
    now.withSecond(0).withNano(0).plusMinutes(1)

@Composable
private fun SnapWheel(label: String, count: Int, value: Int, modifier: Modifier, onValue: (Int) -> Unit) {
    val safe = value.floorMod(count)
    var drag by remember { mutableFloatStateOf(0f) }
    Column(
        modifier.semantics { contentDescription = "$label ${safe.toString().padStart(2, '0')}" },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall)
        TextButton(
            onClick = { onValue((safe - 1).floorMod(count)) },
            modifier = Modifier.heightIn(min = 48.dp).testTag("wheel-prev-$label"),
        ) { Text("上一$label") }
        Box(
            Modifier
                .height(WheelItem * 3)
                .fillMaxWidth()
                .pointerInput(safe, count) {
                    detectVerticalDragGestures(
                        onDragEnd = { drag = 0f },
                        onVerticalDrag = { _, amount ->
                            drag += amount
                            if (drag <= -24f) {
                                onValue((safe + 1).floorMod(count))
                                drag = 0f
                            } else if (drag >= 24f) {
                                onValue((safe - 1).floorMod(count))
                                drag = 0f
                            }
                        },
                    )
                },
        ) {
            Box(
                Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .height(WheelItem)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            )
            Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                WheelDigit((safe - 1).floorMod(count), selected = false)
                WheelDigit(safe, selected = true)
                WheelDigit((safe + 1).floorMod(count), selected = false)
            }
        }
        TextButton(
            onClick = { onValue((safe + 1).floorMod(count)) },
            modifier = Modifier.heightIn(min = 48.dp).testTag("wheel-next-$label"),
        ) { Text("下一$label") }
    }
}

@Composable
private fun WheelDigit(value: Int, selected: Boolean) {
    Box(Modifier.height(WheelItem).fillMaxWidth(), contentAlignment = Alignment.Center) {
        Text(
            value.toString().padStart(2, '0'),
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
            color = if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun Int.floorMod(count: Int): Int = ((this % count) + count) % count
