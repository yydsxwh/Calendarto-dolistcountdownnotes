import type { Course, Exam, ReminderSettings } from '../types'
import { combineDateTime, jsWeekday } from './periods'
import { toISODate } from './dates'

export interface DueReminder {
  id: string
  key: string
  title: string
  body: string
  kind: 'class' | 'exam'
  fireAt: number
}

const FIRED_KEY = 'kemiao-days-fired-reminders'

function loadFired(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function saveFired(map: Record<string, number>) {
  const cutoff = Date.now() - 8 * 86400000
  const next: Record<string, number> = {}
  for (const [k, v] of Object.entries(map)) {
    if (v > cutoff) next[k] = v
  }
  localStorage.setItem(FIRED_KEY, JSON.stringify(next))
}

function nextClassDate(weekday: number, startTime: string): Date {
  const now = new Date()
  const todayWd = jsWeekday(now)
  let add = weekday - todayWd
  if (add < 0) add += 7
  const date = new Date(now)
  date.setDate(now.getDate() + add)
  const start = combineDateTime(toISODate(date), startTime)
  if (start.getTime() <= now.getTime() && add === 0) {
    date.setDate(date.getDate() + 7)
    return combineDateTime(toISODate(date), startTime)
  }
  return start
}

export function collectDueReminders(
  courses: Course[],
  exams: Exam[],
  settings: ReminderSettings,
  now = Date.now(),
): DueReminder[] {
  if (!settings.enabled) return []
  const due: DueReminder[] = []
  const windowMs = 90_000

  for (const course of courses) {
    if (course.remindMinutes <= 0) continue
    const start = nextClassDate(course.weekday, course.startTime)
    const fireAt = start.getTime() - course.remindMinutes * 60_000
    if (now >= fireAt && now <= fireAt + windowMs) {
      due.push({
        id: course.id,
        key: `class:${course.id}:${start.toISOString()}`,
        title: `上课提醒 · ${course.name}`,
        body: `${course.startTime}-${course.endTime} ${course.location || ''}`.trim() +
          ` · 还有 ${course.remindMinutes} 分钟，现在出发以免迟到`,
        kind: 'class',
        fireAt,
      })
    }
  }

  for (const exam of exams) {
    const start = combineDateTime(exam.date, exam.startTime)
    const offsets = [exam.remindMinutes]
    if (settings.examAlsoHourBefore && exam.remindMinutes !== 60) offsets.push(60)
    for (const minutes of offsets) {
      if (minutes <= 0) continue
      const fireAt = start.getTime() - minutes * 60_000
      if (now >= fireAt && now <= fireAt + windowMs) {
        const when =
          minutes >= 1440 ? `${Math.round(minutes / 1440)} 天后` : `${minutes} 分钟后`
        due.push({
          id: exam.id,
          key: `exam:${exam.id}:${minutes}:${exam.date}T${exam.startTime}`,
          title: `考试提醒 · ${exam.name}`,
          body: `${exam.date} ${exam.startTime}${exam.endTime ? `-${exam.endTime}` : ''} ${exam.location || ''} · ${when}开考，请核对时间以免记错错过`,
          kind: 'exam',
          fireAt,
        })
      }
    }
  }

  return due
}

export function takeUnfired(due: DueReminder[]): DueReminder[] {
  const fired = loadFired()
  const fresh = due.filter((item) => !fired[item.key])
  const now = Date.now()
  for (const item of fresh) fired[item.key] = now
  if (fresh.length) saveFired(fired)
  return fresh
}

export function upcomingClasses(courses: Course[], weekday: number): Course[] {
  return courses
    .filter((c) => c.weekday === weekday)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

export function upcomingExams(exams: Exam[], fromISO: string): Exam[] {
  return [...exams]
    .filter((e) => e.date >= fromISO)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
}

/** 给 Android 本地通知预排：未来几节课和考试的提醒时刻。 */
export function upcomingReminderSlots(
  courses: Course[],
  exams: Exam[],
  settings: ReminderSettings,
  now = Date.now(),
  weeksAhead = 2,
): DueReminder[] {
  if (!settings.enabled) return []
  const slots: DueReminder[] = []

  for (const course of courses) {
    if (course.remindMinutes <= 0) continue
    for (let w = 0; w < weeksAhead; w++) {
      const first = nextClassDate(course.weekday, course.startTime)
      const start = new Date(first)
      start.setDate(first.getDate() + w * 7)
      const fireAt = start.getTime() - course.remindMinutes * 60_000
      if (fireAt <= now) continue
      slots.push({
        id: course.id,
        key: `class:${course.id}:${start.toISOString()}`,
        title: `上课提醒 · ${course.name}`,
        body: `${course.startTime}-${course.endTime} ${course.location || ''}`.trim() +
          ` · 还有 ${course.remindMinutes} 分钟，现在出发以免迟到`,
        kind: 'class',
        fireAt,
      })
    }
  }

  for (const exam of exams) {
    const start = combineDateTime(exam.date, exam.startTime)
    const offsets = [exam.remindMinutes]
    if (settings.examAlsoHourBefore && exam.remindMinutes !== 60) offsets.push(60)
    for (const minutes of offsets) {
      if (minutes <= 0) continue
      const fireAt = start.getTime() - minutes * 60_000
      if (fireAt <= now) continue
      const when =
        minutes >= 1440 ? `${Math.round(minutes / 1440)} 天后` : `${minutes} 分钟后`
      slots.push({
        id: exam.id,
        key: `exam:${exam.id}:${minutes}:${exam.date}T${exam.startTime}`,
        title: `考试提醒 · ${exam.name}`,
        body: `${exam.date} ${exam.startTime}${exam.endTime ? `-${exam.endTime}` : ''} ${exam.location || ''} · ${when}开考，请核对时间以免记错错过`,
        kind: 'exam',
        fireAt,
      })
    }
  }

  return slots.sort((a, b) => a.fireAt - b.fireAt).slice(0, 48)
}
