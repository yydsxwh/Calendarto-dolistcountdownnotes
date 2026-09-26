package com.yydsxwh.kemiao.days

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.yydsxwh.kemiao.days.ui.MainActivity
import org.junit.Rule
import org.junit.Test

class TodaySmokeTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun showsBrand() {
        rule.onNodeWithText("颗秒日事", substring = true).assertExists()
    }
}
