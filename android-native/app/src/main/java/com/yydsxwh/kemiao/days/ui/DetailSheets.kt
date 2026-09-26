package com.yydsxwh.kemiao.days.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.yydsxwh.kemiao.days.app.DaysUiState
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.local.HolidayCache
import com.yydsxwh.kemiao.days.data.local.LunarCache
import com.yydsxwh.kemiao.days.data.model.ClassPeriod
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.HolidayOccurrence
import com.yydsxwh.kemiao.days.data.model.WEEKDAY_LABEL
import com.yydsxwh.kemiao.days.data.model.courseInTeachingWeek
import com.yydsxwh.kemiao.days.data.model.courseRemarkId
import com.yydsxwh.kemiao.days.data.model.dayRemarkId
import com.yydsxwh.kemiao.days.data.model.eventMatchesDate
import com.yydsxwh.kemiao.days.data.model.formatLong
import com.yydsxwh.kemiao.days.data.model.holidayMark
import com.yydsxwh.kemiao.days.data.model.holidaysOn
import com.yydsxwh.kemiao.days.data.model.occurrenceRemarkId
import com.yydsxwh.kemiao.days.data.model.parseIsoDate
import com.yydsxwh.kemiao.days.data.model.startOfWeek
import com.yydsxwh.kemiao.days.data.model.teachingWeekNumber
import com.yydsxwh.kemiao.days.data.model.termLabel
import com.yydsxwh.kemiao.days.data.model.weekdayOf
import androidx.compose.ui.platform.LocalContext

internal data class DayRow(val tag: String, val label: String, val onClick: () -> Unit)

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun DateDetailBody(
    title: String,
    lunar: String,
    holidayLines: List<String>,
    rows: List<DayRow>,
    savedNote: String?,
    editing: Boolean,
    draft: String,
    message: String,
    onStartAdd: () -> Unit,
    onStartEdit: () -> Unit,
    onDraft: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    onAskDelete: () -> Unit,
    onClose: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .testTag("date-detail"),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
        Text(if (lunar.isBlank()) "农历未收录" else "农历 $lunar")
        Text("节日", fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        if (holidayLines.isEmpty()) Text("这天没有收录的节日", color = MaterialTheme.colorScheme.onSurfaceVariant)
        holidayLines.forEach { Text(it) }
        if (rows.isEmpty()) Text("这一天没有日程、课程、待办或提醒", color = MaterialTheme.colorScheme.onSurfaceVariant)
        rows.forEach { row ->
            TextButton(onClick = row.onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag(row.tag)) {
                Text(row.label, modifier = Modifier.fillMaxWidth())
            }
        }
        Text("备注", fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        if (!editing && savedNote == null) {
            Button(onClick = onStartAdd, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("date-note-add")) { Text("添加备注") }
        }
        if (!editing && savedNote != null) {
            Text(savedNote, modifier = Modifier.testTag("date-note-body"))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onStartEdit, modifier = Modifier.heightIn(min = 48.dp).testTag("date-note-edit")) { Text("编辑") }
                TextButton(onClick = onAskDelete, modifier = Modifier.heightIn(min = 48.dp).testTag("date-note-delete")) { Text("删除") }
            }
        }
        if (editing) {
            OutlinedTextField(
                draft,
                onDraft,
                modifier = Modifier.fillMaxWidth().testTag("date-note-input"),
                label = { Text("日期备注") },
                minLines = 4,
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onSave, modifier = Modifier.heightIn(min = 48.dp).testTag("date-note-save")) { Text("保存") }
                TextButton(onClick = onCancel, modifier = Modifier.heightIn(min = 48.dp).testTag("date-note-cancel")) { Text("取消") }
            }
        }
        if (message.isNotBlank()) Text(message, modifier = Modifier.testTag("date-note-status"), color = MaterialTheme.colorScheme.primary)
        TextButton(onClick = onClose, modifier = Modifier.heightIn(min = 48.dp).testTag("date-detail-close")) { Text("关闭") }
    }
}

