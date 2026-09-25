import type { CalendarEvent, Todo } from '../types'
import { jsWeekday } from './periods'

/** Whether a calendar event (incl. repeat rules) falls on this ISO date. */
export function eventMatchesDate(event: CalendarEvent, iso: string): boolean {
  const repeat = event.repeat ?? 'none'
  if (repeat === 'none') return event.date === iso

  const [ey, em, ed] = event.date.split('-').map(Number)
  const [ty, tm, td] = iso.split('-').map(Number)
  const eventDay = new Date(ey, em - 1, ed)
  const targetDay = new Date(ty, tm - 1, td)

  switch (repeat) {
    case 'daily':
      return iso >= event.date
    case 'weekly':
      if (iso < event.date) return false
      return jsWeekday(targetDay) === jsWeekday(eventDay)
    case 'monthly':
      if (td !== ed) return false
      return iso >= event.date
    case 'yearly':
      return tm === em && td === ed && ty >= ey
    default:
      return event.date === iso
  }
}

export function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return '全天'
  if (event.startTime && event.endTime) return `${event.startTime}-${event.endTime}`
  if (event.startTime) return event.startTime
  return ''
}

export function formatTodoTimeRange(t: Todo): string {
  if (!t.dueTime) return ''
  if (t.dueEndTime) return `${t.dueTime}-${t.dueEndTime}`
  return t.dueTime
}

export function compareByStartTime(
  a: { startTime?: string; allDay?: boolean; createdAt?: number; id?: string },
  b: { startTime?: string; allDay?: boolean; createdAt?: number; id?: string },
): number {
  if (a.allDay && !b.allDay) return -1
  if (!a.allDay && b.allDay) return 1
  const sa = a.startTime ?? '99:99'
  const sb = b.startTime ?? '99:99'
  const byTime = sa.localeCompare(sb)
  if (byTime !== 0) return byTime
  const byCreated = (a.createdAt ?? 0) - (b.createdAt ?? 0)
  if (byCreated !== 0) return byCreated
  return (a.id ?? '').localeCompare(b.id ?? '')
}

/** 只按 id 去重。同一天、同一标题、同一时间都可以各存一条。 */
export function insertCalendarEvent(events: CalendarEvent[], event: CalendarEvent): CalendarEvent[] {
  if (!event.title.trim() || !event.date || events.some((item) => item.id === event.id)) return events
  return [...events, event]
}

export function replaceCalendarEvent(events: CalendarEvent[], event: CalendarEvent, now = Date.now()): CalendarEvent[] {
  return events.map((item) => (item.id === event.id ? { ...item, ...event, id: item.id, updatedAt: now, revision: (item.revision ?? 1) + 1 } : item))
}

export function removeCalendarEventById(events: CalendarEvent[], id: string): CalendarEvent[] {
  return events.filter((item) => item.id !== id)
}
