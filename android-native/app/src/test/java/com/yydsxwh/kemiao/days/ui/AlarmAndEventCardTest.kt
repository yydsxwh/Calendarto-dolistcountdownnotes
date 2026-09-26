package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.model.ReminderRule
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp", application = LayoutTestApplication::class)
class AlarmDialogClickTest {
    @get:Rule val rule = createComposeRule()

    @Test fun confirmReportsChosenTime() {
        var saved: String? = null
        rule.setContent {
            DaysTheme {
                ReminderEditorBody(
                    startLabel = "小组讨论",
                    date = "2026-09-25",
                    hour = 9,
                    minute = 55,
                    second = 30,
                    error = null,
                    rules = emptyList(),
                    onDate = {},
                    onTime = { _, _, _ -> },
                    onNow = {},
                    onClear = {},
                    onConfirm = { saved = "2026-09-25T09:55:30" },
                    onRelative = {},
                    onToggle = {},
                    onDelete = {},
                    onDismiss = {},
                )
            }
        }
        rule.onNodeWithTag("alarm-confirm").performClick()
        assertEquals("2026-09-25T09:55:30", saved)
    }

    @Test fun invalidDateShowsErrorAndDoesNotSave() {
        var saved = 0
        val error = androidx.compose.runtime.mutableStateOf<String?>(null)
        rule.setContent {
            DaysTheme {
                ReminderEditorBody(
                    startLabel = "小组讨论",
                    date = "bad",
                    hour = 9,
                    minute = 0,
                    second = 0,
                    error = error.value,
                    rules = emptyList(),
                    onDate = {},
                    onTime = { _, _, _ -> },
                    onNow = {},
                    onClear = {},
                    onConfirm = {
                        val trigger = com.yydsxwh.kemiao.days.data.model.absoluteTriggerAt("bad", 9, 0, 0)
                        if (trigger == null) error.value = "日期或时间不合法" else saved += 1
                    },
                    onRelative = {},
                    onToggle = {},
                    onDelete = {},
                    onDismiss = {},
                )
            }
        }
        rule.onNodeWithTag("alarm-confirm").performClick()
        rule.onNodeWithTag("alarm-error").assertIsDisplayed()
        assertEquals(0, saved)
    }

    @Test fun cancelNowAndClearAreClickable() {
        var now = 0
        var clear = 0
        var cancel = 0
        rule.setContent {
            DaysTheme {
                ReminderEditorBody(
                    startLabel = "事项",
                    date = "2026-09-25",
                    hour = 8,
                    minute = 0,
                    second = 0,
                    error = null,
                    rules = listOf(ReminderRule("r", "event", "e", "alarm", "absolute", "2026-09-25T08:00:00", enabled = true)),
                    onDate = {},
                    onTime = { _, _, _ -> },
                    onNow = { now += 1 },
                    onClear = { clear += 1 },
                    onConfirm = {},
                    onRelative = {},
                    onToggle = {},
                    onDelete = {},
                    onDismiss = { cancel += 1 },
                )
            }
        }
        rule.onNodeWithTag("alarm-now").performClick()
        rule.onNodeWithTag("alarm-clear").performClick()
        rule.onNodeWithTag("alarm-cancel").performClick()
        rule.onNodeWithTag("wheel-next-小时").performClick()
        assertEquals(1, now)
        assertEquals(1, clear)
        assertEquals(1, cancel)
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w360dp-h780dp", application = LayoutTestApplication::class)
class EventCardBounds360Test {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp", application = LayoutTestApplication::class)
class EventCardBounds412Test {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w480dp-h1040dp", application = LayoutTestApplication::class)
class EventCardBoundsS25Test {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w780dp-h360dp-land", application = LayoutTestApplication::class)
class EventCardBoundsLandscapeTest {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w360dp-h780dp", fontScale = 1.3f, application = LayoutTestApplication::class)
class EventCardBoundsFontTest {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp-night", application = LayoutTestApplication::class)
class EventCardBoundsDarkTest {
    @get:Rule val rule = createComposeRule()
    @Test fun actionsSitInsideCardAndAboveNav() = assertEventActions(rule, dark = true)
}

private fun assertEventActions(rule: ComposeContentTestRule, dark: Boolean) {
    rule.setContent {
        DaysTheme(dark = dark) {
            Scaffold(Modifier.fillMaxSize(), bottomBar = { DaysBottomBar("calendar") {} }) { padding ->
                Box(Modifier.padding(padding).fillMaxSize()) {
                    Card(Modifier.padding(16.dp).testTag("event-card")) {
                        androidx.compose.foundation.layout.Column(Modifier.padding(12.dp)) {
                            Text("小组讨论")
                            EventActionRow(
                                onEdit = {},
                                onDelete = {},
                                editTag = "event-edit",
                                deleteTag = "event-delete",
                                alarm = {
                                    androidx.compose.material3.TextButton(
                                        onClick = {},
                                        modifier = Modifier.heightIn(min = 48.dp).testTag("event-alarm"),
                                    ) { Text("提醒与闹钟") }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
    rule.waitForIdle()
    val card = rule.onNodeWithTag("event-card").fetchSemanticsNode().boundsInRoot
    val nav = rule.onNodeWithTag("bottom-nav").fetchSemanticsNode().boundsInRoot
    listOf("event-edit", "event-delete", "event-alarm").forEach { tag ->
        val node = rule.onNodeWithTag(tag)
        node.assertIsDisplayed()
        val bounds = node.fetchSemanticsNode().boundsInRoot
        assertTrue("$tag height ${bounds.height}", bounds.height >= 48f)
        assertTrue("$tag left of card", bounds.left >= card.left - 1f)
        assertTrue("$tag right of card", bounds.right <= card.right + 1f)
        assertTrue("$tag above card bottom", bounds.bottom <= card.bottom - 4f)
        assertTrue("$tag above nav", bounds.bottom <= nav.top + 1f)
    }
    rule.onNodeWithText("编辑").performClick()
    rule.onNodeWithText("删除").performClick()
}
