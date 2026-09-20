package com.yydsxwh.kemiao.days.app

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.browser.customtabs.CustomTabsIntent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yydsxwh.kemiao.days.BuildConfig
import com.yydsxwh.kemiao.days.data.local.LocalStore
import com.yydsxwh.kemiao.days.data.local.SecureSession
import com.yydsxwh.kemiao.days.data.model.AppData
import com.yydsxwh.kemiao.days.data.model.CalendarEvent
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_COLORS
import com.yydsxwh.kemiao.days.data.model.COUNTDOWN_EMOJIS
import com.yydsxwh.kemiao.days.data.model.Countdown
import com.yydsxwh.kemiao.days.data.model.Course
import com.yydsxwh.kemiao.days.data.model.Exam
import com.yydsxwh.kemiao.days.data.model.NOTE_COLORS
import com.yydsxwh.kemiao.days.data.model.Note
import com.yydsxwh.kemiao.days.data.model.RecurrenceRule
import com.yydsxwh.kemiao.days.data.model.RecurringReminder
import com.yydsxwh.kemiao.days.data.model.ReminderSettings
import com.yydsxwh.kemiao.days.data.model.SelfScheduleItem
import com.yydsxwh.kemiao.days.data.model.SessionUser
import com.yydsxwh.kemiao.days.data.model.Term
import com.yydsxwh.kemiao.days.data.model.TimetableViewSettings
import com.yydsxwh.kemiao.days.data.model.Todo
import com.yydsxwh.kemiao.days.data.model.applyOcrImport
import com.yydsxwh.kemiao.days.data.model.currentAcademicYearStart
import com.yydsxwh.kemiao.days.data.model.defaultWeekCount
import com.yydsxwh.kemiao.days.data.model.dumpAppData
import com.yydsxwh.kemiao.days.data.model.emptyData
import com.yydsxwh.kemiao.days.data.model.fingerprint
import com.yydsxwh.kemiao.days.data.model.guessTermKind
import com.yydsxwh.kemiao.days.data.model.hydrateAppData
import com.yydsxwh.kemiao.days.data.model.hydrateTimetableOcr
import com.yydsxwh.kemiao.days.data.model.nowMillis
import com.yydsxwh.kemiao.days.data.model.parseAppDataJson
import com.yydsxwh.kemiao.days.data.model.uid
import com.yydsxwh.kemiao.days.data.model.withTombstones
import com.yydsxwh.kemiao.days.data.remote.DaysApi
import com.yydsxwh.kemiao.days.data.sync.SyncEngine
import com.yydsxwh.kemiao.days.data.sync.SyncState
import com.yydsxwh.kemiao.days.notify.ReminderScheduler
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

data class DaysUiState(
    val ready: Boolean = false,
    val data: AppData = emptyData(),
    val user: SessionUser? = null,
    val admin: Boolean = false,
    val sync: SyncState = SyncState.Starting,
    val pending: Boolean = false,
    val lastSyncedAt: Long? = null,
    val query: String = "",
    val notice: String? = null,
    val error: String? = null,
    val adminPayload: String? = null,
    val importing: Boolean = false,
)

class DaysViewModel(application: Application) : AndroidViewModel(application) {
    private val store = LocalStore(application)
    private val session = SecureSession(application)
    private val api = DaysApi(tokenProvider = { session.token() })
    private val engine = SyncEngine(api)
    private val reminders = ReminderScheduler(application)

    private val _state = MutableStateFlow(DaysUiState())
    val state: StateFlow<DaysUiState> = _state
    private var version: Long = 0
    private var syncedPrint: String? = null
    private var pushJob: Job? = null

    init {
        viewModelScope.launch(Dispatchers.IO) {
            val loaded = store.load()
            version = store.version()
            _state.update { it.copy(ready = true, data = loaded) }
            reminders.reschedule(loaded)
            refreshSession()
            syncNow()
        }
    }

