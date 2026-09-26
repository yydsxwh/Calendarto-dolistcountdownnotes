package com.yydsxwh.kemiao.days.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.Exam
import com.yydsxwh.kemiao.days.data.model.HOUR_PX
import com.yydsxwh.kemiao.days.data.model.WEEKDAY_LABEL
import com.yydsxwh.kemiao.days.data.model.axisHeight
import com.yydsxwh.kemiao.days.data.model.axisOffset
import com.yydsxwh.kemiao.days.data.model.buildTimeAxis
import com.yydsxwh.kemiao.days.data.model.clockMinutes
import com.yydsxwh.kemiao.days.data.model.layoutBlocks
import com.yydsxwh.kemiao.days.ui.theme.Hot
import com.yydsxwh.kemiao.days.ui.theme.Ink
import com.yydsxwh.kemiao.days.ui.theme.Muted
import com.yydsxwh.kemiao.days.ui.theme.Paper

private val Gutter = 52.dp

/**
 * 网页版周视图：左侧时间轴按开课、下课钟点标刻度，七列课程按钟点落位。
 * 星期栏留在课表自己的滚动区里，下滑时不压住底部导航。
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun TimetableBoard(
    courses: List<Course>,
    modifier: Modifier = Modifier,
    exams: List<Exam> = emptyList(),
    hiddenHours: List<Int> = emptyList(),
    columnDates: Map<Int, String> = emptyMap(),
    onCourseClick: (Course) -> Unit = {},
    onOpenCourse: (Course, String) -> Unit = { course, _ -> onCourseClick(course) },
) {
    val displayHidden = if (courses.isEmpty() && exams.isEmpty() && hiddenHours.isEmpty()) {
        (0..7).toList() + (19..23).toList()
    } else {
        hiddenHours
    }
    val axis = remember(courses, exams, displayHidden) {
        buildTimeAxis(displayHidden, HOUR_PX, courses, exams)
    }
    val days = (1..7).toList()
    val byDay = days.associateWith { day -> courses.filter { it.weekday == day } }
    val bottomId = byDay.getValue(1).maxByOrNull { clockMinutes(it.endTime) ?: 0 }?.id
    LazyColumn(modifier.testTag("timetable-board")) {
        stickyHeader {
            Row(
                Modifier
                    .testTag("weekday-header")
                    .fillMaxWidth()
                    .background(Paper)
                    .padding(vertical = 6.dp),
            ) {
                Text(
                    "时间",
                    Modifier.width(Gutter),
                    color = Muted,
                    style = MaterialTheme.typography.labelSmall,
                    maxLines = 1,
                    softWrap = false,
                )
                days.forEach { day ->
                    Text(
                        "周${WEEKDAY_LABEL.getOrElse(day) { "?" }}",
                        modifier = Modifier
                            .weight(1f)
                            .testTag("weekday-label-$day"),
                        maxLines = 1,
                        softWrap = false,
                        overflow = TextOverflow.Ellipsis,
                        fontWeight = FontWeight.SemiBold,
                        color = Ink,
                    )
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth().height((axisHeight(axis) + 20f).dp).testTag("course-columns")) {
                Box(Modifier.width(Gutter).fillMaxHeight().testTag("time-axis")) {
                    axis.marks.forEach { mark ->
                        Text(
                            mark.label,
                            Modifier.offset(y = axisOffset(mark.minutes, axis).dp),
                            color = if (mark.kind == "event") Ink else Muted,
                            style = MaterialTheme.typography.labelSmall,
                            maxLines = 1,
                            softWrap = false,
                        )
                    }
                }
                days.forEach { day ->
                    DayColumn(
                        courses = byDay.getValue(day),
                        exams = exams.filter { weekdayOfIso(it.date) == day },
                        axis = axis,
                        bottomId = bottomId,
                        onCourseClick = onCourseClick,
                        columnIso = columnDates[day],
                        onOpenCourse = onOpenCourse,
                        modifier = Modifier.weight(1f).fillMaxHeight().testTag("day-column-$day"),
                    )
                }
            }
        }
    }
}

@Composable
private fun DayColumn(
    courses: List<Course>,
    exams: List<Exam>,
    axis: com.yydsxwh.kemiao.days.data.model.TimeAxis,
    bottomId: String?,
    onCourseClick: (Course) -> Unit,
    columnIso: String?,
    onOpenCourse: (Course, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val blocks = layoutBlocks(
        courses.mapNotNull { course ->
            val start = clockMinutes(course.startTime) ?: return@mapNotNull null
            val end = clockMinutes(course.endTime) ?: return@mapNotNull null
            Triple(course.id, start, end)
        },
        axis.hiddenHours,
        axis.hourPx,
        axis,
    )
    val examBlocks = layoutBlocks(
        exams.mapNotNull { exam ->
            val start = clockMinutes(exam.startTime) ?: return@mapNotNull null
            val end = clockMinutes(exam.endTime ?: exam.startTime)?.takeIf { it > start } ?: (start + 90)
            Triple(exam.id, start, end)
        },
        axis.hiddenHours,
        axis.hourPx,
        axis,
    )
    Box(modifier) {
        axis.marks.forEach { mark ->
            Box(
                Modifier
                    .fillMaxWidth()
                    .offset(y = axisOffset(mark.minutes, axis).dp)
                    .height(1.dp)
                    .background(if (mark.kind == "event") Hot.copy(alpha = 0.28f) else Muted.copy(alpha = 0.18f)),
            )
        }
        BoxWithConstraints(Modifier.fillMaxSize()) {
            blocks.forEach { block ->
                val course = courses.first { it.id == block.id }
                val colWidth = maxWidth / block.cols
                Card(
                    modifier = Modifier
                        .offset(x = colWidth * block.col, y = block.top.dp)
                        .width(colWidth)
                        .height(block.height.dp)
                        .padding(1.dp)
                        .testTag(if (course.id == bottomId) "course-bottom" else "course-${course.id}")
                        .clickable {
                            val iso = columnIso
                            if (iso != null) onOpenCourse(course, iso) else onCourseClick(course)
                        },
                    colors = CardDefaults.cardColors(containerColor = courseColor(course.color), contentColor = Color.White),
                ) {
                    Column(Modifier.padding(2.dp)) {
                        Text(course.name, fontWeight = FontWeight.Medium, maxLines = 3, style = MaterialTheme.typography.labelSmall)
                        Text("${course.startTime}-${course.endTime}", maxLines = 1, softWrap = false, style = MaterialTheme.typography.labelSmall)
                        if (!course.location.isNullOrBlank()) {
                            Text(course.location, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
            examBlocks.forEach { block ->
                val exam = exams.first { it.id == block.id }
                val colWidth = maxWidth / block.cols
                Card(
                    modifier = Modifier
                        .offset(x = colWidth * block.col, y = block.top.dp)
                        .width(colWidth)
                        .height(block.height.dp)
                        .padding(1.dp),
                    colors = CardDefaults.cardColors(containerColor = Hot, contentColor = Color.White),
                ) {
                    Column(Modifier.padding(2.dp)) {
                        Text(exam.name, maxLines = 2, style = MaterialTheme.typography.labelSmall)
                        Text(exam.startTime, maxLines = 1, softWrap = false, style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
    }
}

private fun courseColor(hex: String): Color {
    val raw = hex.removePrefix("#")
    val value = raw.toLongOrNull(16) ?: return Color(0xFF2563EB)
    return if (raw.length <= 6) Color(0xFF000000 or value) else Color(value)
}

private fun weekdayOfIso(iso: String): Int = runCatching {
    com.yydsxwh.kemiao.days.data.model.weekdayOf(iso)
}.getOrDefault(0)
