package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.WEEKDAY_LABEL

/**
 * 周课表只在自己的滚动区域内吸顶。
 *
 * 星期栏必须和课程列共用同一个横向滚动状态，并且作为 LazyColumn 的 stickyHeader
 * 留在课表内容里。把它放到 Scaffold 外面或抬高 zIndex，下滑时会压住底部导航。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TimetableBoard(
    courses: List<Course>,
    modifier: Modifier = Modifier,
    onCourseClick: (Course) -> Unit = {},
) {
    val horizontal = rememberScrollState()
    val byDay = (1..7).associateWith { day -> courses.filter { it.weekday == day }.sortedBy { it.startTime } }
    val bottomId = byDay.getValue(1).lastOrNull()?.id
    val lastId = courses.maxByOrNull { it.weekday * 10000 + it.startTime.replace(":", "").toIntOrNull().orZero() }?.id
    LazyColumn(modifier.testTag("timetable-board")) {
        stickyHeader {
            Row(
                Modifier
                    .testTag("weekday-header")
                    .fillMaxWidth()
                    .background(MaterialTheme.colorScheme.surface)
                    .horizontalScroll(horizontal)
                    .padding(vertical = 8.dp),
            ) {
                (1..7).forEach { day ->
                    Text(
                        "周${WEEKDAY_LABEL.getOrElse(day) { "?" }}",
                        modifier = Modifier
                            .width(112.dp)
                            .testTag("weekday-label-$day")
                            .padding(horizontal = 4.dp),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        item {
            Row(Modifier.horizontalScroll(horizontal).testTag("course-columns")) {
                (1..7).forEach { day ->
                    Column(Modifier.width(112.dp).testTag("day-column-$day").padding(horizontal = 4.dp)) {
                        byDay.getValue(day).forEach { course ->
                            Card(
                                Modifier
                                    .fillMaxWidth()
                                    .padding(bottom = 8.dp)
                                    .testTag(
                                        when (course.id) {
                                            bottomId -> "course-bottom"
                                            lastId -> "course-last"
                                            else -> "course-${course.id}"
                                        },
                                    )
                                    .clickable { onCourseClick(course) },
                            ) {
                                Column(Modifier.padding(8.dp)) {
                                    Text(course.name, fontWeight = FontWeight.Medium, maxLines = 3, style = MaterialTheme.typography.bodySmall)
                                    Text("${course.startTime}-${course.endTime}", style = MaterialTheme.typography.labelSmall, maxLines = 1, softWrap = false)
                                    if (!course.location.isNullOrBlank()) {
                                        Text(course.location, style = MaterialTheme.typography.labelSmall, maxLines = 2)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

private fun Int?.orZero() = this ?: 0
