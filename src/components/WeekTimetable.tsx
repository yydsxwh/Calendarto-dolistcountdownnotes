import { useEffect, useMemo, useState } from 'react'
import { addClockMinutes, formatDuration, WEEKDAY_LABELS } from '../lib/periods'
import { loadData, saveData } from '../lib/store'
import type { AppData, Course, TimetableViewSettings, Exam } from '../types'
import {
  HOUR_PX,
  axisHeight,
  axisOffset,
  axisRunTop,
  blockStyle,
  buildTimeAxis,
  examsForDay,
  hiddenHourRunLabel,
  hiddenHourRuns,
  hoursInRun,
  layoutDayCourses,
  nowLineTop,
  slotFromOffset,
  weekDays,
  weekdayOrder,
  type TimeAxis,
  type TimeAxisMark,
  type WeekDayColumn,
} from '../lib/week-grid'
import { EXAM_KIND_LABEL } from '../types'

const COURSE_PALETTE = [
  '#2563eb','#3b82f6','#60a5fa','#38bdf8','#06b6d4','#14b8a6','#10b981','#22c55e',
  '#84cc16','#eab308','#f59e0b','#f97316','#fb7185','#f43f5e','#e11d48','#ec4899',
  '#d946ef','#a855f7','#8b5cf6','#7c3aed','#6366f1','#0f766e','#0891b2','#0369a1',
  '#1d4ed8','#be123c','#c2410c','#a16207','#4d7c0f','#475569','#64748b','#334155',
]

