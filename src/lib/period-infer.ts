import { DEFAULT_PERIODS, addClockMinutes, durationMinutes, minutesOf, type ClassPeriod } from './periods'

/** Build a period table from real class clocks so 第N节 follows this school, not a fixed 08:00. */
export function inferClassPeriods(
  courses: { startTime: string; endTime: string }[],
): ClassPeriod[] {
  const unique = new Map<string, ClassPeriod>()
  for (const course of courses) {
    const dur = durationMinutes(course.startTime, course.endTime)
    if (dur <= 0) continue
    if (dur >= 80 && dur <= 120) {
      const firstEnd = addClockMinutes(course.startTime, Math.min(45, Math.floor(dur / 2)))
      const gap = dur >= 95 ? 10 : 5
      const secondStart = addClockMinutes(firstEnd, gap)
      if (minutesOf(secondStart) < minutesOf(course.endTime)) {
        unique.set(`${course.startTime}-${firstEnd}`, { start: course.startTime, end: firstEnd })
        unique.set(`${secondStart}-${course.endTime}`, { start: secondStart, end: course.endTime })
        continue
      }
    }
    unique.set(`${course.startTime}-${course.endTime}`, { start: course.startTime, end: course.endTime })
  }
  const periods = [...unique.values()].sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
  return periods.length ? periods : DEFAULT_PERIODS.map((p) => ({ ...p }))
}

/** Hide unused hours before the first class and after the last one (dawn / late night). */
export function hiddenHoursAroundCourses(
  courses: { startTime: string; endTime: string }[],
): number[] {
  if (courses.length === 0) return [0, 1, 2, 3, 4, 5]
  let first = 23
  let last = 0
  for (const course of courses) {
    first = Math.min(first, Math.floor(minutesOf(course.startTime) / 60))
    last = Math.max(last, Math.min(23, Math.ceil(minutesOf(course.endTime) / 60) - 1))
  }
  const hide: number[] = []
  for (let hour = 0; hour < 24; hour += 1) {
    if (hour < first || hour > last) hide.push(hour)
  }
  return hide.length === 24 ? [0, 1, 2, 3, 4, 5] : hide
}
