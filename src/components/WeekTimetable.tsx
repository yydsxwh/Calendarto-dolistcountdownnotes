import { useMemo } from 'react'
import { addClockMinutes, formatDuration } from '../lib/periods'
import {
  HOUR_PX,
  blockStyle,
  dayBounds,
  examsForDay,
  hourMarks,
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
  monday,
  now,
  selectedId,
  onSelectCourse,
  onSelectSlot,
}: {
  courses: Course[]
  exams: Exam[]
  monday: Date
  now: Date
  selectedId?: string
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
}) {
  const days = useMemo(() => weekDays(monday, now), [monday, now])
  const bounds = useMemo(() => dayBounds([...courses, ...exams]), [courses, exams])
  const marks = useMemo(() => hourMarks(bounds.start, bounds.end), [bounds.end, bounds.start])
  const bodyHeight = ((bounds.end - bounds.start) / 60) * HOUR_PX
  const nowTop = nowLineTop(now, bounds.start, bounds.end, HOUR_PX)

  return (
    <div className="week-tt">
      <div className="week-tt-head">
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
          </div>
        ))}
      </div>
      <div className="week-tt-body" style={{ height: bodyHeight }}>
        <div className="week-tt-gutter-col">
          {marks.map((mark, i) =>
            i === marks.length - 1 ? null : (
              <div
                key={mark.minutes}
                className="week-tt-hour"
                style={{ top: ((mark.minutes - bounds.start) / 60) * HOUR_PX }}
              >
                {mark.label}
              </div>
            ),
          )}
        </div>
        {days.map((day) => (
          <DayColumn
            key={day.iso}
            day={day}
            courses={courses.filter((c) => c.weekday === day.weekday)}
            exams={examsForDay(exams, day.iso)}
            dayStart={bounds.start}
            marks={marks}
            nowTop={day.isToday ? nowTop : null}
            selectedId={selectedId}
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
  dayStart,
  marks,
  nowTop,
  selectedId,
  onSelectCourse,
  onSelectSlot,
}: {
  day: WeekDayColumn
  courses: Course[]
  exams: Exam[]
  dayStart: number
  marks: { minutes: number; label: string }[]
  nowTop: number | null
  selectedId?: string
  onSelectCourse: (course: Course) => void
  onSelectSlot: (next: { weekday: number; startTime: string; endTime: string }) => void
}) {
  const laid = useMemo(
    () => layoutDayCourses(courses, dayStart, HOUR_PX),
    [courses, dayStart],
  )

  return (
    <div
      className={`week-tt-day ${day.isToday ? 'is-today' : ''} ${day.isWeekend ? 'is-weekend' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement
        if (target.closest('.week-tt-course, .week-tt-exam')) return
        const rect = event.currentTarget.getBoundingClientRect()
        const slot = slotFromOffset(event.clientY - rect.top, dayStart, HOUR_PX)
        onSelectSlot({ weekday: day.weekday, ...slot })
      }}
    >
      {marks.slice(0, -1).map((mark) => (
        <div
          key={mark.minutes}
          className="week-tt-line"
          style={{ top: ((mark.minutes - dayStart) / 60) * HOUR_PX }}
        />
      ))}
      {laid.map((item) => (
        <button
          key={item.course.id}
          type="button"
          className={`week-tt-course ${selectedId === item.course.id ? 'is-selected' : ''}`}
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
          dayStart,
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