@Composable
internal fun DateDetailDialog(
    state: DaysUiState,
    vm: DaysViewModel,
    iso: String,
    onOpenEvent: (String) -> Unit,
    onOpenTodo: (String) -> Unit,
    onOpenCourse: (Course, String) -> Unit,
    onOpenExam: (String) -> Unit,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val data = state.data
    val holidays = holidaysOn(HolidayCache.all(context), iso, data.holidaySettings)
    val lunar = LunarCache.label(context, iso)
    val saved = data.remarks.find { it.id == dayRemarkId(iso) }?.body
    var editing by remember(iso) { mutableStateOf(false) }
    var draft by remember(iso) { mutableStateOf(saved.orEmpty()) }
    var message by remember(iso) { mutableStateOf("") }
    var confirmDelete by remember(iso) { mutableStateOf(false) }
    var confirmLeave by remember(iso) { mutableStateOf(false) }
    val dirty = editing && draft != (saved ?: "")
    val requestClose = {
        if (dirty) confirmLeave = true else onClose()
    }
    BackHandler { requestClose() }
    Dialog(onDismissRequest = requestClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            DateDetailBody(
                title = formatLong(parseIsoDate(iso)),
                lunar = lunar,
                holidayLines = holidays.map { holidayLine(it) },
                rows = dayRows(state, iso, onOpenEvent, onOpenTodo, onOpenCourse, onOpenExam),
                savedNote = saved,
                editing = editing,
                draft = draft,
                message = message,
                onStartAdd = { draft = ""; editing = true; message = "" },
                onStartEdit = { draft = saved.orEmpty(); editing = true; message = "" },
                onDraft = { draft = it },
                onSave = {
                    if (draft.isBlank()) {
                        message = "请先填写备注"
                    } else {
                        vm.saveRemark("day", draft, iso, null, null)
                        editing = false
                        message = "备注已保存"
                    }
                },
                onCancel = {
                    if (draft != (saved ?: "")) confirmLeave = true else editing = false
                },
                onAskDelete = { confirmDelete = true },
                onClose = requestClose,
            )
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("删除这一天的备注？") },
            text = { Text("只删除备注。日程、课程、考试、待办和节日都会保留。") },
            confirmButton = {
                Button(onClick = {
                    vm.removeRemark(dayRemarkId(iso))
                    confirmDelete = false
                    editing = false
                    draft = ""
                    message = "备注已删除"
                }, modifier = Modifier.testTag("date-note-delete-confirm")) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
        )
    }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("放弃还没保存的备注？") },
            text = { Text("离开后，这次输入不会写入。") },
            confirmButton = { Button(onClick = { confirmLeave = false; editing = false; onClose() }) { Text("放弃") } },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("继续编辑") } },
        )
    }
}

private fun holidayLine(item: HolidayOccurrence): String {
    val region = if (item.region == "CN") "中国" else "美国"
    val mark = holidayMark(item)
    val extra = listOfNotNull(
        if (item.isDayOff) "放假" else null,
        if (item.isAdjustedWorkday) "补班" else null,
        item.description,
    ).joinToString(" · ")
    return "$mark ${item.name} · $region${if (extra.isBlank()) "" else " · $extra"}"
}

