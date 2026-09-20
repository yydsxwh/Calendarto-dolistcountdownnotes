package com.yydsxwh.kemiao.days.ui

import android.app.Activity
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Cloud
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.yydsxwh.kemiao.days.app.DaysUiState
import com.yydsxwh.kemiao.days.app.DaysViewModel
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_COLORS
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_EMOJIS
import com.yydsxwh.kemiao.days.data.model.COURSE_COLORS
import com.yydsxwh.kemiao.days.data.model.CalendarEvent
import com.yydsxwh.kemiao.days.data.model.Countdown
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.EXAM_KIND_LABEL
import com.yydsxwh.kemiao.days.data.model.Exam
import com.yydsxwh.kemiao.days.data.model.NOTE_COLORS
import com.yydsxwh.kemiao.days.data.model.Note
import com.yydsxwh.kemiao.days.data.model.PRIORITY_LABEL
import com.yydsxwh.kemiao.days.data.model.RecurrenceRule
import com.yydsxwh.kemiao.days.data.model.RecurringReminder
import com.yydsxwh.kemiao.days.data.model.SelfScheduleItem
import com.yydsxwh.kemiao.days.data.model.Todo
import com.yydsxwh.kemiao.days.data.model.WEEKDAY_LABEL
import com.yydsxwh.kemiao.days.data.model.daysInMonth
import com.yydsxwh.kemiao.days.data.model.daysUntil
import com.yydsxwh.kemiao.days.data.model.eventMatchesDate
import com.yydsxwh.kemiao.days.data.model.formatLong
import com.yydsxwh.kemiao.days.data.model.formatRecurrence
import com.yydsxwh.kemiao.days.data.model.formatShort
import com.yydsxwh.kemiao.days.data.model.greeting
import com.yydsxwh.kemiao.days.data.model.nextOccurrence
import com.yydsxwh.kemiao.days.data.model.nowMillis
import com.yydsxwh.kemiao.days.data.model.occursOn
import com.yydsxwh.kemiao.days.data.model.termLabel
import com.yydsxwh.kemiao.days.data.model.todayIso
import com.yydsxwh.kemiao.days.data.model.toIsoDate
import com.yydsxwh.kemiao.days.data.model.uid
import com.yydsxwh.kemiao.days.data.model.weekdayOf
import com.yydsxwh.kemiao.days.data.sync.SyncState
import java.time.LocalDate

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val TABS = listOf(
    Tab("today", "今日", Icons.Filled.Home),
    Tab("calendar", "日历", Icons.Filled.CalendarMonth),
    Tab("todos", "待办", Icons.Filled.CheckCircle),
    Tab("schedule", "课表", Icons.Filled.School),
    Tab("more", "更多", Icons.Filled.MoreHoriz),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DaysApp(viewModel: DaysViewModel, activity: Activity) {
    val state by viewModel.state.collectAsState()
    val nav = rememberNavController()
    val snack = remember { SnackbarHostState() }
    val route = nav.currentBackStackEntryAsState().value?.destination?.route ?: "today"
    val tabRoutes = TABS.map { it.route }.toSet()
    val title = when (route) {
        "today" -> "颗秒日事"
        "exams" -> "考试时间表"
        "self" -> "自律课表"
        "days" -> "倒数日"
        "notes" -> "便签"
        "search" -> "搜索"
        "admin" -> "管理后台"
        else -> TABS.firstOrNull { it.route == route }?.label ?: "颗秒日事"
    }
    LaunchedEffect(state.notice, state.error) {
        val msg = state.error ?: state.notice
        if (!msg.isNullOrBlank()) {
            snack.showSnackbar(msg)
            viewModel.dismissNotice()
        }
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (route !in tabRoutes) {
                        IconButton(onClick = { nav.popBackStack() }) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "返回")
                        }
                    }
                },
                actions = {
                    Icon(Icons.Outlined.Cloud, contentDescription = syncLabel(state.sync), modifier = Modifier.padding(end = 8.dp))
                    IconButton(onClick = { nav.navigate("search") { launchSingleTop = true } }) {
                        Icon(Icons.Filled.Search, contentDescription = "搜索")
                    }
                },
            )
        },
        bottomBar = {
            if (route in tabRoutes) {
                NavigationBar {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = {
                                nav.navigate(tab.route) {
                                    popUpTo("today") { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = tab.label) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
        snackbarHost = { SnackbarHost(snack) },
    ) { padding ->
        if (!state.ready) {
            Box(Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@Scaffold
        }
        PullToRefreshBox(isRefreshing = state.sync == SyncState.Syncing, onRefresh = { viewModel.syncNow() }, modifier = Modifier.padding(padding)) {
            NavHost(navController = nav, startDestination = "today") {
                composable("today") { TodayScreen(state, viewModel, activity, nav::navigate) }
                composable("calendar") { CalendarScreen(state, viewModel) }
                composable("todos") { TodosScreen(state, viewModel) }
                composable("schedule") { ScheduleScreen(state, viewModel, activity) }
                composable("exams") { ExamsScreen(state, viewModel, activity) }
                composable("self") { SelfScreen(state, viewModel) }
                composable("days") { CountdownScreen(state, viewModel) }
                composable("notes") { NotesScreen(state, viewModel) }
                composable("more") { MoreScreen(state, viewModel, activity, nav::navigate) }
                composable("search") { SearchScreen(state, viewModel) }
                composable("admin") { AdminScreen(state, viewModel) }
            }
        }
    }
}

private fun syncLabel(state: SyncState) = when (state) {
    SyncState.Synced -> "已同步"
    SyncState.Syncing -> "正在同步"
    SyncState.Offline -> "离线，改动留在本机"
    SyncState.Error -> "同步出错"
    SyncState.SignedOut -> "未登录"
    SyncState.LocalOnly -> "本机模式"
    SyncState.Starting -> "正在检查登录"
}

@Composable
private fun TodayScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, go: (String) -> Unit) {
    val today = todayIso()
    val weekday = weekdayOf(today)
    val courses = state.data.courses.filter { it.weekday == weekday }
    val exams = state.data.exams.filter { it.date == today }
    val todos = state.data.todos.filter { !it.done }
    val downs = state.data.countdowns.sortedBy { daysUntil(nextOccurrence(it.date, it.repeatYearly)) }
    val pins = state.data.notes.filter { it.pinned }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("${greeting()}，${state.user?.name ?: "同学"}", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(formatLong(), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(syncLabel(state.sync), style = MaterialTheme.typography.bodySmall)
        }
        item { SectionCard("今天的课", courses.isEmpty(), "今天没有课") { courses.forEach { Text("${it.startTime}-${it.endTime}  ${it.name}  ${it.location.orEmpty()}") } } }
        item { SectionCard("考试", exams.isEmpty(), "今天没有考试") { exams.forEach { Text("${it.startTime}  ${it.name}") } } }
        item { SectionCard("待办", todos.isEmpty(), "没有未完成待办") { todos.take(8).forEach { Text(it.title) } } }
        item { SectionCard("倒数日", downs.isEmpty(), "还没有倒数日") { downs.take(3).forEach { Text("${it.emoji} ${it.title}  ${daysUntil(nextOccurrence(it.date, it.repeatYearly))} 天") } } }
        item { SectionCard("钉住便签", pins.isEmpty(), "没有钉住的便签") { pins.forEach { Text(it.title.ifBlank { it.body }) } } }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { go("todos") }) { Text("去待办") }
                Button(onClick = { go("schedule") }) { Text("去课表") }
                if (state.user == null) Button(onClick = { vm.login(activity) }) { Text("登录") }
            }
        }
    }
}

