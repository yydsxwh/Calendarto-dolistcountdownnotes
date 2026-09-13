import { createCourse, createExam } from './store'
import {
  courseInTeachingWeek,
  DEFAULT_DAY_END_MIN,
  DEFAULT_DAY_START_MIN,
  gridHeight,
  hourMarks,
  hourMarksFromHidden,
  layoutDayCourses,
  mondayOf,
  parseWeekNumbers,
  slotFromOffset,
  startOfWeek,
  teachingWeekNumber,
  visibleHours,
  visibleOffset,
  weekDays,
} from './week-grid'

const monday = mondayOf(new Date(2026, 8, 16)) // Wed Sep 16 2026 -> Mon Sep 14
if (monday.getFullYear() !== 2026 || monday.getMonth() !== 8 || monday.getDate() !== 14) {
  throw new Error(`mondayOf failed: ${monday.toISOString()}`)
}

const days = weekDays(monday, new Date(2026, 8, 16))
if (days.length !== 7 || days[0].label !== '周一' || days[6].label !== '周日') {
  throw new Error('weekDays should be Mon-Sun')
}
if (days[0].iso !== '2026-09-14' || days[6].iso !== '2026-09-20') {
  throw new Error(`week dates wrong ${days[0].iso} ${days[6].iso}`)
}
if (!days[2].isToday || days[5].isWeekend !== true) {
  throw new Error('today / weekend flags wrong')
}

const sunWeek = weekDays(startOfWeek(new Date(2026, 8, 16), 7), new Date(2026, 8, 16), 7, [])
if (sunWeek[0].label !== '周日' || sunWeek[0].iso !== '2026-09-13') {
  throw new Error(`Sunday-start week failed ${sunWeek[0].iso} ${sunWeek[0].label}`)
}
const noWeekend = weekDays(monday, new Date(2026, 8, 16), 1, [6, 7])
if (noWeekend.length !== 5 || noWeekend.some((d) => d.isWeekend)) {
  throw new Error('hidden weekend columns failed')
}

if (teachingWeekNumber(monday, '2026-09-14') !== 1) {
  throw new Error('term week 1 failed')
}
if (teachingWeekNumber(monday, '2026-08-31') !== 3) {
  throw new Error('term week 3 failed')
}

const range = parseWeekNumbers('1-16周')
if (!range || !range.has(1) || !range.has(16) || range.has(17)) {
  throw new Error('1-16 parse failed')
}
const odd = parseWeekNumbers('1-8单周')
if (!odd || !odd.has(1) || !odd.has(7) || odd.has(2)) {
  throw new Error('odd week parse failed')
}

const math = createCourse('高等数学', {
  weekday: 1,
  startTime: '08:00',
  endTime: '09:40',
  weeks: '1-16周',
})
if (!courseInTeachingWeek(math, 3) || courseInTeachingWeek(math, 18)) {
  throw new Error('course week filter failed')
}

const bounds = { start: DEFAULT_DAY_START_MIN, end: DEFAULT_DAY_END_MIN }
if (bounds.start !== 0 || bounds.end !== 24 * 60) {
  throw new Error('full-day table should be 00:00-23:59')
}
const marks = hourMarks(0, 24 * 60)
if (marks[0].label !== '00:00' || marks.at(-1)?.label !== '23:59') {
  throw new Error(`full-day marks wrong ${marks[0].label} ${marks.at(-1)?.label}`)
}

const hiddenDawn = [0, 1, 2, 3, 4, 5]
if (visibleHours(hiddenDawn)[0] !== 6 || visibleHours(hiddenDawn).length !== 18) {
  throw new Error('dawn hide should leave 06:00-23:00')
}
const shown = hourMarksFromHidden(hiddenDawn)
if (shown[0].label !== '06:00' || shown.at(-1)?.hour !== 23) {
  throw new Error(`hidden-hour marks wrong ${JSON.stringify(shown[0])} ${JSON.stringify(shown.at(-1))}`)
}

const top8 = visibleOffset(8 * 60, hiddenDawn, 56)
if (top8 !== 2 * 56) {
  throw new Error(`08:00 should sit two hours below 06:00, got ${top8}`)
}
if (gridHeight(hiddenDawn, 56) !== 18 * 56) {
  throw new Error('hidden dawn grid height failed')
}

const overlapA = createCourse('A', { weekday: 1, startTime: '08:00', endTime: '09:40' })
const overlapB = createCourse('B', { weekday: 1, startTime: '08:55', endTime: '10:30' })
const laid = layoutDayCourses([overlapA, overlapB], hiddenDawn, 56)
if (laid.length !== 2 || laid[0].cols !== 2 || laid[1].cols !== 2) {
  throw new Error(`overlap should split columns ${JSON.stringify(laid)}`)
}
if (laid[0].top !== top8) {
  throw new Error(`block top wrong ${laid[0].top}`)
}

const later = createCourse('C', { weekday: 1, startTime: '14:00', endTime: '15:40' })
const split = layoutDayCourses([overlapA, later], hiddenDawn, 56)
if (split.some((item) => item.cols !== 1)) {
  throw new Error('non-overlapping classes should not share columns')
}

const slot = slotFromOffset(56 * 2, hiddenDawn, 56, 90)
if (slot.startTime !== '08:00' || slot.endTime !== '09:30') {
  throw new Error(`slot snap failed ${slot.startTime}-${slot.endTime}`)
}

const exam = createExam('期末', { date: '2026-09-16', startTime: '14:00', endTime: '16:00' })
if (exam.date !== days[2].iso) throw new Error('exam should land on Wednesday of this week')

console.log('week-grid selftest ok')
