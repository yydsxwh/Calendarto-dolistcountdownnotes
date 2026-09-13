import { addDays, parseISODate, startOfDay, toISODate } from './dates'
import { clockFromMinutes, minutesOf, WEEKDAY_LABELS } from './periods'
import type { Course, Exam } from '../types'

export const FULL_DAY_START_MIN = 0
export const FULL_DAY_END_MIN = 24 * 60
export const DEFAULT_DAY_START_MIN = 0
export const DEFAULT_DAY_END_MIN = 24 * 60
export const HOUR_PX = 56
export const DEFAULT_HIDDEN_HOURS = [0, 1, 2, 3, 4, 5]

export type LaidOutCourse = {
  course: Course
  col: number
  cols: number
  top: number
  height: number
}

export type WeekDayColumn = {
  weekday: number
  label: string
  date: Date
  iso: string
  isToday: boolean
  isWeekend: boolean
}

export function mondayOf(date: Date): Date {
  return startOfWeek(date, 1)
}

export function startOfWeek(date: Date, weekStartsOn: 1 | 7 = 1): Date {
  const d = startOfDay(date)
  if (weekStartsOn === 7) {
    d.setDate(d.getDate() - d.getDay())
    return d
  }
  const js = d.getDay()
  const weekday = js === 0 ? 7 : js
  d.setDate(d.getDate() - (weekday - 1))
  return d
}

export function weekdayOrder(weekStartsOn: 1 | 7 = 1): number[] {
  return weekStartsOn === 7 ? [7, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 7]
}

export function weekDays(
  weekStart: Date,
  today = startOfDay(new Date()),
  weekStartsOn: 1 | 7 = 1,
  hiddenWeekdays: number[] = [],
): WeekDayColumn[] {
  const todayIso = toISODate(today)
  const hidden = new Set(hiddenWeekdays)
  return weekdayOrder(weekStartsOn)
    .filter((weekday) => !hidden.has(weekday))
    .map((weekday) => {
      const offset = weekStartsOn === 7 ? (weekday === 7 ? 0 : weekday) : weekday - 1
      const date = addDays(weekStart, offset)
      return {
        weekday,
        label: WEEKDAY_LABELS[weekday - 1],
        date,
        iso: toISODate(date),
        isToday: toISODate(date) === todayIso,
        isWeekend: weekday >= 6,
      }
    })
}

export function shiftWeek(weekStart: Date, weeks: number): Date {
  return addDays(weekStart, weeks * 7)
}

export function teachingWeekNumber(
  weekStart: Date,
  termStart?: string,
  weekStartsOn: 1 | 7 = 1,
): number | null {
  if (!termStart) return null
  const start = startOfWeek(parseISODate(termStart), weekStartsOn)
  const view = startOfWeek(weekStart, weekStartsOn)
  const diffDays = Math.round((view.getTime() - start.getTime()) / 86400000)
  return Math.floor(diffDays / 7) + 1
}

export function weekStartForTeachingWeek(
  termStart: string,
  week: number,
  weekStartsOn: 1 | 7 = 1,
): Date {
  return addDays(startOfWeek(parseISODate(termStart), weekStartsOn), (Math.max(1, week) - 1) * 7)
}

/** 「1-16周」「1,3,5」「单周」「1-16单周」 */
export function parseWeekNumbers(raw?: string): Set<number> | null {
  if (!raw?.trim()) return null
  const text = raw.replace(/\s/g, '')
  const odd = /单/.test(text)
  const even = /双/.test(text)
  const nums = new Set<number>()
  const rest = text.replace(/(\d{1,2})\s*[-~到至—–]\s*(\d{1,2})/g, (_, a, b) => {
    const from = Number(a)
    const to = Number(b)
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    for (let i = lo; i <= hi; i++) nums.add(i)
    return ' '
  })
  for (const part of rest.split(/[,，、;；]/)) {
    const n = part.match(/\d{1,2}/)
    if (n) nums.add(Number(n[0]))
  }
  if (nums.size === 0 && (odd || even)) {
    for (let i = 1; i <= 30; i++) {
      if (odd && i % 2 === 1) nums.add(i)
      if (even && i % 2 === 0) nums.add(i)
    }
  } else if (odd) {
    for (const n of [...nums]) if (n % 2 === 0) nums.delete(n)
  } else if (even) {
    for (const n of [...nums]) if (n % 2 === 1) nums.delete(n)
  }
  return nums.size ? nums : null
}

