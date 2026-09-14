import { useMemo } from 'react'
import { addClockMinutes, formatDuration, WEEKDAY_LABELS } from '../lib/periods'
import type { TimetableViewSettings } from '../types'
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
import { EXAM_KIND_LABEL, type Course, type Exam } from '../types'

export default function WeekTimetable({
  courses,
  axisCourses,
  exams,
  weekStart,
  now,
  view,
  selectedId,
  offWeekIds,
  onSelectCourse,
  onSelectSlot,
  onHideHour,
  onShowHours,
  onShowWeekdays,
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
  const days = useMemo(
    () => weekDays(weekStart, now, view.weekStartsOn, view.hiddenWeekdays),
    [now, view.hiddenWeekdays, view.weekStartsOn, weekStart],
  )
  const weekIsos = useMemo(() => new Set(days.map((day) => day.iso)), [days])
  const axis = useMemo(
    () =>
      buildTimeAxis({
        hiddenHours: view.hiddenHours,
        hourPx: HOUR_PX,
        courses: axisCourses ?? courses,
        exams: exams.filter((exam) => weekIsos.has(exam.date)),
      }),
    [axisCourses, courses, exams, view.hiddenHours, weekIsos],
  )
  const hiddenRuns = useMemo(() => hiddenHourRuns(view.hiddenHours), [view.hiddenHours])
  const hiddenDayCols = useMemo(
    () => weekdayOrder(view.weekStartsOn).filter((weekday) => view.hiddenWeekdays.includes(weekday)),
    [view.hiddenWeekdays, view.weekStartsOn],
  )
  const bodyHeight = axisHeight(axis) + 18
  const nowTop = nowLineTop(now, view.hiddenHours, HOUR_PX, axis)
  const columns = `54px repeat(${Math.max(1, days.length)}, minmax(0, 1fr))`

  return (
    <div className="week-tt">
      {hiddenDayCols.length && onShowWeekdays ? (
        <div className="week-tt-restore">
          {hiddenDayCols.map((weekday) => (
            <button
              key={weekday}
              type="button"
              className="week-tt-expand"
              onClick={() => onShowWeekdays([weekday])}
            >
              › 显示{WEEKDAY_LABELS[weekday - 1]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="week-tt-head" style={{ gridTemplateColumns: columns }}>
        <div className="week-tt-gutter">
          <span>时间</span>
          {onShowHours
            ? hiddenRuns
                .filter((run) => run.start === 0)
                .map((run) => (
                  <button
                    key={`head-${run.start}-${run.end}`}
                    type="button"
                    className="week-tt-expand"
                    onClick={() => onShowHours(hoursInRun(run))}
                    aria-label={`显示 ${hiddenHourRunLabel(run)}`}
                    title="展开凌晨不上课的行"
                  >
                    ▾ {hiddenHourRunLabel(run)}
                  </button>
                ))
            : null}
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
          </div>
        ))}
      </div>
      <div className="week-tt-body" style={{ height: bodyHeight, gridTemplateColumns: columns }}>
        <div className="week-tt-gutter-col">
          {axis.marks.map((mark) => (
            <div
              key={`${mark.kind}-${mark.minutes}`}
              className={`week-tt-hour is-${mark.kind}`}
              style={{ top: axisOffset(mark.minutes, axis) }}
            >
              <span>{mark.label}</span>
              {onHideHour && mark.kind === 'hour' && axis.marks.length > 1 ? (
                <button
                  type="button"
                  className="week-tt-hide"
                  onClick={() => onHideHour(Math.floor(mark.minutes / 60) % 24)}
                  aria-label={`隐藏 ${mark.label} 这一行`}
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}
          {onShowHours
            ? hiddenRuns
                .filter((run) => run.start !== 0)
                .map((run) => {
                  const top = axisRunTop(run, axis)
                  if (top < -8 || top > bodyHeight) return null
                  return (
                    <button
                      key={`${run.start}-${run.end}`}
                      type="button"
                      className="week-tt-expand week-tt-expand-hour"
                      style={{ top }}
                      onClick={() => onShowHours(hoursInRun(run))}
                      aria-label={`显示 ${hiddenHourRunLabel(run)}`}
                    >
                      ▾
                    </button>
                  )
                })
            : null}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day.iso}
            day={day}
            courses={courses.filter((c) => c.weekday === day.weekday)}
            exams={examsForDay(exams, day.iso)}
            hiddenHours={view.hiddenHours}
            axis={axis}
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
  axis,
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
  axis: TimeAxis
  nowTop: number | null
  selectedId?: string
  offWeekIds?: Set<string>
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
}) {
  const laid = useMemo(
    () => layoutDayCourses(courses, hiddenHours, HOUR_PX, axis),
    [axis, courses, hiddenHours],
  )

  return (
    <div
      className={`week-tt-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('.week-tt-course, .week-tt-exam, .week-tt-hide, .week-tt-expand')) return
        const rect = event.currentTarget.getBoundingClientRect()
        const slot = slotFromOffset(event.clientY - rect.top, hiddenHours, HOUR_PX, 90, axis)
        onSelectSlot({ weekday: day.weekday, ...slot })
      }}
    >
      {axis.marks.map((mark: TimeAxisMark) => (
        <div
          key={`${mark.kind}-${mark.minutes}`}
          className={`week-tt-line is-${mark.kind}`}
          style={{ top: axisOffset(mark.minutes, axis) }}
        />
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
          {item.course.weeks ? <span>{item.course.weeks}</span> : null}
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
          axis,
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
