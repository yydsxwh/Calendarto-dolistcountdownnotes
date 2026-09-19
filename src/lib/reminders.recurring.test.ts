import { describe, expect, it } from 'vitest'
import { defaultReminderSettings, type RecurringReminder } from '../types'
import { combineDateTime } from './periods'
import { collectDueReminders } from './reminders'

const settings = defaultReminderSettings()

function item(partial: Partial<RecurringReminder> = {}): RecurringReminder {
  return {
    id: 'r1',
    title: '换季',
    startDate: '2026-09-20',
    remindTime: '09:00',
    rule: { kind: 'interval', interval: 1, unit: 'year' },
    neverEnds: true,
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  }
}

describe('collectDueReminders for recurring', () => {
  const fireAt = combineDateTime('2026-09-20', '09:00').getTime()

  it('fires on the occurrence clock when enabled', () => {
    const due = collectDueReminders([], [], settings, fireAt + 1000, [], [], [], [item()])
    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('recurring')
    expect(due[0].title).toContain('换季')
  })

  it('does not fire when paused', () => {
    const due = collectDueReminders([], [], settings, fireAt + 1000, [], [], [], [item({ enabled: false })])
    expect(due).toHaveLength(0)
  })

  it('does not fire when there is no clock time', () => {
    const due = collectDueReminders([], [], settings, fireAt + 1000, [], [], [], [item({ remindTime: undefined })])
    expect(due).toHaveLength(0)
  })
})