export function courseInTeachingWeek(course: Course, week: number | null): boolean {
  if (week == null || week < 1) return true
  const spec = parseWeekNumbers(course.weeks)
  if (!spec) return true
  return spec.has(week)
}

export function courseInTerm(course: Course, termId?: string): boolean {
  if (!termId || !course.termId) return true
  return course.termId === termId
}

export function visibleHours(hiddenHours: number[] = []): number[] {
  const hide = new Set(hiddenHours.filter((h) => h >= 0 && h <= 23))
  const hours = []
  for (let h = 0; h < 24; h++) {
    if (!hide.has(h)) hours.push(h)
  }
  return hours.length ? hours : [8]
}

export type HiddenHourRun = { start: number; end: number }

/** Contiguous hidden hour blocks, used to draw “展开” arrows. */
export function hiddenHourRuns(hiddenHours: number[] = []): HiddenHourRun[] {
  const hide = new Set(hiddenHours.filter((h) => h >= 0 && h <= 23))
  const runs: HiddenHourRun[] = []
  let hour = 0
  while (hour <= 23) {
    if (!hide.has(hour)) {
      hour += 1
      continue
    }
    const start = hour
    while (hour <= 23 && hide.has(hour)) hour += 1
    runs.push({ start, end: hour - 1 })
  }
  return runs
}

export function hoursInRun(run: HiddenHourRun): number[] {
  const hours: number[] = []
  for (let hour = run.start; hour <= run.end; hour += 1) hours.push(hour)
  return hours
}

export function hiddenHourRunLabel(run: HiddenHourRun): string {
  if (run.start === 0 && run.end >= 4 && run.end <= 6) return '凌晨'
  if (run.start === run.end) return `${String(run.start).padStart(2, '0')}时`
  return `${String(run.start).padStart(2, '0')}–${String(run.end).padStart(2, '0')}时`
}

/** Y position of an expand chip: top of the gap, or just after the last visible hour. */
export function hiddenHourRunTop(run: HiddenHourRun, hiddenHours: number[], hourPx: number): number {
  const hours = visibleHours(hiddenHours)
  const before = hours.filter((hour) => hour < run.start)
  if (before.length === 0) return 0
  return before.length * hourPx
}

export function hourMarksFromHidden(hiddenHours: number[] = []): { hour: number; minutes: number; label: string }[] {
  return visibleHours(hiddenHours).map((hour) => ({
    hour,
    minutes: hour * 60,
    label: hour === 0 ? '00:00' : clockFromMinutes(hour * 60),
  }))
}

export type TimeAxisMark = {
  minutes: number
  label: string
  kind: 'event' | 'hour'
}

/** Left gutter is a timeline: labels follow class start/end, not only :00. */
export type TimeAxis = {
  hiddenHours: number[]
  hourPx: number
  originMin: number
  endMin: number
  marks: TimeAxisMark[]
}

function clockMinutes(raw?: string): number | null {
  if (!raw) return null
  if (raw === '23:59') return FULL_DAY_END_MIN
  const mins = minutesOf(raw)
  return Number.isFinite(mins) ? mins : null
}

function minuteVisible(mins: number, hiddenHours: number[]): boolean {
  if (mins >= FULL_DAY_END_MIN) return !hiddenHours.includes(23)
  const hour = Math.min(23, Math.floor(mins / 60))
  if (mins > 0 && mins % 60 === 0) {
    const prev = mins / 60 - 1
    return !hiddenHours.includes(hour) || (prev >= 0 && !hiddenHours.includes(prev))
  }
  return !hiddenHours.includes(hour)
}

function thinMinutes(values: number[], minGap = 12): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  if (sorted.length <= 1) return sorted
  const kept: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length - 1; i += 1) {
    if (sorted[i] - kept[kept.length - 1] >= minGap) kept.push(sorted[i])
  }
  const last = sorted[sorted.length - 1]
  if (last - kept[kept.length - 1] < minGap && kept.length > 1) kept[kept.length - 1] = last
  else if (last !== kept[kept.length - 1]) kept.push(last)
  return kept
}

