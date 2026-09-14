/** Shared Calendar Core
 * Domain-first calendar infrastructure for Days and future products such as Yuetuo.
 * UI should call these pure helpers instead of owning calendar business rules.
 */
export type CalendarPriority = 'critical' | 'high' | 'normal' | 'low'
export type CalendarItemKind = 'event' | 'task' | 'day-plan' | 'course' | 'exam'
export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface CalendarReminder {
  id: string
  minutesBefore: number
  enabled: boolean
  priority: CalendarPriority
}

export interface CalendarRecurrence {
  frequency: RecurrenceFrequency
  interval: number
  count?: number
  until?: string
  weekdays?: number[]
}

export interface CalendarItem {
  id: string
  kind: CalendarItemKind
  title: string
  start: string
  end?: string
  allDay?: boolean
  timezone?: string
  location?: string
  notes?: string
  priority: CalendarPriority
  completed?: boolean
  reminders: CalendarReminder[]
  recurrence?: CalendarRecurrence
  category?: string
  color?: string
  sourceApp?: string
  sourceId?: string
  createdAt: number
  updatedAt: number
}

export interface CalendarQuery { start?: string; end?: string; kinds?: CalendarItemKind[]; completed?: boolean; sourceApp?: string }

export function createCalendarItem(input: Omit<CalendarItem, 'createdAt'|'updatedAt'>): CalendarItem {
  const now = Date.now()
  return { ...input, createdAt: now, updatedAt: now }
}

export function updateCalendarItem(item: CalendarItem, patch: Partial<Omit<CalendarItem, 'id'|'createdAt'>>): CalendarItem {
  return { ...item, ...patch, updatedAt: Date.now() }
}

export function reminderPriorityLabel(priority: CalendarPriority): string {
  return ({ critical: '紧急', high: '重要', normal: '普通', low: '低' })[priority]
}

export function recurrenceLabel(rule?: CalendarRecurrence): string {
  if (!rule || rule.frequency === 'none') return '不重复'
  const n = Math.max(1, rule.interval)
  const unit = ({daily:'天', weekly:'周', monthly:'月', yearly:'年'})[rule.frequency]
  return n === 1 ? `每${unit}` : `每${n}${unit}`
}

export function overlaps(a: CalendarItem, b: CalendarItem): boolean {
  const as = new Date(a.start).getTime(), ae = new Date(a.end || a.start).getTime()
  const bs = new Date(b.start).getTime(), be = new Date(b.end || b.start).getTime()
  return as < be && bs < ae
}

export function queryCalendar(items: CalendarItem[], query: CalendarQuery = {}): CalendarItem[] {
  const start = query.start ? new Date(query.start).getTime() : -Infinity
  const end = query.end ? new Date(query.end).getTime() : Infinity
  return items.filter(item => {
    const t = new Date(item.start).getTime()
    if (t < start || t > end) return false
    if (query.kinds && !query.kinds.includes(item.kind)) return false
    if (query.completed !== undefined && Boolean(item.completed) !== query.completed) return false
    if (query.sourceApp && item.sourceApp !== query.sourceApp) return false
    return true
  })
}

export interface CalendarProvider {
  list(query?: CalendarQuery): Promise<CalendarItem[]>
  create(item: Omit<CalendarItem, 'createdAt'|'updatedAt'>): Promise<CalendarItem>
  update(id: string, patch: Partial<CalendarItem>): Promise<CalendarItem>
  remove(id: string): Promise<void>
}