    fun consumeHandoff(uri: Uri?) {
        val code = uri?.getQueryParameter("handoff") ?: return
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { api.consumeHandoff(code) }
                .onSuccess { (token, user) ->
                    session.save(token)
                    _state.update { it.copy(user = user, notice = "已登录 ${user.name ?: "账号中心"}") }
                    refreshSession()
                    syncNow()
                }
                .onFailure { _state.update { s -> s.copy(error = "登录交接失败，请再试一次") } }
        }
    }

    fun login(activity: android.app.Activity) {
        CustomTabsIntent.Builder().build().launchUrl(activity, Uri.parse(BuildConfig.LOGIN_URL))
    }

    fun logout() {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching { api.logout() }
            session.clear()
            _state.update { it.copy(user = null, admin = false, sync = SyncState.SignedOut, notice = "已退出登录，本机数据仍在") }
        }
    }

    fun setQuery(value: String) = _state.update { it.copy(query = value) }
    fun dismissNotice() = _state.update { it.copy(notice = null, error = null) }

    fun syncNow() {
        viewModelScope.launch(Dispatchers.IO) {
            _state.update { it.copy(sync = SyncState.Syncing) }
            val result = engine.reconcile(_state.value.data, version)
            applySync(result.data, result.version, result.state, result.pending)
        }
    }

    private suspend fun refreshSession() {
        val user = runCatching { api.session() }.getOrNull()
        val admin = if (user != null) runCatching { api.adminMe().admin }.getOrDefault(false) else false
        _state.update {
            it.copy(
                user = user,
                admin = admin,
                sync = when {
                    user == null && session.token() == null -> SyncState.SignedOut
                    user == null -> SyncState.LocalOnly
                    else -> it.sync
                },
            )
        }
    }

    private fun applySync(data: AppData?, nextVersion: Long?, sync: SyncState, pending: Boolean) {
        if (data != null) {
            store.save(data)
            reminders.reschedule(data)
        }
        if (nextVersion != null) {
            version = nextVersion
            store.saveVersion(nextVersion)
            if (data != null) syncedPrint = fingerprint(data)
        }
        _state.update {
            it.copy(
                data = data ?: it.data,
                sync = sync,
                pending = pending,
                lastSyncedAt = if (sync == SyncState.Synced) nowMillis() else it.lastSyncedAt,
            )
        }
    }

    private fun commit(transform: (AppData) -> AppData) {
        val next = transform(_state.value.data)
        store.save(next)
        reminders.reschedule(next)
        _state.update { it.copy(data = next, pending = true) }
        schedulePush()
    }

    private fun schedulePush() {
        pushJob?.cancel()
        pushJob = viewModelScope.launch {
            delay(1200)
            withContext(Dispatchers.IO) {
                if (_state.value.user == null) return@withContext
                val local = _state.value.data
                if (syncedPrint == fingerprint(local)) {
                    _state.update { it.copy(pending = false) }
                    return@withContext
                }
                _state.update { it.copy(sync = SyncState.Syncing) }
                val result = engine.pushOnly(local, version)
                applySync(result.data, result.version, result.state, result.pending)
            }
        }
    }

    fun addTodo(title: String, dueDate: String?, dueTime: String?, priority: String, remind: Int) = commit { data ->
        val item = Todo(uid(), title.trim(), false, dueDate, dueTime, null, priority, remind, nowMillis())
        if (item.title.isBlank()) data else data.copy(todos = listOf(item) + data.todos)
    }
    fun toggleTodo(id: String) = commit { it.copy(todos = it.todos.map { t -> if (t.id == id) t.copy(done = !t.done) else t }) }
    fun updateTodo(item: Todo) = commit { it.copy(todos = it.todos.map { t -> if (t.id == item.id) item else t }) }
    fun removeTodo(id: String) = commit { withTombstones(it, listOf(id)).copy(todos = it.todos.filter { t -> t.id != id }) }

    fun addCountdown(title: String, date: String, color: String, emoji: String, yearly: Boolean) = commit { data ->
        val item = Countdown(uid(), title.trim(), date, color.ifBlank { COUNTDOWN_COLORS.first() }, emoji.ifBlank { COUNTDOWN_EMOJIS.first() }, yearly, nowMillis())
        if (item.title.isBlank() || item.date.isBlank()) data else data.copy(countdowns = data.countdowns + item)
    }
    fun updateCountdown(item: Countdown) = commit { it.copy(countdowns = it.countdowns.map { c -> if (c.id == item.id) item else c }) }
    fun removeCountdown(id: String) = commit { withTombstones(it, listOf(id)).copy(countdowns = it.countdowns.filter { c -> c.id != id }) }

    fun addNote(title: String, body: String, color: String, date: String?) = commit { data ->
        val item = Note(uid(), title.trim(), body, color.ifBlank { NOTE_COLORS.first() }, false, date, nowMillis())
        if (item.title.isBlank() && item.body.isBlank()) data else data.copy(notes = listOf(item) + data.notes)
    }
    fun updateNote(item: Note) = commit { it.copy(notes = it.notes.map { n -> if (n.id == item.id) item.copy(updatedAt = nowMillis()) else n }) }
    fun removeNote(id: String) = commit { withTombstones(it, listOf(id)).copy(notes = it.notes.filter { n -> n.id != id }) }

    fun addCourse(item: Course) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, termId = item.termId ?: data.currentTermId, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.name.isBlank()) data else data.copy(courses = data.courses + ready)
    }
    fun updateCourse(item: Course) = commit { it.copy(courses = it.courses.map { c -> if (c.id == item.id) item else c }) }
    fun removeCourse(id: String) = commit { withTombstones(it, listOf(id)).copy(courses = it.courses.filter { c -> c.id != id }) }
    fun clearCourses() = commit { withTombstones(it, it.courses.map { c -> c.id }).copy(courses = emptyList()) }

    fun addExam(item: Exam) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.name.isBlank() || ready.date.isBlank()) data else data.copy(exams = (data.exams + ready).sortedBy { it.date })
    }
    fun updateExam(item: Exam) = commit { it.copy(exams = it.exams.map { e -> if (e.id == item.id) item else e }.sortedBy { e -> e.date }) }
    fun removeExam(id: String) = commit { withTombstones(it, listOf(id)).copy(exams = it.exams.filter { e -> e.id != id }) }

    fun addSelf(item: SelfScheduleItem) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.title.isBlank()) data else data.copy(selfSchedules = data.selfSchedules + ready)
    }
    fun updateSelf(item: SelfScheduleItem) = commit { it.copy(selfSchedules = it.selfSchedules.map { s -> if (s.id == item.id) item else s }) }
    fun removeSelf(id: String) = commit { withTombstones(it, listOf(id)).copy(selfSchedules = it.selfSchedules.filter { s -> s.id != id }) }

    fun addEvent(item: CalendarEvent) = commit { data ->
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = item.createdAt.takeIf { it > 0 } ?: nowMillis())
        if (ready.title.isBlank() || ready.date.isBlank()) data else data.copy(calendarEvents = data.calendarEvents + ready)
    }
    fun updateEvent(item: CalendarEvent) = commit { it.copy(calendarEvents = it.calendarEvents.map { e -> if (e.id == item.id) item else e }) }
    fun removeEvent(id: String) = commit { withTombstones(it, listOf(id)).copy(calendarEvents = it.calendarEvents.filter { e -> e.id != id }) }

    fun addRecurring(item: RecurringReminder) = commit { data ->
        val now = nowMillis()
        val ready = item.copy(id = item.id.ifBlank { uid() }, createdAt = now, updatedAt = now, rule = item.rule.takeIf { it.kind.isNotBlank() } ?: RecurrenceRule())
        if (ready.title.isBlank() || ready.startDate.isBlank()) data else data.copy(recurringReminders = listOf(ready) + data.recurringReminders)
    }
    fun updateRecurring(item: RecurringReminder) = commit { it.copy(recurringReminders = it.recurringReminders.map { r -> if (r.id == item.id) item.copy(updatedAt = nowMillis()) else r }) }
    fun removeRecurring(id: String) = commit { withTombstones(it, listOf(id)).copy(recurringReminders = it.recurringReminders.filter { r -> r.id != id }) }

    fun updateReminders(patch: ReminderSettings) = commit { it.copy(reminderSettings = patch) }
    fun updateTimetable(patch: TimetableViewSettings) = commit { it.copy(timetableView = patch) }

    fun addTerm() = commit { data ->
        val kind = guessTermKind()
        val term = Term(uid(), currentAcademicYearStart(), kind, null, "", defaultWeekCount(kind))
        data.copy(terms = data.terms + term, currentTermId = term.id, termStart = term.startDate.ifBlank { null })
    }
    fun updateTerm(term: Term) = commit { data ->
        val terms = data.terms.map { if (it.id == term.id) term else it }
        val current = terms.firstOrNull { it.id == data.currentTermId }
        data.copy(terms = terms, termStart = current?.startDate?.ifBlank { null })
    }
    fun setCurrentTerm(id: String) = commit { data ->
        val current = data.terms.firstOrNull { it.id == id } ?: return@commit data
        data.copy(currentTermId = id, termStart = current.startDate.ifBlank { null })
    }

    fun clearAll() = commit { emptyData() }

    fun exportJson(): String = dumpAppData(_state.value.data)

    fun importJson(text: String) {
        runCatching { hydrateAppData(parseAppDataJson(text)) }
            .onSuccess { next -> commit { next } }
            .onFailure { _state.update { s -> s.copy(error = "备份文件无效") } }
    }

    fun shareBackup(): Intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_TEXT, exportJson())
        putExtra(Intent.EXTRA_SUBJECT, "颗秒日事备份")
    }

    fun importBackup(context: Context, uri: Uri) {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { context.contentResolver.openInputStream(uri)?.bufferedReader()?.readText() }.getOrNull()
            if (text.isNullOrBlank()) {
                _state.update { it.copy(error = "读不到备份文件") }
                return@launch
            }
            importJson(text)
            _state.update { it.copy(notice = "已导入备份，正在按现有规则同步") }
        }
    }

    fun importOcr(context: Context, uri: Uri, kind: String) {
        viewModelScope.launch(Dispatchers.IO) {
            if (_state.value.user == null) {
                _state.update { it.copy(error = "导入课表需要先登录账号中心") }
                return@launch
            }
            val mime = context.contentResolver.getType(uri).orEmpty()
            val name = queryDisplayName(context, uri) ?: "timetable.jpg"
            if (mime.contains("heic", true) || name.endsWith(".heic", true) || name.endsWith(".heif", true)) {
                _state.update { it.copy(error = "请先把 HEIC 导出成 JPG 再导入") }
                return@launch
            }
            _state.update { it.copy(importing = true, notice = "正在识别课表…") }
            val bytes = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull()
            if (bytes == null || bytes.isEmpty()) {
                _state.update { it.copy(importing = false, error = "读不到文件") }
                return@launch
            }
            runCatching { api.uploadOcr(name, bytes, mime.ifBlank { "image/jpeg" }, kind) }
                .onSuccess { payload ->
                    val result = hydrateTimetableOcr(
                        payload,
                        _state.value.data.reminderSettings.classDefaultMinutes,
                        _state.value.data.reminderSettings.examDefaultMinutes,
                    )
                    if (result.courses.isEmpty() && result.exams.isEmpty() && result.selfSchedules.isEmpty()) {
                        _state.update { it.copy(importing = false, error = result.warnings.firstOrNull() ?: "没有识别出课程或考试") }
                        return@onSuccess
                    }
                    commit { applyOcrImport(it, result) }
                    val summary = listOfNotNull(
                        result.courses.takeIf { it.isNotEmpty() }?.let { "课程 ${it.size}" },
                        result.exams.takeIf { it.isNotEmpty() }?.let { "考试 ${it.size}" },
                        result.selfSchedules.takeIf { it.isNotEmpty() }?.let { "自律 ${it.size}" },
                    ).joinToString(" · ")
                    _state.update { it.copy(importing = false, notice = "已导入 $summary") }
                }
                .onFailure { _state.update { s -> s.copy(importing = false, error = "识别失败，请换一张更清晰的课表照片") } }
        }
    }

    fun loadAdmin() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.getIntegrations() }.getOrElse { it.message ?: "无法读取管理配置" }
            _state.update { it.copy(adminPayload = text) }
        }
    }

    fun testAccount() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.testAccount() }.getOrElse { it.message.orEmpty() }
            _state.update { it.copy(adminPayload = text, notice = "Account 探测完成") }
        }
    }

    fun testPlatform() {
        viewModelScope.launch(Dispatchers.IO) {
            val text = runCatching { api.testPlatform() }.getOrElse { it.message.orEmpty() }
            _state.update { it.copy(adminPayload = text, notice = "Platform 探测完成") }
        }
    }

    private fun queryDisplayName(context: Context, uri: Uri): String? {
        val cursor = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        return cursor?.use { if (it.moveToFirst()) it.getString(0) else null }
    }
}