export function buildTimeAxis(input: {
  hiddenHours?: number[]
  hourPx?: number
  courses?: { startTime: string; endTime: string }[]
  exams?: { startTime: string; endTime?: string }[]
}): TimeAxis {
  const hiddenHours = input.hiddenHours || []
  const hourPx = input.hourPx ?? HOUR_PX
  const hours = visibleHours(hiddenHours)
  const fallbackOrigin = hours[0] * 60
  const fallbackEnd = Math.min(FULL_DAY_END_MIN, hours[hours.length - 1] * 60 + 60)

  const eventMins: number[] = []
  for (const course of input.courses || []) {
    const start = clockMinutes(course.startTime)
    const end = clockMinutes(course.endTime)
    if (start != null) eventMins.push(start)
    if (end != null) eventMins.push(end)
  }
  for (const exam of input.exams || []) {
    const start = clockMinutes(exam.startTime)
    const end = clockMinutes(exam.endTime || exam.startTime)
    if (start != null) eventMins.push(start)
    if (end != null) eventMins.push(end)
  }
  const visibleEvents = eventMins.filter((mins) => mins >= 0 && mins <= FULL_DAY_END_MIN && minuteVisible(mins, hiddenHours))

  if (visibleEvents.length === 0) {
    return {
      hiddenHours,
      hourPx,
      originMin: fallbackOrigin,
      endMin: fallbackEnd,
      marks: hourMarksFromHidden(hiddenHours).map((mark) => ({
        minutes: mark.minutes,
        label: mark.label,
        kind: 'hour',
      })),
    }
  }

  const originMin = Math.min(...visibleEvents)
  const endMin = Math.max(...visibleEvents)
  const eventSet = new Set(thinMinutes(visibleEvents, 12))
  const marks: TimeAxisMark[] = [...eventSet].map((minutes) => ({
    minutes,
    label: minutes >= FULL_DAY_END_MIN ? '23:59' : clockFromMinutes(minutes),
    kind: 'event',
  }))
  for (const hour of hours) {
    const minutes = hour * 60
    if (minutes < originMin || minutes > endMin) continue
    if ([...eventSet].some((event) => Math.abs(event - minutes) < 20)) continue
    marks.push({ minutes, label: clockFromMinutes(minutes), kind: 'hour' })
  }
  marks.sort((a, b) => a.minutes - b.minutes)
  return { hiddenHours, hourPx, originMin, endMin, marks }
}

export function axisOffset(mins: number, axis: TimeAxis): number {
  return (
    visibleOffset(mins, axis.hiddenHours, axis.hourPx) - visibleOffset(axis.originMin, axis.hiddenHours, axis.hourPx)
  )
}

export function axisHeight(axis: TimeAxis): number {
  return Math.max(axis.hourPx / 2, axisOffset(axis.endMin, axis))
}

export function axisRunTop(run: HiddenHourRun, axis: TimeAxis): number {
  return hiddenHourRunTop(run, axis.hiddenHours, axis.hourPx) - visibleOffset(axis.originMin, axis.hiddenHours, axis.hourPx)
}

export function minutesFromAxisOffset(offsetY: number, axis: TimeAxis): number {
  const target = offsetY + visibleOffset(axis.originMin, axis.hiddenHours, axis.hourPx)
  const hours = visibleHours(axis.hiddenHours)
  let y = 0
  for (const hour of hours) {
    if (target <= y + axis.hourPx) {
      const within = Math.max(0, target - y)
      return hour * 60 + (within / axis.hourPx) * 60
    }
    y += axis.hourPx
  }
  return Math.min(FULL_DAY_END_MIN, hours[hours.length - 1] * 60 + 60)
}

export function visibleOffset(mins: number, hiddenHours: number[], hourPx: number): number {
  const hours = visibleHours(hiddenHours)
  let y = 0
  for (const hour of hours) {
    const start = hour * 60
    const end = start + 60
    if (mins <= start) return y
    if (mins < end) return y + ((mins - start) / 60) * hourPx
    y += hourPx
  }
  return y
}

export function gridHeight(hiddenHours: number[], hourPx: number): number {
  return visibleHours(hiddenHours).length * hourPx
}

export function dayBounds(): { start: number; end: number } {
  return { start: FULL_DAY_START_MIN, end: FULL_DAY_END_MIN }
}

export function hourMarks(start: number, end: number): { minutes: number; label: string }[] {
  const marks: { minutes: number; label: string }[] = []
  for (let m = start; m < end; m += 60) {
    marks.push({ minutes: m, label: clockFromMinutes(m) })
  }
  if (end === FULL_DAY_END_MIN) marks.push({ minutes: end, label: '23:59' })
  else marks.push({ minutes: end, label: clockFromMinutes(end) })
  return marks
}