export default function WeekTimetable({
  courses, axisCourses, exams, weekStart, now, view, selectedId, offWeekIds,
  onSelectCourse, onSelectSlot, onHideHour, onShowHours, onShowWeekdays,
}: {
  courses: Course[]
  axisCourses?: Course[]
  exams: Exam[]
  weekStart: Date
  now: Date
  view: TimetableViewSettings
  selectedId?: string
  offWeekIds?: Set<string>
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
  onHideHour?: (hour: number) => void
  onShowHours?: (hours: number[]) => void
  onShowWeekdays?: (weekdays: number[]) => void
}) {
  const [detail, setDetail] = useState<Course | null>(null)
  const [draftNote, setDraftNote] = useState('')
  const [draftColor, setDraftColor] = useState(COURSE_PALETTE[0])
  const [customColor, setCustomColor] = useState(COURSE_PALETTE[0])
  const days = useMemo(() => weekDays(weekStart, now, view.weekStartsOn, view.hiddenWeekdays), [now, view.hiddenWeekdays, view.weekStartsOn, weekStart])
  const weekIsos = useMemo(() => new Set(days.map((day) => day.iso)), [days])
  const axis = useMemo(() => buildTimeAxis({ hiddenHours: view.hiddenHours, hourPx: HOUR_PX, courses: axisCourses ?? courses, exams: exams.filter((exam) => weekIsos.has(exam.date)) }), [axisCourses, courses, exams, view.hiddenHours, weekIsos])
  const hiddenRuns = useMemo(() => hiddenHourRuns(view.hiddenHours), [view.hiddenHours])
  const hiddenDayCols = useMemo(() => weekdayOrder(view.weekStartsOn).filter((weekday) => view.hiddenWeekdays.includes(weekday)), [view.hiddenWeekdays, view.weekStartsOn])
  const bodyHeight = axisHeight(axis) + 18
  const nowTop = nowLineTop(now, view.hiddenHours, HOUR_PX, axis)
  const columns = `68px repeat(${Math.max(1, days.length)}, minmax(0, 1fr))`

  useEffect(() => {
    if (!detail) return
    const latest = courses.find((course) => course.id === detail.id)
    if (!latest) return
    if ((latest.note ?? '') === draftNote && latest.color === draftColor) return
    if ((latest.note ?? '') !== (detail.note ?? '') || latest.color !== detail.color) {
      setDetail(latest)
      setDraftNote(latest.note ?? '')
      setDraftColor(latest.color || COURSE_PALETTE[0])
    }
  }, [courses, detail, draftColor, draftNote])

  const openCourse = (course: Course) => {
    const latest = loadData().courses.find((item) => item.id === course.id) ?? course
    setDetail(latest)
    setDraftNote(latest.note ?? '')
    setDraftColor(latest.color || COURSE_PALETTE[0])
    setCustomColor(latest.color || COURSE_PALETTE[0])
    onSelectCourse(latest)
  }

  const saveCourseDetail = () => {
    if (!detail) return
    const data = loadData()
    const courses = data.courses.map((course) => course.id === detail.id ? { ...course, note: draftNote, color: draftColor } : course)
    saveData({ ...data, courses } as AppData)
    const updated = courses.find((course) => course.id === detail.id)
    if (updated) setDetail(updated)
    window.dispatchEvent(new Event('days-data-changed'))
    onSelectCourse(updated ?? detail)
  }

  const deleteCourse = () => {
    if (!detail || !window.confirm(`确定删除「${detail.name}」吗？`)) return
    const data = loadData()
    saveData({ ...data, courses: data.courses.filter((course) => course.id !== detail.id) })
    window.dispatchEvent(new Event('days-data-changed'))
    setDetail(null)
    onSelectCourse(detail)
  }

  return (
    <>
      <div className="week-tt">
        {hiddenDayCols.length && onShowWeekdays ? <div className="week-tt-restore">{hiddenDayCols.map((weekday) => <button key={weekday} type="button" className="week-tt-expand" onClick={() => onShowWeekdays([weekday])}>› 显示{WEEKDAY_LABELS[weekday - 1]}</button>)}</div> : null}
        <div className="week-tt-head" style={{ gridTemplateColumns: columns }}>
          <div className="week-tt-gutter">
            <span>时间</span>
            {onShowHours ? hiddenRuns.filter((run) => run.start === 0).map((run) => <button key={`head-${run.start}-${run.end}`} type="button" className="week-tt-expand" onClick={() => onShowHours(hoursInRun(run))}>▾ {hiddenHourRunLabel(run)}</button>) : null}
          </div>
          {days.map((day) => <div key={day.iso} className={`week-tt-h ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}><strong>{day.label}</strong><span>{day.date.getMonth() + 1}/{day.date.getDate()}</span></div>)}
        </div>
        <div className="week-tt-body" style={{ height: bodyHeight, gridTemplateColumns: columns }}>
          <div className="week-tt-gutter-col">
            {axis.marks.map((mark) => <div key={`${mark.kind}-${mark.minutes}`} className={`week-tt-hour is-${mark.kind}`} style={{ top: axisOffset(mark.minutes, axis) }}><span>{mark.label}</span>{onHideHour && mark.kind === 'hour' && axis.marks.length > 1 ? <button type="button" className="week-tt-hide" onClick={() => onHideHour(Math.floor(mark.minutes / 60) % 24)}>×</button> : null}</div>)}
            {onShowHours ? hiddenRuns.filter((run) => run.start !== 0).map((run) => { const top = axisRunTop(run, axis); if (top < -8 || top > bodyHeight) return null; return <button key={`${run.start}-${run.end}`} type="button" className="week-tt-expand week-tt-expand-hour" style={{ top }} onClick={() => onShowHours(hoursInRun(run))}>▾</button> }) : null}
          </div>
          {days.map((day) => <DayColumn key={day.iso} day={day} courses={courses.filter((c) => c.weekday === day.weekday)} exams={examsForDay(exams, day.iso)} hiddenHours={view.hiddenHours} axis={axis} nowTop={day.isToday ? nowTop : null} selectedId={selectedId} offWeekIds={offWeekIds} onSelectCourse={openCourse} onSelectSlot={onSelectSlot} />)}
        </div>
      </div>

      {detail ? (
        <div role="dialog" aria-modal="true" aria-label="课程详情" style={{ position:'fixed', inset:0, zIndex:80, background:'rgba(15,23,42,.38)', backdropFilter:'blur(7px)', display:'flex', alignItems:'stretch', justifyContent:'flex-end' }} onClick={(e) => { if (e.target === e.currentTarget) setDetail(null) }}>
          <section style={{ width:'min(620px,100%)', height:'100%', overflowY:'auto', background:'#fff', padding:'max(24px, env(safe-area-inset-top)) 24px 32px', boxShadow:'-20px 0 60px rgba(15,23,42,.18)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:24 }}>
              <button className="btn ghost" onClick={() => setDetail(null)}>← 返回课表</button>
              <button className="icon-btn" onClick={() => setDetail(null)} aria-label="关闭课程详情">✕</button>
            </div>
            <div style={{ display:'flex', gap:14, alignItems:'center' }}>
              <div style={{ width:16, height:56, borderRadius:999, background:draftColor, boxShadow:`0 8px 22px ${draftColor}55` }} />
              <div><p className="kicker">课程详情</p><h2 style={{ margin:'3px 0' }}>{detail.name}</h2><p className="muted">{WEEKDAY_LABELS[detail.weekday - 1]} · {detail.startTime}-{detail.endTime}</p></div>
            </div>
            <div className="card" style={{ marginTop:20, boxShadow:'none' }}>
              <h3>上课信息</h3>
              <div className="mini-list">
                <div className="mini-list"><span>时间</span><strong>{detail.startTime}-{detail.endTime} · {formatDuration(detail.startTime, detail.endTime)}</strong></div>
                {detail.location ? <div className="mini-list"><span>教室</span><strong>{detail.location}</strong></div> : null}
                {detail.teacher ? <div className="mini-list"><span>老师</span><strong>{detail.teacher}</strong></div> : null}
                {detail.weeks ? <div className="mini-list"><span>周次</span><strong>{detail.weeks}</strong></div> : null}
              </div>
            </div>
            <div className="card" style={{ marginTop:16, boxShadow:'none' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}><h3 style={{ margin:0 }}>课程颜色</h3><span className="muted">选一个喜欢的色块</span></div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(8, minmax(30px,1fr))', gap:10, marginTop:14 }}>
                {COURSE_PALETTE.map((color) => <button key={color} type="button" aria-label={`选择颜色 ${color}`} title={color} onClick={() => setDraftColor(color)} style={{ width:32, height:32, borderRadius:'50%', border:draftColor===color?'3px solid #111827':'2px solid rgba(15,23,42,.08)', background:color, cursor:'pointer', boxShadow:draftColor===color?'0 0 0 4px rgba(37,99,235,.15)':'none' }} />)}
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center', marginTop:16, flexWrap:'wrap' }}>
                <input type="color" value={customColor} onChange={(e) => { setCustomColor(e.target.value); setDraftColor(e.target.value) }} style={{ width:46, height:40, padding:2, borderRadius:10, border:'1px solid var(--line)', background:'#fff' }} aria-label="自定义课程颜色" />
                <input className="input slim" value={draftColor} onChange={(e) => { setDraftColor(e.target.value); setCustomColor(e.target.value) }} placeholder="#2563eb" aria-label="课程颜色 HEX" />
                <span className="muted">支持自定义 HEX 颜色</span>
              </div>
            </div>
            <div className="card" style={{ marginTop:16, boxShadow:'none' }}>
              <h3>我的课程备注</h3>
              <textarea className="textarea" rows={8} value={draftNote} onChange={(e) => setDraftNote(e.target.value)} placeholder="例如：老师重点讲第三章；下周带计算器；作业交到学习通……" />
              <p className="muted">备注会保存到这门课，并随账号同步到其他设备。</p>
            </div>
            <div className="row wrap" style={{ marginTop:18, justifyContent:'space-between' }}>
              <button className="btn ghost" onClick={deleteCourse}>删除课程</button>
              <button className="btn primary" onClick={saveCourseDetail}>保存课程详情</button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

function DayColumn({ day, courses, exams, hiddenHours, axis, nowTop, selectedId, offWeekIds, onSelectCourse, onSelectSlot }: {
  day: WeekDayColumn; courses: Course[]; exams: Exam[]; hiddenHours: number[]; axis: TimeAxis; nowTop: number | null; selectedId?: string; offWeekIds?: Set<string>; onSelectCourse: (course: Course) => void; onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
}) {
  const laid = useMemo(() => layoutDayCourses(courses, hiddenHours, HOUR_PX, axis), [axis, courses, hiddenHours])
  return <div className={`week-tt-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`} onClick={(event) => { const target = event.target as HTMLElement; if (target.closest('.week-tt-course, .week-tt-exam, .week-tt-hide, .week-tt-expand')) return; const rect = event.currentTarget.getBoundingClientRect(); const slot = slotFromOffset(event.clientY - rect.top, hiddenHours, HOUR_PX, 90, axis); onSelectSlot({ weekday: day.weekday, ...slot }) }}>
    {axis.marks.map((mark: TimeAxisMark) => <div key={`${mark.kind}-${mark.minutes}`} className={`week-tt-line is-${mark.kind}`} style={{ top: axisOffset(mark.minutes, axis) }} />)}
    {laid.map((item) => <button key={item.course.id} type="button" className={`week-tt-course ${selectedId === item.course.id ? 'is-selected' : ''} ${offWeekIds?.has(item.course.id) ? 'is-offweek' : ''}`} style={{ ...blockStyle(item), background:item.course.color }} onClick={(event) => { event.stopPropagation(); onSelectCourse(item.course) }}><strong>{item.course.name}</strong>{item.course.location ? <span>{item.course.location}</span> : null}{item.course.weeks ? <span>{item.course.weeks}</span> : null}<span>{item.course.startTime}-{item.course.endTime}</span></button>)}
    {exams.map((exam) => { const fake = layoutDayCourses([{ id:exam.id, name:exam.name, weekday:day.weekday, startTime:exam.startTime, endTime:exam.endTime && exam.endTime > exam.startTime ? exam.endTime : addClockMinutes(exam.startTime,90), color:'#e11d48', remindMinutes:exam.remindMinutes, createdAt:exam.createdAt }], hiddenHours,HOUR_PX,axis)[0]; if(!fake)return null; return <article key={exam.id} className="week-tt-exam" style={blockStyle(fake)}><strong>{EXAM_KIND_LABEL[exam.kind]} · {exam.name}</strong><span>{exam.startTime}{exam.endTime ? `-${exam.endTime}` : ''} {exam.location || ''}</span><span>{formatDuration(exam.startTime,exam.endTime||exam.startTime)}</span></article> })}
    {nowTop != null ? <div className="week-tt-now" style={{ top:nowTop }} aria-hidden="true"><i /></div> : null}
  </div>
}
