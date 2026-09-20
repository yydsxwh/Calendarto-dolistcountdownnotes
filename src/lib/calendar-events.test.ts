import { describe, expect, it } from 'vitest'
import { eventMatchesDate } from './calendar-events'
import type { CalendarEvent } from '../types'

function ev(partial: Partial<CalendarEvent> & Pick<CalendarEvent, 'date'>): CalendarEvent {
  return {
    id: '1',
    title: 't',
    allDay: false,
    color: '#2563eb',
    priority: 'medium',
    remindMinutes: 15,
    repeat: 'none',
    createdAt: 0,
    startTime: '09:00',
    endTime: '10:00',
    ...partial,
  }
}

describe('eventMatchesDate', () => {
  it('matches single-day events', () => {
    expect(eventMatchesDate(ev({ date: '2026-03-01' }), '2026-03-01')).toBe(true)
    expect(eventMatchesDate(ev({ date: '2026-03-01' }), '2026-03-02')).toBe(false)
  })

  it('matches weekly repeat on same weekday', () => {
    const e = ev({ date: '2026-03-02', repeat: 'weekly' }) // Monday
    expect(eventMatchesDate(e, '2026-03-09')).toBe(true)
    expect(eventMatchesDate(e, '2026-03-10')).toBe(false)
  })

  it('matches yearly repeat', () => {
    const e = ev({ date: '2025-06-15', repeat: 'yearly' })
    expect(eventMatchesDate(e, '2026-06-15')).toBe(true)
    expect(eventMatchesDate(e, '2026-06-16')).toBe(false)
  })
})