private fun dayRows(
    state: DaysUiState,
    iso: String,
    onOpenEvent: (String) -> Unit,
    onOpenTodo: (String) -> Unit,
    onOpenCourse: (Course, String) -> Unit,
    onOpenExam: (String) -> Unit,
): List<DayRow> {
    val data = state.data
    val weekday = weekdayOf(iso)
    val term = data.terms.firstOrNull { it.id == data.currentTermId }
    val week = teachingWeekNumber(startOfWeek(parseIsoDate(iso), data.timetableView.weekStartsOn), term?.startDate, data.timetableView.weekStartsOn)
    val events = data.calendarEvents.filter { eventMatchesDate(it, iso) }
    val todos = data.todos.filter { it.dueDate == iso }
    val exams = data.exams.filter { it.date == iso }
    val courses = data.courses.filter { it.weekday == weekday && (it.termId == null || it.termId == data.currentTermId) && courseInTeachingWeek(it, week) }
    val days = data.countdowns.filter { it.date == iso || it.date.takeLast(5) == iso.takeLast(5) }
    val reminders = data.reminderRules.filter { rule ->
        when (rule.targetType) {
            "event" -> events.any { it.id == rule.targetId }
            "todo" -> todos.any { it.id == rule.targetId }
            "exam" -> exams.any { it.id == rule.targetId }
            "course" -> courses.any { it.id == rule.targetId }
            else -> false
        }
    }
    return events.map { DayRow("day-event-${it.id}", "日程 ${it.startTime ?: "全天"} ${it.title}") { onOpenEvent(it.id) } } +
        todos.map { DayRow("day-todo-${it.id}", "待办 ${it.dueTime.orEmpty()} ${it.title}") { onOpenTodo(it.id) } } +
        reminders.map { DayRow("day-reminder-${it.id}", if (it.delivery == "alarm") "闹钟 ${it.triggerAt ?: "提前 ${it.offsetMinutes ?: 0} 分钟"}" else "提醒 ${it.triggerAt ?: "提前 ${it.offsetMinutes ?: 0} 分钟"}") {} } +
        courses.map { DayRow("day-course-${it.id}", "课程 ${it.startTime}-${it.endTime} ${it.name}") { onOpenCourse(it, iso) } } +
        exams.map { DayRow("day-exam-${it.id}", "考试 ${it.startTime} ${it.name}") { onOpenExam(it.id) } } +
        days.map { DayRow("day-countdown-${it.id}", "日子 ${it.emoji} ${it.title}") {} }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun CourseDetailBody(
    name: String,
    teacher: String,
    room: String,
    date: String,
    weekdayLabel: String,
    start: String,
    end: String,
    period: String,
    weeks: String,
    term: String,
    repeat: String,
    reminders: List<String>,
    courseNote: String,
    occurrenceNote: String,
    scope: String,
    draft: String,
    message: String,
    onScope: (String) -> Unit,
    onDraft: (String) -> Unit,
    onSave: () -> Unit,
    onDelete: () -> Unit,
    onEditCourse: () -> Unit,
    onClose: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .imePadding()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
            .testTag("course-detail"),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() }.testTag("course-detail-name"))
        Text("教师 ${teacher.ifBlank { "未填写" }}")
        Text("地点 ${room.ifBlank { "未填写" }}")
        Text("日期 $date")
        Text("星期 $weekdayLabel")
        Text("开始 $start")
        Text("结束 $end")
        Text("节次 $period")
        Text("周次 ${weeks.ifBlank { "未填写" }}")
        Text("学期 $term")
        Text("重复 $repeat")
        Text("课程提醒", fontWeight = FontWeight.SemiBold)
        if (reminders.isEmpty()) Text("没有单独的提醒或闹钟", color = MaterialTheme.colorScheme.onSurfaceVariant)
        reminders.forEach { Text(it) }
        Text("整门课程备注", fontWeight = FontWeight.SemiBold)
        Text(courseNote.ifBlank { "还没有" }, modifier = Modifier.testTag("course-note-body"))
        Text("本次课程备注", fontWeight = FontWeight.SemiBold)
        Text(occurrenceNote.ifBlank { "还没有" }, modifier = Modifier.testTag("occurrence-note-body"))
        Text("正在编辑", fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = scope == "occurrence", onClick = { onScope("occurrence") }, modifier = Modifier.testTag("scope-occurrence"))
            Text("仅本次课程")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = scope == "course", onClick = { onScope("course") }, modifier = Modifier.testTag("scope-course"))
            Text("整门课程")
        }
        OutlinedTextField(draft, onDraft, modifier = Modifier.fillMaxWidth().testTag("course-note-input"), label = { Text(if (scope == "course") "整门课程备注" else "本次课程备注") }, minLines = 4)
        if (message.isNotBlank()) Text(message, modifier = Modifier.testTag("course-note-status"))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = onSave, modifier = Modifier.heightIn(min = 48.dp).testTag("course-note-save")) { Text("保存") }
            TextButton(onClick = onDelete, modifier = Modifier.heightIn(min = 48.dp).testTag("course-note-delete")) { Text("删除当前范围的备注") }
            TextButton(onClick = onEditCourse, modifier = Modifier.heightIn(min = 48.dp).testTag("course-edit")) { Text("编辑课程") }
            TextButton(onClick = onClose, modifier = Modifier.heightIn(min = 48.dp).testTag("course-detail-close")) { Text("关闭") }
        }
    }
}

