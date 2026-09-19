import { describe, expect, it } from 'vitest'
import type { RecurrenceRule, RecurringReminder } from '../types'
import { parseISODate } from './dates'
import { parseImport } from './store'
import {
  addCalendarMonths,
  addCalendarYears,
  formatRecurrenceRule,
  nextRecurrenceDate,
  occurrencesInRange,
  occursOn,
  upcomingRecurring,
} from './recurrence'

const on = (iso: string) => parseISODate(iso)

function reminder(partial: Partial<RecurringReminder> & Pick<RecurringReminder, 'startDate' | 'rule'>): RecurringReminder {
  return {
    id: partial.id ?? 'r1',
    title: partial.title ?? '提醒',
    body: partial.body,
    startDate: partial.startDate,
    remindTime: partial.remindTime,
    rule: partial.rule,
    endDate: partial.endDate,
    neverEnds: partial.neverEnds ?? !partial.endDate,
    enabled: partial.enabled ?? true,
    createdAt: 1,
    updatedAt: 1,
  }
}

const interval = (n: number, unit: RecurrenceRule['unit']): RecurrenceRule => ({
  kind: 'interval',
  interval: n,
  unit,
})

describe('addCalendarMonths / addCalendarYears', () => {
  it('keeps the same day when the next month has that day', () => {
    expect(addCalendarMonths(on('2026-09-20'), 1).toDateString()).toBe(on('2026-10-20').toDateString())
  })

  it('clamps Jan 31 onto Feb 28 in a common year', () => {
    expect(addCalendarMonths(on('2026-01-31'), 1).toDateString()).toBe(on('2026-02-28').toDateString())
  })

  it('clamps Jan 31 onto Feb 29 in a leap year', () => {
    expect(addCalendarMonths(on('2024-01-31'), 1).toDateString()).toBe(on('2024-02-29').toDateString())
  })

  it('does not treat a month as 30 days (Jan 31 + 1 month is not Mar 2)', () => {
    expect(addCalendarMonths(on('2026-01-31'), 1).toDateString()).not.toBe(on('2026-03-02').toDateString())
  })

  it('adds years on the calendar, not 365-day chunks', () => {
    expect(addCalendarYears(on('2024-02-29'), 1).toDateString()).toBe(on('2025-02-28').toDateString())
    expect(addCalendarYears(on('2024-02-29'), 4).toDateString()).toBe(on('2028-02-29').toDateString())
    expect(addCalendarYears(on('2026-09-20'), 1).toDateString()).toBe(on('2027-09-20').toDateString())
  })
})

describe('every N days', () => {
  const item = reminder({ startDate: '2026-09-20', rule: interval(3, 'day') })

  it('hits the start and every 3rd day', () => {
    expect(occursOn(item, '2026-09-20')).toBe(true)
    expect(occursOn(item, '2026-09-23')).toBe(true)
    expect(occursOn(item, '2026-09-26')).toBe(true)
    expect(occursOn(item, '2026-09-21')).toBe(false)
    expect(occursOn(item, '2026-09-19')).toBe(false)
  })

  it('finds the next occurrence from today', () => {
    expect(nextRecurrenceDate(item, on('2026-09-20'))).toBe('2026-09-20')
    expect(nextRecurrenceDate(item, on('2026-09-21'))).toBe('2026-09-23')
    expect(nextRecurrenceDate(item, on('2026-09-23'))).toBe('2026-09-23')
  })
})

describe('every N weeks', () => {
  const item = reminder({ startDate: '2026-09-20', rule: interval(2, 'week') })

  it('repeats on the same weekday every 2 weeks', () => {
    expect(occursOn(item, '2026-09-20')).toBe(true)
    expect(occursOn(item, '2026-10-04')).toBe(true)
    expect(occursOn(item, '2026-09-27')).toBe(false)
    expect(occursOn(item, '2026-09-21')).toBe(false)
  })

  it('computes the next 2-week slot', () => {
    expect(nextRecurrenceDate(item, on('2026-09-21'))).toBe('2026-10-04')
    expect(nextRecurrenceDate(item, on('2026-10-04'))).toBe('2026-10-04')
  })
})

describe('every N months', () => {
  const monthly = reminder({ startDate: '2026-01-31', rule: interval(1, 'month') })
  const everySix = reminder({ startDate: '2026-03-20', rule: interval(6, 'month') })

  it('uses calendar months, clamping 31-day starts', () => {
    expect(occursOn(monthly, '2026-01-31')).toBe(true)
    expect(occursOn(monthly, '2026-02-28')).toBe(true)
    expect(occursOn(monthly, '2026-03-31')).toBe(true)
    expect(occursOn(monthly, '2026-02-03')).toBe(false)
    expect(occursOn(monthly, '2026-03-02')).toBe(false)
  })

  it('supports every 6 months on the same calendar day', () => {
    expect(occursOn(everySix, '2026-03-20')).toBe(true)
    expect(occursOn(everySix, '2026-09-20')).toBe(true)
    expect(occursOn(everySix, '2027-03-20')).toBe(true)
    expect(occursOn(everySix, '2026-09-19')).toBe(false)
  })

  it('computes the next month from mid-cycle', () => {
    expect(nextRecurrenceDate(monthly, on('2026-02-01'))).toBe('2026-02-28')
    expect(nextRecurrenceDate(everySix, on('2026-04-01'))).toBe('2026-09-20')
  })
})

