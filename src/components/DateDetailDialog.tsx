import { useState } from 'react'
import { formatLong } from '../lib/dates'
import { eventMatchesDate, formatEventTime } from '../lib/calendar-events'
import { holidaysOn, holidayMark } from '../lib/holidays/query'
import { lunarLabel } from '../lib/lunar'
import { courseInTeachingWeek, startOfWeek, teachingWeekNumber } from '../lib/week-grid'
import { courseRemarkId, dayRemarkId, occurrenceRemarkId, remarkById } from '../lib/remarks'
import { termLabel } from '../lib/terms'
import type { AppStore } from '../hooks/useAppStore'
import type { Course } from '../types'

export function DateDetailDialog({ store, iso, onClose, onOpenEvent }: { store: AppStore; iso: string; onClose: () => void; onOpenEvent?: (id: string) => void }) {
  const date = new Date(`${iso}T12:00:00`)
  const holidays = holidaysOn(iso, store.data.holidaySettings)
  const events = store.data.calendarEvents.filter((event) => eventMatchesDate(event, iso))
  const todos = store.data.todos.filter((todo) => todo.dueDate === iso)
  const exams = store.data.exams.filter((exam) => exam.date === iso)
  const days = store.data.countdowns.filter((item) => item.date === iso || item.date.slice(5) === iso.slice(5))
  const weekday = date.getDay() === 0 ? 7 : date.getDay()
  const term = store.data.terms.find((item) => item.id === store.data.currentTermId)
  const week = teachingWeekNumber(startOfWeek(date, store.data.timetableView.weekStartsOn), term?.startDate, store.data.timetableView.weekStartsOn)
  const courses = store.data.courses.filter((course) => course.weekday === weekday && (course.termId == null || course.termId === store.data.currentTermId) && courseInTeachingWeek(course, week))
  const reminders = (store.data.reminderRules ?? []).filter((rule) => {
    if (rule.targetType === 'event') return events.some((event) => event.id === rule.targetId)
    if (rule.targetType === 'todo') return todos.some((todo) => todo.id === rule.targetId)
    if (rule.targetType === 'exam') return exams.some((exam) => exam.id === rule.targetId)
    if (rule.targetType === 'course') return courses.some((course) => course.id === rule.targetId)
    if (rule.targetType === 'holiday') return holidays.some((item) => item.stableKey === rule.targetId)
    return false
  })
  const saved = remarkById(store.data.remarks, dayRemarkId(iso))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(saved?.body ?? '')
  const [message, setMessage] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [course, setCourse] = useState<Course | null>(null)
  const dirty = editing && draft !== (saved?.body ?? '')
  const close = () => {
    if (dirty && !window.confirm('放弃还没保存的备注？')) return
    onClose()
  }
  const save = () => {
    if (!draft.trim()) {
      setMessage('请先填写备注')
      return
    }
    try {
      store.saveRemark('day', draft, { date: iso })
      setEditing(false)
      setMessage('备注已保存')
    } catch {
      setMessage('保存失败，内容还在')
    }
  }
  return (
    <div className="detail-layer" role="dialog" aria-modal="true" aria-label="日期详情" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <section className="detail-sheet">
        <div className="row wrap">
          <h2 style={{ margin: 0 }}>{formatLong(date)}</h2>
          <button className="btn" type="button" onClick={close}>关闭</button>
        </div>
        <p>农历 {lunarLabel(iso) || '未收录'}</p>
        <h3>节日</h3>
        {holidays.length === 0 ? <p className="muted">这天没有收录的节日</p> : holidays.map((item) => <p key={item.id}>{holidayMark(item)} {item.name} · {item.region === 'CN' ? '中国' : '美国'}{item.isDayOff ? ' · 放假' : ''}{item.isAdjustedWorkday ? ' · 补班' : ''}{item.description ? ` · ${item.description}` : ''}</p>)}
        <h3>日程</h3>
        {events.length === 0 ? <p className="muted">没有日程</p> : events.map((event) => <button key={event.id} className="btn detail-row" type="button" onClick={() => onOpenEvent?.(event.id)}>{formatEventTime(event)} {event.title}</button>)}
        <h3>待办</h3>
        {todos.length === 0 ? <p className="muted">没有待办</p> : todos.map((todo) => <button key={todo.id} className="btn detail-row" type="button" onClick={() => { const next = window.prompt('编辑待办标题', todo.title); if (next && next.trim()) store.updateTodo(todo.id, { title: next.trim() }) }}>{todo.dueTime || ''} {todo.title}</button>)}
        <h3>提醒</h3>
        {reminders.length === 0 ? <p className="muted">没有提醒</p> : reminders.map((rule) => <p key={rule.id}>{rule.delivery === 'alarm' ? '闹钟' : '通知'} · {rule.triggerMode === 'absolute' ? rule.triggerAt : `提前 ${rule.offsetMinutes ?? 0} 分钟`}</p>)}
        <h3>课程</h3>
        {courses.length === 0 ? <p className="muted">没有课</p> : courses.map((item) => <button key={item.id} className="btn detail-row" type="button" onClick={() => setCourse(item)}>{item.startTime}-{item.endTime} {item.name}{item.location ? ` · ${item.location}` : ''}</button>)}
        <h3>考试</h3>
        {exams.length === 0 ? <p className="muted">没有考试</p> : exams.map((exam) => <button key={exam.id} className="btn detail-row" type="button" onClick={() => { const next = window.prompt('编辑考试名称', exam.name); if (next && next.trim()) store.updateExam(exam.id, { name: next.trim() }) }}>{exam.startTime} {exam.name}</button>)}
        <h3>日子</h3>
        {days.length === 0 ? <p className="muted">没有倒数日</p> : days.map((item) => <p key={item.id}>{item.emoji} {item.title}</p>)}
        <h3>备注</h3>
        {!editing && !saved ? <button className="btn" type="button" onClick={() => { setDraft(''); setEditing(true); setMessage('') }}>添加备注</button> : null}
        {!editing && saved ? (
          <>
            <p style={{ whiteSpace: 'pre-wrap' }}>{saved.body}</p>
            <button className="btn" type="button" onClick={() => { setDraft(saved.body); setEditing(true); setMessage('') }}>编辑</button>
            <button className="btn" type="button" onClick={() => setConfirmDelete(true)}>删除</button>
          </>
        ) : null}
        {editing ? (
          <>
            <textarea className="textarea" rows={6} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="日期备注" />
            <button className="btn primary" type="button" onClick={save}>保存</button>
            <button className="btn" type="button" onClick={() => { if (draft !== (saved?.body ?? '') && !window.confirm('放弃还没保存的备注？')) return; setEditing(false); setDraft(saved?.body ?? '') }}>取消</button>
          </>
        ) : null}
        {confirmDelete ? (
          <p>
            只删除这一天的备注，日程和课程会保留。
            <button className="btn" type="button" onClick={() => { store.removeRemark(dayRemarkId(iso)); setConfirmDelete(false); setEditing(false); setMessage('备注已删除') }}>确认删除</button>
            <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>取消</button>
          </p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
        {course ? <CourseNotePanel store={store} course={course} iso={iso} termName={term ? termLabel(term) : '未设置学期'} onClose={() => setCourse(null)} /> : null}
      </section>
    </div>
  )
}

function CourseNotePanel({ store, course, iso, termName, onClose }: { store: AppStore; course: Course; iso: string; termName: string; onClose: () => void }) {
  const courseNote = remarkById(store.data.remarks, courseRemarkId(course.id))?.body ?? course.note ?? ''
  const once = remarkById(store.data.remarks, occurrenceRemarkId(course.id, iso, course.startTime))?.body ?? ''
  const [scope, setScope] = useState<'occurrence' | 'course'>('occurrence')
  const [draft, setDraft] = useState(once)
  const [message, setMessage] = useState('')
  const saved = scope === 'course' ? courseNote : once
  const save = () => {
    if (!draft.trim()) {
      setMessage('请先填写备注')
      return
    }
    store.saveRemark(scope, draft, { courseId: course.id, date: iso, startTime: course.startTime })
    setMessage(scope === 'course' ? '整门课程备注已保存' : '本次课程备注已保存')
  }
  const remove = () => {
    if (!window.confirm(scope === 'course' ? '删除整门课程备注？本次备注会保留。' : '删除本次课程备注？整门备注会保留。')) return
    const id = scope === 'course' ? courseRemarkId(course.id) : occurrenceRemarkId(course.id, iso, course.startTime)
    store.removeRemark(id)
    setDraft('')
    setMessage(scope === 'course' ? '整门课程备注已删除' : '本次课程备注已删除')
  }
  const period = store.data.timetableView.classPeriods.findIndex((item) => item.start === course.startTime)
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>{course.name}</h3>
      <p>教师 {course.teacher || '未填写'}</p>
      <p>地点 {course.location || '未填写'}</p>
      <p>日期 {iso}</p>
      <p>星期 {['一', '二', '三', '四', '五', '六', '日'][course.weekday - 1]}</p>
      <p>开始 {course.startTime} · 结束 {course.endTime}</p>
      <p>节次 {period >= 0 ? `第${period + 1}节` : `${course.startTime}-${course.endTime}`}</p>
      <p>周次 {course.weeks || '未填写'}</p>
      <p>学期 {termName}</p>
      <p>重复 每周{course.weeks ? ` · ${course.weeks}` : ''}</p>
      <p>提醒 提前 {course.remindMinutes} 分钟</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>整门课程：{courseNote || '还没有'}</p>
      <p style={{ whiteSpace: 'pre-wrap' }}>本次课程：{once || '还没有'}</p>
      <label><input type="radio" name="day-course-scope" checked={scope === 'occurrence'} onChange={() => { setScope('occurrence'); setDraft(once) }} /> 仅本次课程</label>
      <label><input type="radio" name="day-course-scope" checked={scope === 'course'} onChange={() => { setScope('course'); setDraft(courseNote) }} /> 整门课程</label>
      <textarea className="textarea" rows={5} value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="课程备注" />
      {message ? <p role="status">{message}</p> : null}
      <button className="btn primary" type="button" onClick={save}>保存</button>
      <button className="btn" type="button" onClick={remove}>删除当前范围的备注</button>
      <button className="btn" type="button" onClick={() => { if (draft !== saved && !window.confirm('放弃还没保存的备注？')) return; onClose() }}>关闭</button>
    </div>
  )
}