@Composable
internal fun CourseDetailDialog(
    state: DaysUiState,
    vm: DaysViewModel,
    course: Course,
    iso: String,
    onEditCourse: () -> Unit,
    onClose: () -> Unit,
) {
    val data = state.data
    val courseNote = data.remarks.find { it.id == courseRemarkId(course.id) }?.body ?: course.note.orEmpty()
    val occurrenceNote = data.remarks.find { it.id == occurrenceRemarkId(course.id, iso, course.startTime) }?.body.orEmpty()
    var scope by remember(course.id, iso) { mutableStateOf("occurrence") }
    var draft by remember(course.id, iso, scope, courseNote, occurrenceNote) {
        mutableStateOf(if (scope == "course") courseNote else occurrenceNote)
    }
    var message by remember(course.id, iso) { mutableStateOf("") }
    var confirmDelete by remember { mutableStateOf(false) }
    var confirmLeave by remember { mutableStateOf(false) }
    val saved = if (scope == "course") courseNote else occurrenceNote
    val dirty = draft != saved
    val requestClose = { if (dirty) confirmLeave = true else onClose() }
    val term = data.terms.firstOrNull { it.id == (course.termId ?: data.currentTermId) }
    val reminders = data.reminderRules.filter { it.targetType == "course" && it.targetId == course.id }
    BackHandler { requestClose() }
    Dialog(onDismissRequest = requestClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            CourseDetailBody(
                name = course.name,
                teacher = course.teacher.orEmpty(),
                room = course.location.orEmpty(),
                date = iso,
                weekdayLabel = WEEKDAY_LABEL.getOrElse(course.weekday) { "?" },
                start = course.startTime,
                end = course.endTime,
                period = periodLabel(data.timetableView.classPeriods, course.startTime, course.endTime),
                weeks = course.weeks.orEmpty(),
                term = term?.let { termLabel(it) } ?: "未设置学期",
                repeat = "每周" + if (course.weeks.isNullOrBlank()) "" else " · ${course.weeks}",
                reminders = reminders.map { rule ->
                    val kind = if (rule.delivery == "alarm") "闹钟" else "提醒"
                    val whenText = if (rule.triggerMode == "absolute") rule.triggerAt.orEmpty() else "提前 ${rule.offsetMinutes ?: course.remindMinutes} 分钟"
                    "$kind · $whenText"
                } + listOf("默认提前 ${course.remindMinutes} 分钟"),
                courseNote = courseNote,
                occurrenceNote = occurrenceNote,
                scope = scope,
                draft = draft,
                message = message,
                onScope = { scope = it },
                onDraft = { draft = it },
                onSave = {
                    if (draft.isBlank()) {
                        message = "请先填写备注"
                    } else {
                        vm.saveRemark(scope, draft, iso, course.id, course.startTime)
                        message = if (scope == "course") "整门课程备注已保存" else "本次课程备注已保存"
                    }
                },
                onDelete = { confirmDelete = true },
                onEditCourse = onEditCourse,
                onClose = requestClose,
            )
        }
    }
    if (confirmDelete) {
        val id = if (scope == "course") courseRemarkId(course.id) else occurrenceRemarkId(course.id, iso, course.startTime)
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text(if (scope == "course") "删除整门课程备注？" else "删除本次课程备注？") },
            text = { Text("另一种范围的备注会保留，课程时间也不会变。") },
            confirmButton = {
                Button(onClick = {
                    vm.removeRemark(id)
                    draft = ""
                    message = if (scope == "course") "整门课程备注已删除" else "本次课程备注已删除"
                    confirmDelete = false
                }) { Text("确认删除") }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("取消") } },
        )
    }
    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text("放弃还没保存的备注？") },
            confirmButton = { Button(onClick = { confirmLeave = false; onClose() }) { Text("放弃") } },
            dismissButton = { TextButton(onClick = { confirmLeave = false }) { Text("继续编辑") } },
        )
    }
}

private fun periodLabel(periods: List<ClassPeriod>, start: String, end: String): String {
    val index = periods.indexOfFirst { it.start == start }
    return if (index >= 0) "第${index + 1}节 ${periods[index].start}-${periods[index].end}" else "$start-$end"
}
