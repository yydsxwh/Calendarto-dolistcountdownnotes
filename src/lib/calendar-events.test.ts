import { describe, expect, it } from 'vitest'
import { compareByStartTime, insertCalendarEvent, removeCalendarEventById, replaceCalendarEvent } from './calendar-events'
import { createCalendarEvent, parseImport } from './store'
import type { CalendarEvent } from '../types'

function event(partial: Partial<CalendarEvent> & { id: string; title: string }): CalendarEvent {
  return createCalendarEvent(partial.title, { ...partial, id: partial.id, date: partial.date ?? '2026-09-25' })
}

describe('同一天多条日程', () => {
  it('连续创建 5 条都保留，相同标题和时间也不会覆盖', () => {
    let events: CalendarEvent[] = []
    for (let i = 1; i <= 5; i += 1) events = insertCalendarEvent(events, event({ id: `e${i}`, title: `事项 ${i}`, startTime: '09:00', createdAt: i }))
    events = insertCalendarEvent(events, event({ id: 'dup-a', title: '重复标题', startTime: '09:00', createdAt: 6 }))
    events = insertCalendarEvent(events, event({ id: 'dup-b', title: '重复标题', startTime: '09:00', createdAt: 7 }))
    events = insertCalendarEvent(events, event({ id: 'dup-a', title: '重复标题', startTime: '09:00', createdAt: 8 }))
    expect(events).toHaveLength(7)
    expect(events.filter((item) => item.title === '重复标题')).toHaveLength(2)
  })

  it('只改一条、只删一条，并把一条挪到另一天', () => {
    let events = ['a', 'b', 'c', 'd', 'e'].map((id, index) => event({ id, title: id, startTime: '10:00', createdAt: index + 1 }))
    events = replaceCalendarEvent(events, { ...events[1], title: '改过的 b', note: '说明' }, 100)
    expect(events.find((item) => item.id === 'b')?.title).toBe('改过的 b')
    expect(events.find((item) => item.id === 'b')?.revision).toBe(2)
    expect(events.filter((item) => item.title === 'a' || item.title === 'c')).toHaveLength(2)
    events = removeCalendarEventById(events, 'c')
    expect(events.map((item) => item.id)).toEqual(['a', 'b', 'd', 'e'])
    events = replaceCalendarEvent(events, { ...events[0], date: '2026-09-26' }, 200)
    expect(events.find((item) => item.id === 'a')?.date).toBe('2026-09-26')
    expect(events.filter((item) => item.date === '2026-09-25')).toHaveLength(3)
  })

  it('排序是全天、开始时间、创建顺序', () => {
    const rows = [
      event({ id: 'late', title: '晚', startTime: '18:00', createdAt: 1 }),
      event({ id: 'all', title: '全天', allDay: true, createdAt: 9 }),
      event({ id: 'early-b', title: '早二', startTime: '08:00', createdAt: 3 }),
      event({ id: 'early-a', title: '早一', startTime: '08:00', createdAt: 2 }),
    ].sort(compareByStartTime)
    expect(rows.map((item) => item.id)).toEqual(['all', 'early-a', 'early-b', 'late'])
  })

  it('旧数据没有 updatedAt 时补上，不丢标题', () => {
    const data = parseImport(JSON.stringify({ calendarEvents: [{ id: 'old', title: '旧日程', date: '2026-01-01', allDay: true, color: '#2563eb', priority: 'medium', remindMinutes: 15, createdAt: 9 }] }))
    expect(data.calendarEvents[0]).toMatchObject({ id: 'old', title: '旧日程', updatedAt: 9, revision: 1 })
  })
})
