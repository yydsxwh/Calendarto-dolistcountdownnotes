package com.yydsxwh.kemiao.days.ui

import android.app.Application
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.ui.theme.DaysTheme
import kotlin.math.abs
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** 布局测试不启动同步，避免 Robolectric 里 WorkManager 尚未初始化。 */
class LayoutTestApplication : Application()

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w360dp-h780dp", application = LayoutTestApplication::class)
class TimetableOverlap360Test {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = false)
    @Test fun bottomNavIsSingleRow() = assertNavRow(rule)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp", application = LayoutTestApplication::class)
class TimetableOverlap412Test {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w480dp-h1040dp", application = LayoutTestApplication::class)
class TimetableOverlapS25UltraTest {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w915dp-h412dp-land", application = LayoutTestApplication::class)
class TimetableOverlapLandscapeTest {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = false)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp", fontScale = 1.3f, application = LayoutTestApplication::class)
class TimetableOverlapFontTest {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = false)
    @Test fun bottomNavStaysOneLine() = assertNavRow(rule)
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], qualifiers = "w412dp-h915dp-night", application = LayoutTestApplication::class)
class TimetableOverlapDarkTest {
    @get:Rule val rule = createComposeRule()
    @Test fun headerAndLastRowClearBottomNav() = assertBoardClearsNav(rule, dark = true)
}

private fun assertNavRow(rule: androidx.compose.ui.test.junit4.ComposeContentTestRule) {
    rule.setContent {
        DaysTheme {
            Scaffold(Modifier.fillMaxSize(), bottomBar = { DaysBottomBar("timetable") {} }) { padding ->
                Box(Modifier.padding(padding).fillMaxSize())
            }
        }
    }
    val items = listOf("today", "calendar", "timetable", "days", "notes").map { id ->
        rule.onNodeWithTag("nav-item-$id").fetchSemanticsNode().boundsInRoot
    }
    val width = items.first().width
    items.forEach { bounds ->
        assertTrue("nav item has no size: $bounds", bounds.width > 0f && bounds.height >= 48f)
        assertTrue("nav items must share one row", abs(bounds.top - items.first().top) < 2f)
        assertTrue("nav items must be equal width", abs(bounds.width - width) < 2f)
    }
    val nav = rule.onNodeWithTag("bottom-nav").fetchSemanticsNode().boundsInRoot
    assertTrue("nav must sit at the bottom of the window", nav.bottom > items.first().bottom)
}

private fun assertBoardClearsNav(rule: androidx.compose.ui.test.junit4.ComposeContentTestRule, dark: Boolean) {
    rule.setContent {
        DaysTheme(dark = dark) {
            Scaffold(Modifier.fillMaxSize(), bottomBar = { DaysBottomBar("timetable") {} }) { padding ->
                TimetableBoard(sampleCourses(), Modifier.padding(padding).fillMaxSize())
            }
        }
    }
    rule.waitForIdle()
    rule.onNodeWithTag("course-bottom").performScrollTo()
    rule.onNodeWithTag("weekday-header").performTouchInput { swipeLeft() }
    val header = rule.onNodeWithTag("weekday-header").fetchSemanticsNode().boundsInRoot
    val nav = rule.onNodeWithTag("bottom-nav").fetchSemanticsNode().boundsInRoot
    val course = rule.onNodeWithTag("course-bottom").fetchSemanticsNode().boundsInRoot
    assertTrue("header has no size $header", header.height > 0f && header.width > 0f)
    assertTrue("weekday header overlaps bottom nav header=$header nav=$nav", header.bottom <= nav.top + 1f)
    assertTrue("last visible course overlaps bottom nav course=$course nav=$nav", course.bottom <= nav.top + 1f)
    assertTrue("header and nav must not intersect", header.bottom <= nav.top || header.top >= nav.bottom)
    val label = rule.onNodeWithTag("weekday-label-1").fetchSemanticsNode().boundsInRoot
    val column = rule.onNodeWithTag("day-column-1").fetchSemanticsNode().boundsInRoot
    assertTrue("weekday label and column drifted apart label=$label column=$column", abs(label.left - column.left) < 2f)
}

private fun sampleCourses(): List<Course> = buildList {
    for (day in 1..7) {
        for (slot in 0 until 8) {
            val hour = 8 + slot
            add(
                Course(
                    id = "d${day}s$slot",
                    name = "课程$day-$slot",
                    weekday = day,
                    startTime = "%02d:10".format(hour),
                    endTime = "%02d:50".format(hour),
                    color = "#2563eb",
                    remindMinutes = 15,
                    createdAt = 1,
                ),
            )
        }
    }
}
