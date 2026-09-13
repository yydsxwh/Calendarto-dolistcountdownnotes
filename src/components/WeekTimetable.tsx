import { useMemo } from 'react'
import { addClockMinutes, formatDuration } from '../lib/periods'
import type { TimetableViewSettings } from '../types'
import {
  HOUR_PX,
  blockStyle,
  examsForDay,
  gridHeight,
  hourMarksFromHidden,
  layoutDayCourses,
  nowLineTop,
  slotFromOffset,
  weekDays,
  type WeekDayColumn,
} from '../lib/week-grid'
import { EXAM_KIND_LABEL, type Course, type Exam } from '../types'

export default function WeekTimetable({
  courses,
  exams,
  weekStart,
  now,
  view,
  selectedId,
  offWeekIds,
  onSelectCourse,
  onSelectSlot,
  onHideHour,
  onHideWeekday,
}: {
  courses: Course[]
  exams: Exam[]
  weekStart: Date
  now: Date
  view: TimetableViewSettings
  selectedId?: string
  offWeekIds?: Set<string>
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
  onHideHour?: (hour: number) => void
  onHideWeekday?: (weekday: number) => void
}) {
  const days = useMemo(
    () => weekDays(weekStart, now, view.weekStartsOn, view.hiddenWeekdays),
    [now, view.hiddenWeekdays, view.weekStartsOn, weekStart],
  )
  const marks = useMemo(() => hourMarksFromHidden(view.hiddenHours), [view.hiddenHours])
  const bodyHeight = gridHeight(view.hiddenHours, HOUR_PX)
  const nowTop = nowLineTop(now, view.hiddenHours, HOUR_PX)
  const columns = `48px repeat(${Math.max(1, days.length)}, minmax(0, 1fr))`

  return (
    <div className="week-tt">
      <div className="week-tt-head" style={{ gridTemplateColumns: columns }}>
        <div className="week-tt-gutter" aria-hidden="true">
          时间
        </div>
        {days.map((day) => (
          <div
            key={day.iso}
            className={`week-tt-h ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}
          >
            <strong>{day.label}</strong>
            <span>
              {day.date.getMonth() + 1}/{day.date.getDate()}
            </span>
            {onHideWeekday && days.length > 1 ? (
              <button
                type="button"
                className="week-tt-hide"
                onClick={() => onHideWeekday(day.weekday)}
                aria-label={`隐藏${day.label}`}
              >
                隐藏
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="week-tt-body" style={{ height: bodyHeight, gridTemplateColumns: columns }}>
        <div className="week-tt-gutter-col">
          {marks.map((mark) => (
            <div
              key={mark.hour}
              className="week-tt-hour"
              style={{ top: marks.indexOf(mark) * HOUR_PX }}
            >
              <span>{mark.label}</span>
              {onHideHour && marks.length > 1 ? (
                <button
                  type="button"
                  className="week-tt-hide"
                  onClick={() => onHideHour(mark.hour)}
                  aria-label={`隐藏 ${mark.label} 这一行`}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day.iso}
            day={day}
            courses={courses.filter((c) => c.weekday === day.weekday)}
            exams={examsForDay(exams, day.iso)}
            hiddenHours={view.hiddenHours}
            marks={marks}
            nowTop={day.isToday ? nowTop : null}
            selectedId={selectedId}
            offWeekIds={offWeekIds}
            onSelectCourse={onSelectCourse}
            onSelectSlot={onSelectSlot}
          />
        ))}
      </div>
    </div>
  )
}

function DayColumn({
  day,
  courses,
  exams,
  hiddenHours,
  marks,
  nowTop,
  selectedId,
  offWeekIds,
  onSelectCourse,
  onSelectSlot,
}: {
  day: WeekDayColumn
  courses: Course[]
  exams: Exam[]
  hiddenHours: number[]
  marks: { hour: number; minutes: number; label: string }[]
  nowTop: number | null
  selectedId?: string
  offWeekIds?: Set<string>
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
}) {
  const laid = useMemo(
    () => layoutDayCourses(courses, hiddenHours, HOUR_PX),
    [courses, hiddenHours],
  )

  return (
    <div
      className={`week-tt-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('.week-tt-course, .week-tt-exam, .week-tt-hide')) return
        const rect = event.currentTarget.getBoundingClientRect()
        const slot = slotFromOffset(event.clientY - rect.top, hiddenHours, HOUR_PX)
        onSelectSlot({ weekday: day.weekday, ...slot })
      }}
    >
      {marks.map((mark, index) => (
        <div key={mark.hour} className="week-tt-line" style={{ top: index * HOUR_PX }} />
      ))}
      {laid.map((item) => (
        <button
          key={item.course.id}
          type="button"
          className={`week-tt-course ${selectedId === item.course.id ? 'is-selected' : ''} ${offWeekIds?.has(item.course.id) ? 'is-offweek' : ''}`}
          style={{ ...blockStyle(item), background: item.course.color }}
          onClick={(event) => {
            event.stopPropagation()
            onSelectCourse(item.course)
          }}
        >
          <strong>{item.course.name}</strong>
          {item.course.location ? <span>{item.course.location}</span> : null}
          <span>
            {item.course.startTime}-{item.course.endTime}
          </span>
        </button>
      ))}
      {exams.map((exam) => {
        const fake = layoutDayCourses(
          [
            {
              id: exam.id,
              name: exam.name,
              weekday: day.weekday,
              startTime: exam.startTime,
              endTime:
                exam.endTime && exam.endTime > exam.startTime
                  ? exam.endTime
                  : addClockMinutes(exam.startTime, 90),
              color: '#e11d48',
              remindMinutes: exam.remindMinutes,
              createdAt: exam.createdAt,
            },
          ],
          hiddenHours,
          HOUR_PX,
        )[0]
        if (!fake) return null
        return (
          <article key={exam.id} className="week-tt-exam" style={blockStyle(fake)}>
            <strong>
              {EXAM_KIND_LABEL[exam.kind]} · {exam.name}
            </strong>
            <span>
              {exam.startTime}
              {exam.endTime ? `-${exam.endTime}` : ''} {exam.location || ''}
            </span>
            <span>{formatDuration(exam.startTime, exam.endTime || exam.startTime)}</span>
          </article>
        )
      })}
      {nowTop != null && (
        <div className="week-tt-now" style={{ top: nowTop }} aria-hidden="true">
          <i />
        </div>
      )}
    </div>
  )
}