describe('every N years', () => {
  const yearly = reminder({ startDate: '2026-09-20', rule: interval(1, 'year') })
  const decade = reminder({ startDate: '2020-09-20', rule: interval(10, 'year') })

  it('lands on the same month and day each year', () => {
    expect(occursOn(yearly, '2026-09-20')).toBe(true)
    expect(occursOn(yearly, '2027-09-20')).toBe(true)
    expect(occursOn(yearly, '2036-09-20')).toBe(true)
    expect(occursOn(yearly, '2026-09-21')).toBe(false)
    expect(occursOn(yearly, '2027-09-19')).toBe(false)
  })

  it('does not treat a year as 365 days (leap-day start stays in February)', () => {
    const leap = reminder({ startDate: '2024-02-29', rule: interval(1, 'year') })
    expect(occursOn(leap, '2025-02-28')).toBe(true)
    expect(occursOn(leap, '2025-03-01')).toBe(false)
    expect(occursOn(leap, '2028-02-29')).toBe(true)
    expect(nextRecurrenceDate(leap, on('2025-03-01'))).toBe('2026-02-28')
  })

  it('supports a 10-year cycle', () => {
    expect(occursOn(decade, '2020-09-20')).toBe(true)
    expect(occursOn(decade, '2030-09-20')).toBe(true)
    expect(occursOn(decade, '2040-09-20')).toBe(true)
    expect(occursOn(decade, '2026-09-20')).toBe(false)
    expect(nextRecurrenceDate(decade, on('2026-09-20'))).toBe('2030-09-20')
  })
})

describe('end date', () => {
  const item = reminder({
    startDate: '2026-09-20',
    rule: interval(1, 'week'),
    endDate: '2026-10-04',
    neverEnds: false,
  })

  it('includes the end date when it is an occurrence', () => {
    expect(occursOn(item, '2026-09-20')).toBe(true)
    expect(occursOn(item, '2026-09-27')).toBe(true)
    expect(occursOn(item, '2026-10-04')).toBe(true)
    expect(occursOn(item, '2026-10-11')).toBe(false)
  })

  it('stops next-date calculation after the end', () => {
    expect(nextRecurrenceDate(item, on('2026-10-04'))).toBe('2026-10-04')
    expect(nextRecurrenceDate(item, on('2026-10-05'))).toBeNull()
  })
})

describe('pause', () => {
  const item = reminder({
    startDate: '2026-09-20',
    rule: interval(1, 'year'),
    enabled: false,
  })

  it('still belongs on the calendar day so the user can resume it', () => {
    expect(occursOn(item, '2026-09-20')).toBe(true)
    expect(occursOn(item, '2027-09-20')).toBe(true)
  })

  it('still reports the next date; callers skip firing when enabled is false', () => {
    expect(nextRecurrenceDate(item, on('2026-09-21'))).toBe('2027-09-20')
    expect(item.enabled).toBe(false)
  })
})

describe('next occurrence listing', () => {
  it('sorts enabled reminders first, then by next date', () => {
    const paused = reminder({
      id: 'p',
      startDate: '2026-09-20',
      rule: interval(1, 'day'),
      enabled: false,
    })
    const later = reminder({
      id: 'l',
      startDate: '2026-10-01',
      rule: interval(1, 'year'),
    })
    const soon = reminder({
      id: 's',
      startDate: '2026-09-22',
      rule: interval(1, 'year'),
    })
    const rows = upcomingRecurring([paused, later, soon], on('2026-09-21'))
    expect(rows.map((r) => r.item.id)).toEqual(['s', 'l', 'p'])
    expect(rows[0].next).toBe('2026-09-22')
  })

  it('does not materialize decades of rows for a yearly rule', () => {
    const yearly = reminder({ startDate: '1998-09-20', rule: interval(1, 'year') })
    const month = occurrencesInRange(yearly, '2026-09-01', '2026-09-30')
    expect(month).toEqual(['2026-09-20'])
  })
})

describe('reserved future rule kinds', () => {
  it('does not invent dates for term / season / onThisDay yet', () => {
    const term = reminder({ startDate: '2026-09-20', rule: { kind: 'term', termPhase: 'afterStart', offsetDays: 7 } })
    expect(occursOn(term, '2026-09-27')).toBe(false)
    expect(nextRecurrenceDate(term, on('2026-09-20'))).toBeNull()
    expect(formatRecurrenceRule(term.rule)).toContain('尚未启用')
  })
})

describe('legacy localStorage documents', () => {
  it('adds an empty recurringReminders list without dropping old todos', () => {
    const data = parseImport(JSON.stringify({ todos: [{ id: 't1', title: '旧待办', done: false, priority: 'medium', remindMinutes: 0, createdAt: 1 }] }))
    expect(data.todos[0].title).toBe('旧待办')
    expect(data.recurringReminders).toEqual([])
    expect(data.countdowns).toEqual([])
  })
})

describe('formatRecurrenceRule', () => {
  it('writes the examples the product promised', () => {
    expect(formatRecurrenceRule(interval(3, 'day'))).toBe('每 3 天')
    expect(formatRecurrenceRule(interval(2, 'week'))).toBe('每 2 周')
    expect(formatRecurrenceRule(interval(6, 'month'))).toBe('每 6 个月')
    expect(formatRecurrenceRule(interval(1, 'year'))).toBe('每年')
    expect(formatRecurrenceRule(interval(10, 'year'))).toBe('每 10 年')
  })
})