@Composable
private fun SectionCard(title: String, empty: Boolean, emptyText: String, content: @Composable () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            if (empty) Text(emptyText, color = MaterialTheme.colorScheme.onSurfaceVariant) else content()
        }
    }
}

@Composable
private fun CalendarScreen(state: DaysUiState, vm: DaysViewModel) {
    var cursor by remember { mutableStateOf(LocalDate.now().withDayOfMonth(1)) }
    var selected by remember { mutableStateOf(todayIso()) }
    var show by remember { mutableStateOf(false) }
    val days = daysInMonth(cursor.year, cursor.monthValue)
    val firstWeekday = ((cursor.dayOfWeek.value) % 7)
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { cursor = cursor.minusMonths(1) }) { Text("上月") }
            Text("${cursor.year} 年 ${cursor.monthValue} 月", fontWeight = FontWeight.Bold)
            TextButton(onClick = { cursor = cursor.plusMonths(1) }) { Text("下月") }
        }
        Row { listOf("一", "二", "三", "四", "五", "六", "日").forEach { Text(it, Modifier.weight(1f), style = MaterialTheme.typography.labelMedium) } }
        val cells = List(firstWeekday) { null } + (1..days).map { it } + List((7 - (firstWeekday + days) % 7) % 7) { null }
        cells.chunked(7).forEach { week ->
            Row {
                week.forEach { day ->
                    val iso = day?.let { toIsoDate(cursor.withDayOfMonth(it)) }
                    val marked = iso != null && hasItems(state, iso)
                    Box(
                        Modifier.weight(1f).height(44.dp).clip(CircleShape).clickable(enabled = iso != null) { if (iso != null) selected = iso }.background(if (iso == selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f) else Color.Transparent),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(day?.toString() ?: "")
                            if (marked) Box(Modifier.size(5.dp).clip(CircleShape).background(MaterialTheme.colorScheme.tertiary))
                        }
                    }
                }
            }
        }
        val items = itemsOn(state, selected)
        Text("${formatShort(selected)} · ${items.size} 条", fontWeight = FontWeight.SemiBold)
        if (items.isEmpty()) Text("这一天还是空的", color = MaterialTheme.colorScheme.onSurfaceVariant)
        items.forEach { Text(it) }
        Button(onClick = { show = true }) { Text("添加日程") }
    }
    if (show) {
        EventEditor(initial = CalendarEvent(uid(), "", selected, null, null, true, null, null, COURSE_COLORS.first(), "medium", 15, "none", nowMillis()), onDismiss = { show = false }) { vm.addEvent(it); show = false }
    }
}

