package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
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
class DateDetailTest {
    @get:Rule val rule = createComposeRule()

    @Test
    fun showsEveryItemAndSaveIsClickable() {
        var saved = ""
        var opened = ""
        rule.setContent {
            DaysTheme {
                DateDetailBody(
                    title = "2026 年 九月 25 日 星期五",
                    lunar = "八月十五",
                    holidayLines = listOf("节 中秋节 · 中国 · 放假"),
                    rows = listOf(
                        DayRow("day-event-a", "日程 09:00 讨论") { opened = "a" },
                        DayRow("day-event-b", "日程 14:00 实验") { opened = "b" },
                        DayRow("day-todo-a", "待办 交作业") {},
                        DayRow("day-todo-b", "待办 买书") {},
                    ),
                    savedNote = null,
                    editing = true,
                    draft = "带伞",
                    message = "",
                    onStartAdd = {},
                    onStartEdit = {},
                    onDraft = {},
                    onSave = { saved = "带伞" },
                    onCancel = {},
                    onAskDelete = {},
                    onClose = {},
                )
            }
        }
        rule.onNodeWithText("日程 09:00 讨论").assertIsDisplayed().performClick()
        rule.onNodeWithText("日程 14:00 实验").assertIsDisplayed()
        rule.onNodeWithText("待办 交作业").assertIsDisplayed()
        rule.onNodeWithText("待办 买书").assertIsDisplayed()
        rule.onNodeWithText("农历 八月十五").assertIsDisplayed()
        rule.onNodeWithTag("date-note-save").performClick()
        assertEquals("a", opened)
        assertEquals("带伞", saved)
    }

    @Test
    fun blankSaveKeepsDraft() {
        var draft = "还没写完"
        var message = ""
        rule.setContent {
            DaysTheme {
                DateDetailBody(
                    title = "2026 年 九月 25 日 星期五",
                    lunar = "",
                    holidayLines = emptyList(),
                    rows = emptyList(),
                    savedNote = null,
                    editing = true,
                    draft = draft,
                    message = message,
                    onStartAdd = {},
                    onStartEdit = {},
                    onDraft = { draft = it },
                    onSave = { if (draft.isBlank()) message = "请先填写备注" },
                    onCancel = {},
                    onAskDelete = {},
                    onClose = {},
                )
            }
        }
        rule.onNodeWithTag("date-note-input").performTextInput("")
        assertTrue(draft.isNotEmpty() || message.isEmpty())
    }
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w360dp-h780dp", application = LayoutTestApplication::class)
class DateDetailBounds360Test {
    @get:Rule val rule = createComposeRule()
    @Test fun saveSitsAboveNav() = assertNoteAboveNav(rule, false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp", application = LayoutTestApplication::class)
class DateDetailBounds412Test {
    @get:Rule val rule = createComposeRule()
    @Test fun saveSitsAboveNav() = assertNoteAboveNav(rule, false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w780dp-h360dp-land", application = LayoutTestApplication::class)
class DateDetailBoundsLandscapeTest {
    @get:Rule val rule = createComposeRule()
    @Test fun saveSitsAboveNav() = assertNoteAboveNav(rule, false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w360dp-h780dp", fontScale = 1.3f, application = LayoutTestApplication::class)
class DateDetailBoundsFontTest {
    @get:Rule val rule = createComposeRule()
    @Test fun saveSitsAboveNav() = assertNoteAboveNav(rule, false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp-night", application = LayoutTestApplication::class)
class DateDetailBoundsDarkTest {
    @get:Rule val rule = createComposeRule()
    @Test fun saveSitsAboveNav() = assertNoteAboveNav(rule, true)
}

private fun assertNoteAboveNav(rule: androidx.compose.ui.test.junit4.ComposeContentTestRule, dark: Boolean) {
    rule.setContent {
        DaysTheme(dark = dark) {
            Scaffold(Modifier.fillMaxSize(), bottomBar = { DaysBottomBar("calendar") {} }) { padding ->
                Box(Modifier.padding(padding).fillMaxSize()) {
                    DateDetailBody(
                        title = "日期",
                        lunar = "八月十五",
                        holidayLines = emptyList(),
                        rows = emptyList(),
                        savedNote = "已有备注",
                        editing = false,
                        draft = "",
                        message = "",
                        onStartAdd = {},
                        onStartEdit = {},
                        onDraft = {},
                        onSave = {},
                        onCancel = {},
                        onAskDelete = {},
                        onClose = {},
                    )
                }
            }
        }
    }
    rule.waitForIdle()
    rule.onNodeWithTag("date-note-edit").performScrollTo()
    val nav = rule.onNodeWithTag("bottom-nav").fetchSemanticsNode().boundsInRoot
    val edit = rule.onNodeWithTag("date-note-edit").fetchSemanticsNode().boundsInRoot
    assertTrue(edit.height >= 48f)
    assertTrue(edit.bottom <= nav.top + 1f)
    rule.onNodeWithTag("date-note-edit").performClick()
}
