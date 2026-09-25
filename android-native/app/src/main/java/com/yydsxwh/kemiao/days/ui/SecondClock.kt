package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.snapping.rememberSnapFlingBehavior
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.time.LocalTime
import kotlinx.coroutines.flow.distinctUntilChanged

private const val WheelLoops = 80
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
    val state = rememberLazyListState(initialFirstVisibleItemIndex = WheelLoops / 2 * count + value.coerceIn(0, count - 1))
    val fling = rememberSnapFlingBehavior(lazyListState = state)
    LaunchedEffect(state) {
        snapshotFlow { state.firstVisibleItemIndex }
            .distinctUntilChanged()
            .collect { index -> onValue(index.floorMod(count)) }
    }
    LaunchedEffect(value) {
        val current = state.firstVisibleItemIndex.floorMod(count)
        if (current != value) {
            val page = state.firstVisibleItemIndex / count
            state.scrollToItem(page * count + value)
        }
    }
    Column(modifier.semantics { contentDescription = "$label ${value.toString().padStart(2, '0')}" }, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(label, style = MaterialTheme.typography.labelSmall)
        TextButton(onClick = { onValue((value - 1).floorMod(count)) }) { Text("上一$label") }
        Box(Modifier.height(WheelItem * 3).fillMaxWidth()) {
            Box(
                Modifier
                    .align(Alignment.Center)
                    .fillMaxWidth()
                    .height(WheelItem)
                    .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f)),
            )
            LazyColumn(
                state = state,
                flingBehavior = fling,
                contentPadding = PaddingValues(vertical = WheelItem),
                modifier = Modifier.height(WheelItem * 3).fillMaxWidth(),
            ) {
                items(count * WheelLoops) { index ->
                    val shown = index.floorMod(count)
                    Box(Modifier.height(WheelItem).fillMaxWidth(), contentAlignment = Alignment.Center) {
                        Text(
                            shown.toString().padStart(2, '0'),
                            fontWeight = if (shown == value) FontWeight.Bold else FontWeight.Normal,
                            color = if (shown == value) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
        TextButton(onClick = { onValue((value + 1).floorMod(count)) }) { Text("下一$label") }
    }
}

private fun Int.floorMod(count: Int): Int = ((this % count) + count) % count