private fun hasItems(state: DaysUiState, iso: String) = itemsOn(state, iso).isNotEmpty()

private fun itemsOn(state: DaysUiState, iso: String): List<String> {
    val d = state.data
    return d.todos.filter { it.dueDate == iso }.map { "待办 ${it.title}" } +
        d.exams.filter { it.date == iso }.map { "考试 ${it.name}" } +
        d.notes.filter { it.date == iso }.map { "便签 ${it.title.ifBlank { it.body }}" } +
        d.countdowns.filter { nextOccurrence(it.date, it.repeatYearly) == iso || it.date == iso }.map { "倒数 ${it.title}" } +
        d.calendarEvents.filter { eventMatchesDate(it, iso) }.map { "日程 ${it.title}" } +
        d.recurringReminders.filter { occursOn(it, iso) }.map { "周期 ${it.title}" }
}

@Composable
private fun TodosScreen(state: DaysUiState, vm: DaysViewModel) {
    var filter by remember { mutableStateOf("all") }
    var show by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Todo?>(null) }
    val items = state.data.todos.filter {
        when (filter) {
            "open" -> !it.done
            "done" -> it.done
            else -> true
        }
    }
    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("all" to "全部", "open" to "未完成", "done" to "已完成").forEach { (id, label) ->
                    FilterChip(selected = filter == id, onClick = { filter = id }, label = { Text(label) })
                }
            }
            if (items.isEmpty()) EmptyState("还没有待办", "点右下角加上今天要做的事")
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 12.dp)) {
                items(items, key = { it.id }) { todo ->
                    Card(Modifier.fillMaxWidth().clickable { editing = todo }) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(todo.done, onCheckedChange = { vm.toggleTodo(todo.id) })
                            Column(Modifier.weight(1f)) {
                                Text(todo.title, fontWeight = FontWeight.Medium)
                                Text(listOfNotNull(todo.dueDate, todo.dueTime, PRIORITY_LABEL[todo.priority]).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                            }
                            TextButton(onClick = { vm.removeTodo(todo.id) }) { Text("删除") }
                        }
                    }
                }
            }
        }
        FloatingActionButton(onClick = { show = true }, modifier = Modifier.align(Alignment.BottomEnd).padding(20.dp)) { Icon(Icons.Filled.Add, "添加待办") }
    }
    if (show) TodoEditor(null, { show = false }) { title, date, time, pri, remind -> vm.addTodo(title, date, time, pri, remind); show = false }
    editing?.let { current ->
        TodoEditor(current, { editing = null }) { title, date, time, pri, remind ->
            vm.updateTodo(current.copy(title = title, dueDate = date, dueTime = time, priority = pri, remindMinutes = remind)); editing = null
        }
    }
}