export function snapMinutes(total: number, step = 30): number {
  return Math.round(total / step) * step
}

export function slotFromOffset(
  offsetY: number,
  hiddenHours: number[],
  hourPx: number,
  duration = 90,
  axis?: TimeAxis,
): { startTime: string; endTime: string } {
  const raw = axis ? minutesFromAxisOffset(offsetY, axis) : (() => {
    const hours = visibleHours(hiddenHours)
    let y = 0
    for (const hour of hours) {
      if (offsetY <= y + hourPx) {
        const within = Math.max(0, offsetY - y)
        return hour * 60 + (within / hourPx) * 60
      }
      y += hourPx
    }
    return hours[hours.length - 1] * 60
  })()
  const step = axis && axis.marks.some((mark) => mark.kind === 'event') ? 5 : 30
  const start = Math.max(0, Math.min(FULL_DAY_END_MIN - 15, snapMinutes(raw, step)))
  const end = Math.min(FULL_DAY_END_MIN, start + duration)
  return { startTime: clockFromMinutes(start), endTime: end === FULL_DAY_END_MIN ? '23:59' : clockFromMinutes(end) }
}

export function nowLineTop(now: Date, hiddenHours: number[], hourPx: number, axis?: TimeAxis): number | null {
  const mins = now.getHours() * 60 + now.getMinutes()
  if (hiddenHours.includes(now.getHours())) return null
  if (axis) {
    if (mins < axis.originMin || mins > axis.endMin) return null
    return axisOffset(mins, axis)
  }
  return visibleOffset(mins, hiddenHours, hourPx)
}

export function layoutDayCourses(
  courses: Course[],
  hiddenHours: number[],
  hourPx: number,
  axis?: TimeAxis,
): LaidOutCourse[] {
  const items = courses
    .map((course) => ({
      course,
      start: minutesOf(course.startTime),
      end: course.endTime === '23:59' ? FULL_DAY_END_MIN : minutesOf(course.endTime),
    }))
    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const clusters: typeof items[] = []
  let cluster: typeof items = []
  let clusterEnd = -1
  for (const item of items) {
    if (cluster.length > 0 && item.start >= clusterEnd) {
      clusters.push(cluster)
      cluster = [item]
      clusterEnd = item.end
    } else {
      cluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.end)
    }
  }
  if (cluster.length) clusters.push(cluster)

  const result: LaidOutCourse[] = []
  for (const group of clusters) {
    const columns: number[] = []
    const assigned: { item: (typeof items)[number]; col: number }[] = []
    for (const item of group) {
      let col = columns.findIndex((end) => end <= item.start)
      if (col < 0) {
        col = columns.length
        columns.push(item.end)
      } else {
        columns[col] = item.end
      }
      assigned.push({ item, col })
    }
    const cols = Math.max(1, columns.length)
    for (const { item, col } of assigned) {
      const top = axis ? axisOffset(item.start, axis) : visibleOffset(item.start, hiddenHours, hourPx)
      const bottom = axis ? axisOffset(item.end, axis) : visibleOffset(item.end, hiddenHours, hourPx)
      const height = bottom - top
      if (height < 8) continue
      result.push({
        course: item.course,
        col,
        cols,
        top,
        height: Math.max(28, height - 3),
      })
    }
  }
  return result
}

export function examsForDay(exams: Exam[], iso: string): Exam[] {
  return exams.filter((exam) => exam.date === iso)
}

export function blockStyle(item: LaidOutCourse): { top: string; height: string; left: string; width: string } {
  const gap = 3
  const width = `calc((100% - ${(item.cols + 1) * gap}px) / ${item.cols})`
  const left = `calc(${gap}px + ${item.col} * ((100% - ${(item.cols + 1) * gap}px) / ${item.cols} + ${gap}px))`
  return {
    top: `${item.top}px`,
    height: `${item.height}px`,
    left,
    width,
  }
}

export function weekRangeLabel(weekStart: Date, dayCount = 7): string {
  const last = addDays(weekStart, Math.max(0, dayCount - 1))
  return `${weekStart.getMonth() + 1}月${weekStart.getDate()}日 – ${last.getMonth() + 1}月${last.getDate()}日`
}

export { WEEKDAY_LABELS }