@Composable
private fun TodoEditor(initial: Todo?, onDismiss: () -> Unit, onSave: (String, String?, String?, String, Int) -> Unit) {
    var title by remember { mutableStateOf(initial?.title.orEmpty()) }
    var date by remember { mutableStateOf(initial?.dueDate.orEmpty()) }
    var time by remember { mutableStateOf(initial?.dueTime.orEmpty()) }
    var pri by remember { mutableStateOf(initial?.priority ?: "medium") }
    var remind by remember { mutableStateOf((initial?.remindMinutes ?: 15).toString()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新待办" else "编辑待办") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("标题") }, isError = title.isBlank(), supportingText = { if (title.isBlank()) Text("请填写标题") })
                OutlinedTextField(date, { date = it }, label = { Text("到期日 YYYY-MM-DD") })
                OutlinedTextField(time, { time = it }, label = { Text("时间 HH:MM") })
                OutlinedTextField(pri, { pri = it }, label = { Text("优先级 high/medium/low") })
                OutlinedTextField(remind, { remind = it }, label = { Text("提前提醒（分钟）") })
            }
        },
        confirmButton = { Button(onClick = { if (title.isNotBlank()) onSave(title, date.ifBlank { null }, time.ifBlank { null }, pri, remind.toIntOrNull() ?: 15) }, enabled = title.isNotBlank()) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ScheduleScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity) {
    var show by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<Course?>(null) }
    var confirmClear by remember { mutableStateOf(false) }
    val weekday = weekdayOf(todayIso())
    val term = state.data.terms.firstOrNull { it.id == state.data.currentTermId }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importOcr(activity, uri, "courses")
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(term?.let { termLabel(it) } ?: "当前学期", fontWeight = FontWeight.Bold)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            state.data.terms.forEach { t ->
                FilterChip(selected = t.id == state.data.currentTermId, onClick = { vm.setCurrentTerm(t.id) }, label = { Text(termLabel(t)) })
            }
            FilterChip(selected = false, onClick = { vm.addTerm() }, label = { Text("新学期") })
        }
        WeekGrid(state.data.courses.filter { it.termId == null || it.termId == state.data.currentTermId })
        if (state.data.courses.isEmpty()) EmptyState("还没有课程", "先手动加一节，或拍教务处课表导入")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f, false)) {
            items(state.data.courses, key = { it.id }) { course ->
                Card(Modifier.fillMaxWidth().clickable { editing = course }) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${course.name} · 周${WEEKDAY_LABEL.getOrElse(course.weekday) { "?" }}", fontWeight = FontWeight.Medium)
                        Text("${course.startTime}-${course.endTime}  ${course.location.orEmpty()}  ${course.teacher.orEmpty()}")
                        Row {
                            TextButton(onClick = { vm.removeCourse(course.id) }) { Text("删除") }
                        }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { show = true }) { Text("加课程") }
            Button(onClick = { picker.launch(arrayOf("image/*", "application/pdf", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/*")) }, enabled = !state.importing) {
                Text(if (state.importing) "识别中…" else "导入课表")
            }
            TextButton(onClick = { confirmClear = true }) { Text("清空课表") }
        }
        Text("今天星期${WEEKDAY_LABEL.getOrElse(weekday) { "?" }}。导入走主站视觉接口，和网页版同一套规则。", style = MaterialTheme.typography.bodySmall)
    }
    if (show) CourseEditor(null, { show = false }) { vm.addCourse(it); show = false }
    editing?.let { current -> CourseEditor(current, { editing = null }) { vm.updateCourse(it); editing = null } }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("清空当前课表？") },
            text = { Text("课程会按同步规则打上删除标记，不会静默覆盖云端其他数据。") },
            confirmButton = { Button(onClick = { vm.clearCourses(); confirmClear = false }) { Text("清空") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun WeekGrid(courses: List<Course>) {
    if (courses.isEmpty()) return
    val days = (1..7)
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).height(180.dp)) {
        days.forEach { day ->
            Column(Modifier.width(120.dp).fillMaxHeight().padding(end = 8.dp)) {
                Text("周${WEEKDAY_LABEL.getOrElse(day) { "?" }}", fontWeight = FontWeight.SemiBold)
                courses.filter { it.weekday == day }.sortedBy { it.startTime }.forEach { course ->
                    Card(Modifier.fillMaxWidth().padding(top = 6.dp)) {
                        Column(Modifier.padding(8.dp)) {
                            Text(course.name, fontWeight = FontWeight.Medium, style = MaterialTheme.typography.bodySmall)
                            Text("${course.startTime}-${course.endTime}", style = MaterialTheme.typography.labelSmall)
                            if (!course.location.isNullOrBlank()) Text(course.location, style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CourseEditor(initial: Course?, onDismiss: () -> Unit, onSave: (Course) -> Unit) {
    var name by remember { mutableStateOf(initial?.name.orEmpty()) }
    var weekday by remember { mutableStateOf((initial?.weekday ?: 1).toString()) }
    var start by remember { mutableStateOf(initial?.startTime ?: "08:00") }
    var end by remember { mutableStateOf(initial?.endTime ?: "09:40") }
    var room by remember { mutableStateOf(initial?.location.orEmpty()) }
    var teacher by remember { mutableStateOf(initial?.teacher.orEmpty()) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "新课程" else "编辑课程") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("课程名") })
                OutlinedTextField(weekday, { weekday = it }, label = { Text("星期 1-7") })
                OutlinedTextField(start, { start = it }, label = { Text("开始") })
                OutlinedTextField(end, { end = it }, label = { Text("结束") })
                OutlinedTextField(room, { room = it }, label = { Text("教室") })
                OutlinedTextField(teacher, { teacher = it }, label = { Text("老师") })
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(
                    (initial ?: Course(uid(), "", 1, start, end, null, null, null, COURSE_COLORS.first(), 15, nowMillis()))
                        .copy(name = name.trim(), weekday = weekday.toIntOrNull()?.coerceIn(1, 7) ?: 1, startTime = start, endTime = end, location = room.ifBlank { null }, teacher = teacher.ifBlank { null }),
                )
            }, enabled = name.isNotBlank()) { Text("保存") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun ExamsScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity) {
    var show by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importOcr(activity, uri, "exams")
    }
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.exams.isEmpty()) EmptyState("考试时间表是空的", "期中、期末、补考都可以记在这里")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.weight(1f, false)) {
            items(state.data.exams, key = { it.id }) { exam ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${exam.name} · ${EXAM_KIND_LABEL[exam.kind] ?: exam.kind}", fontWeight = FontWeight.Medium)
                        Text("${exam.date} ${exam.startTime} ${exam.location.orEmpty()} ${exam.seat.orEmpty()}")
                        TextButton(onClick = { vm.removeExam(exam.id) }) { Text("删除") }
                    }
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { show = true }) { Text("添加考试") }
            Button(onClick = { picker.launch(arrayOf("image/*", "application/pdf", "text/*")) }, enabled = !state.importing) {
                Text(if (state.importing) "识别中…" else "导入考试表")
            }
        }
    }
    if (show) {
        var name by remember { mutableStateOf("") }
        var date by remember { mutableStateOf("") }
        var time by remember { mutableStateOf("09:00") }
        var kind by remember { mutableStateOf("final") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新考试") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("科目") })
                    OutlinedTextField(date, { date = it }, label = { Text("日期") })
                    OutlinedTextField(time, { time = it }, label = { Text("开始") })
                    OutlinedTextField(kind, { kind = it }, label = { Text("类型 midterm/final/makeup/other") })
                }
            },
            confirmButton = {
                Button(onClick = {
                    vm.addExam(Exam(uid(), name.trim(), kind, date, time, null, null, null, 1440, nowMillis()))
                    show = false
                }, enabled = name.isNotBlank() && date.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SelfScreen(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.selfSchedules.isEmpty()) EmptyState("还没有自律安排", "把晚自习、跑步、背单词排进一周")
        state.data.selfSchedules.forEach { item ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("${item.title} · 周${WEEKDAY_LABEL.getOrElse(item.weekday) { "?" }}", fontWeight = FontWeight.Medium)
                    Text("${item.startTime}-${item.endTime}  ${PRIORITY_LABEL[item.priority]}")
                    TextButton(onClick = { vm.removeSelf(item.id) }) { Text("删除") }
                }
            }
        }
        Button(onClick = { show = true }) { Text("添加自律") }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var weekday by remember { mutableStateOf("1") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新自律") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(weekday, { weekday = it }, label = { Text("星期 1-7") }) } },
            confirmButton = {
                Button(onClick = {
                    vm.addSelf(SelfScheduleItem(uid(), title.trim(), weekday.toIntOrNull() ?: 1, "20:00", "21:30", COURSE_COLORS[1], null, 10, "medium", nowMillis()))
                    show = false
                }, enabled = title.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun CountdownScreen(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.countdowns.isEmpty()) EmptyState("还没有倒数日", "生日、节日、开学都可以记")
        state.data.countdowns.sortedBy { daysUntil(nextOccurrence(it.date, it.repeatYearly)) }.forEach { item ->
            val left = daysUntil(nextOccurrence(item.date, item.repeatYearly))
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("${item.emoji} ${item.title}", fontWeight = FontWeight.Bold)
                    Text(if (left >= 0) "还有 $left 天" else "已经过去 ${-left} 天", style = MaterialTheme.typography.headlineMedium)
                    Text(item.date + if (item.repeatYearly) " · 每年" else "")
                    TextButton(onClick = { vm.removeCountdown(item.id) }) { Text("删除") }
                }
            }
        }
        Button(onClick = { show = true }) { Text("添加倒数日") }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var date by remember { mutableStateOf("") }
        var yearly by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新倒数日") },
            text = {
                Column {
                    OutlinedTextField(title, { title = it }, label = { Text("名称") })
                    OutlinedTextField(date, { date = it }, label = { Text("日期") })
                    Row(verticalAlignment = Alignment.CenterVertically) { Text("每年重复"); Switch(yearly, { yearly = it }) }
                }
            },
            confirmButton = {
                Button(onClick = {
                    vm.addCountdown(title, date, COUNTDOWN_COLORS.first(), COUNTDOWN_EMOJIS.first(), yearly)
                    show = false
                }, enabled = title.isNotBlank() && date.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun NotesScreen(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.data.notes.isEmpty()) EmptyState("便签还是空的", "随手记一句，也可以钉到今日")
        state.data.notes.forEach { note ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(note.title.ifBlank { "无标题" }, fontWeight = FontWeight.Medium)
                    Text(note.body)
                    Row {
                        TextButton(onClick = { vm.updateNote(note.copy(pinned = !note.pinned)) }) { Text(if (note.pinned) "取消钉住" else "钉住") }
                        TextButton(onClick = { vm.removeNote(note.id) }) { Text("删除") }
                    }
                }
            }
        }
        Button(onClick = { show = true }) { Text("新便签") }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var body by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("新便签") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(body, { body = it }, label = { Text("内容") }) } },
            confirmButton = { Button(onClick = { vm.addNote(title, body, NOTE_COLORS.first(), null); show = false }, enabled = title.isNotBlank() || body.isNotBlank()) { Text("保存") } },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun MoreScreen(state: DaysUiState, vm: DaysViewModel, activity: Activity, go: (String) -> Unit) {
    var confirmClear by remember { mutableStateOf(false) }
    val importPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) vm.importBackup(activity, uri)
    }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("更多", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold) }
        item { MoreLink("考试时间表") { go("exams") } }
        item { MoreLink("自律课表") { go("self") } }
        item { MoreLink("倒数日 · 纪念日") { go("days") } }
        item { MoreLink("便签") { go("notes") } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("账号", fontWeight = FontWeight.SemiBold)
                    if (state.user == null) {
                        Text("登录后和网页看到同一份数据")
                        Button(onClick = { vm.login(activity) }) { Text("用账号中心登录") }
                    } else {
                        Text(state.user.name ?: "已登录")
                        Text(state.user.accountSub, style = MaterialTheme.typography.bodySmall)
                        Text(syncLabel(state.sync))
                        Button(onClick = { vm.syncNow() }) { Text("立即同步") }
                        TextButton(onClick = { vm.logout() }) { Text("退出登录") }
                    }
                }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("提醒", fontWeight = FontWeight.SemiBold)
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("开启提醒", Modifier.weight(1f))
                        Switch(state.data.reminderSettings.enabled, { vm.updateReminders(state.data.reminderSettings.copy(enabled = it)) })
                    }
                    OutlinedTextField(
                        state.data.reminderSettings.classDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(classDefaultMinutes = it)) } },
                        label = { Text("上课提前（分钟）") },
                    )
                    OutlinedTextField(
                        state.data.reminderSettings.examDefaultMinutes.toString(),
                        { value -> value.toIntOrNull()?.let { vm.updateReminders(state.data.reminderSettings.copy(examDefaultMinutes = it)) } },
                        label = { Text("考试提前（分钟）") },
                    )
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("考试再提前提 1 小时", Modifier.weight(1f))
                        Switch(state.data.reminderSettings.examAlsoHourBefore, { vm.updateReminders(state.data.reminderSettings.copy(examAlsoHourBefore = it)) })
                    }
                }
            }
        }
        item {
            RecurringBlock(state, vm)
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("备份", fontWeight = FontWeight.SemiBold)
                    TextButton(onClick = { activity.startActivity(Intent.createChooser(vm.shareBackup(), "导出日事备份")) }) { Text("导出 JSON") }
                    TextButton(onClick = { importPicker.launch(arrayOf("application/json", "text/plain")) }) { Text("导入备份") }
                    TextButton(onClick = { confirmClear = true }) { Text("清空本机数据") }
                }
            }
        }
        if (state.admin) item { MoreLink("管理后台") { go("admin") } }
    }
    if (confirmClear) {
        AlertDialog(
            onDismissRequest = { confirmClear = false },
            title = { Text("清空本机全部日事数据？") },
            text = { Text("此操作不可恢复。云端数据不会自动删。") },
            confirmButton = { Button(onClick = { vm.clearAll(); confirmClear = false }) { Text("清空") } },
            dismissButton = { TextButton(onClick = { confirmClear = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun RecurringBlock(state: DaysUiState, vm: DaysViewModel) {
    var show by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("周期性提醒", fontWeight = FontWeight.SemiBold)
            if (state.data.recurringReminders.isEmpty()) Text("还没有周期提醒", color = MaterialTheme.colorScheme.onSurfaceVariant)
            state.data.recurringReminders.forEach { item ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(item.title)
                        Text("${formatRecurrence(item.rule)} · ${if (item.enabled) "启用" else "暂停"}", style = MaterialTheme.typography.bodySmall)
                    }
                    Switch(item.enabled, { vm.updateRecurring(item.copy(enabled = it)) })
                    TextButton(onClick = { vm.removeRecurring(item.id) }) { Text("删除") }
                }
            }
            Button(onClick = { show = true }) { Text("添加周期提醒") }
        }
    }
    if (show) {
        var title by remember { mutableStateOf("") }
        var start by remember { mutableStateOf(todayIso()) }
        AlertDialog(
            onDismissRequest = { show = false },
            title = { Text("周期提醒") },
            text = { Column { OutlinedTextField(title, { title = it }, label = { Text("标题") }); OutlinedTextField(start, { start = it }, label = { Text("开始日期") }) } },
            confirmButton = {
                Button(onClick = {
                    vm.addRecurring(RecurringReminder(uid(), title.trim(), null, start, "09:00", RecurrenceRule("interval", 1, "year"), null, true, true, nowMillis(), nowMillis()))
                    show = false
                }, enabled = title.isNotBlank()) { Text("保存") }
            },
            dismissButton = { TextButton(onClick = { show = false }) { Text("取消") } },
        )
    }
}

@Composable
private fun SearchScreen(state: DaysUiState, vm: DaysViewModel) {
    val q = state.query.trim().lowercase()
    val d = state.data
    val todos = d.todos.filter { it.title.lowercase().contains(q) }
    val notes = d.notes.filter { it.title.lowercase().contains(q) || it.body.lowercase().contains(q) }
    val courses = d.courses.filter { it.name.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) || it.teacher.orEmpty().lowercase().contains(q) }
    val exams = d.exams.filter { it.name.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) }
    val downs = d.countdowns.filter { it.title.lowercase().contains(q) }
    val selves = d.selfSchedules.filter { it.title.lowercase().contains(q) || it.note.orEmpty().lowercase().contains(q) }
    val events = d.calendarEvents.filter { it.title.lowercase().contains(q) || it.location.orEmpty().lowercase().contains(q) || it.note.orEmpty().lowercase().contains(q) }
    val recurring = d.recurringReminders.filter { it.title.lowercase().contains(q) || it.body.orEmpty().lowercase().contains(q) }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(state.query, { vm.setQuery(it) }, label = { Text("搜索日程、待办、课表、考试、便签") }, modifier = Modifier.fillMaxWidth())
        if (q.isBlank()) Text("输入关键字会在待办、课表、考试、便签、倒数日和周期提醒里找")
        else {
            Text("待办 ${todos.size}"); todos.forEach { Text(it.title) }
            Text("课程 ${courses.size}"); courses.forEach { Text(it.name) }
            Text("考试 ${exams.size}"); exams.forEach { Text(it.name) }
            Text("自律 ${selves.size}"); selves.forEach { Text(it.title) }
            Text("日程 ${events.size}"); events.forEach { Text(it.title) }
            Text("倒数日 ${downs.size}"); downs.forEach { Text("${it.emoji} ${it.title}") }
            Text("便签 ${notes.size}"); notes.forEach { Text(it.title.ifBlank { it.body }) }
            Text("周期提醒 ${recurring.size}"); recurring.forEach { Text(it.title) }
        }
    }
}

@Composable
private fun AdminScreen(state: DaysUiState, vm: DaysViewModel) {
    LaunchedEffect(state.admin) { vm.loadAdmin() }
    Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("日事管理后台", fontWeight = FontWeight.Bold)
        Text("密钥只写到服务器，这里只显示配置状态。非站长看不到这个入口。")
        Text(state.adminPayload ?: "正在读取…", style = MaterialTheme.typography.bodySmall)
        Button(onClick = { vm.testAccount() }) { Text("测试 Account") }
        Button(onClick = { vm.testPlatform() }) { Text("测试 Platform") }
        Button(onClick = { vm.loadAdmin() }) { Text("刷新配置") }
    }
}

@Composable
private fun EventEditor(initial: CalendarEvent, onDismiss: () -> Unit, onSave: (CalendarEvent) -> Unit) {
    var title by remember { mutableStateOf(initial.title) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("新日程") },
        text = { OutlinedTextField(title, { title = it }, label = { Text("标题") }) },
        confirmButton = { Button(onClick = { onSave(initial.copy(title = title.trim())) }, enabled = title.isNotBlank()) { Text("保存") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("取消") } },
    )
}

@Composable
private fun MoreLink(label: String, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick).semantics { contentDescription = label }) {
        Text(label, Modifier.padding(16.dp), fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun EmptyState(title: String, body: String) {
    Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(title, fontWeight = FontWeight.SemiBold)
        Text(body, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
