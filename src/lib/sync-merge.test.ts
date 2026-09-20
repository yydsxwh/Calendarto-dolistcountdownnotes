import { describe, expect, it } from 'vitest'
import { fingerprint, isEmptyData, mergeAppData, mergeById } from './sync-merge'
import { emptyData } from './store'
import type { AppData, Note, Todo } from '../types'

const todo = (id: string, title: string, createdAt = 1): Todo => ({
  id,
  title,
  done: false,
  priority: 'medium',
  remindMinutes: 0,
  createdAt,
})

const note = (id: string, body: string, updatedAt: number): Note => ({
  id,
  title: id,
  body,
  color: '#fef08a',
  pinned: false,
  updatedAt,
})

const withTodos = (todos: Todo[]): AppData => ({ ...emptyData(), todos })

describe('mergeById', () => {
  it('keeps items that only one side has', () => {
    const merged = mergeById([todo('a', 'A')], [todo('b', 'B')])
    expect(merged.map((t) => t.id).sort()).toEqual(['a', 'b'])
  })

  it('prefers the newer edit when both sides have the item', () => {
    const merged = mergeById([note('n', 'old', 10)], [note('n', 'new', 20)])
    expect(merged).toHaveLength(1)
    expect(merged[0].body).toBe('new')
  })

  it('keeps mine when mine is the newer edit', () => {
    const merged = mergeById([note('n', 'mine', 30)], [note('n', 'theirs', 20)])
    expect(merged[0].body).toBe('mine')
  })

  it('never drops an item just because timestamps tie', () => {
    const merged = mergeById([note('n', 'mine', 10)], [note('n', 'theirs', 10)])
    expect(merged).toHaveLength(1)
    expect(merged[0].body).toBe('mine')
  })
})

describe('mergeAppData', () => {
  it('unions both devices rather than letting one overwrite the other', () => {
    const phone = withTodos([todo('a', '买菜')])
    const laptop = withTodos([todo('b', '写周报')])
    const merged = mergeAppData(phone, laptop)
    expect(merged.todos.map((t) => t.title).sort()).toEqual(['买菜', '写周报'])
  })

  it('is the whole point: no user content is ever lost in a conflict', () => {
    const phone: AppData = {
      ...emptyData(),
      todos: [todo('a', '只在手机上')],
      notes: [note('n1', '手机便签', 5)],
    }
    const laptop: AppData = {
      ...emptyData(),
      todos: [todo('b', '只在电脑上')],
      notes: [note('n2', '电脑便签', 5)],
    }
    const merged = mergeAppData(phone, laptop)
    expect(merged.todos).toHaveLength(2)
    expect(merged.notes).toHaveLength(2)
  })

  it('takes settings from the preferred side', () => {
    const mine: AppData = { ...emptyData(), currentTermId: 'mine' }
    const theirs: AppData = { ...emptyData(), currentTermId: 'theirs' }
    expect(mergeAppData(mine, theirs).currentTermId).toBe('mine')
  })

  it('tolerates a remote document missing newer fields', () => {
    const legacy = { todos: [todo('a', '旧备份')] } as unknown as AppData
    const merged = mergeAppData(emptyData(), legacy)
    expect(merged.todos).toHaveLength(1)
    expect(merged.calendarEvents).toEqual([])
    expect(merged.recurringReminders).toEqual([])
    expect(merged.reminderSettings).toBeDefined()
  })
})

describe('isEmptyData', () => {
  it('treats a fresh install as empty so the cloud can fill it', () => {
    expect(isEmptyData(emptyData())).toBe(true)
    expect(isEmptyData(null)).toBe(true)
  })

  it('is not empty once the user has written anything', () => {
    expect(isEmptyData(withTodos([todo('a', 'x')]))).toBe(false)
  })

  it('ignores default settings when deciding emptiness', () => {
    const onlySettings: AppData = { ...emptyData(), currentTermId: 'term-1' }
    expect(isEmptyData(onlySettings)).toBe(true)
  })
})

describe('fingerprint', () => {
  // emptyData() 每次都会新建一个学期 id，所以比较必须基于同一份基线，
  // 就像真实运行时那样（学期 id 存在 localStorage 里，不会每次变）。
  const base = emptyData()
  const sameAs = (todos: Todo[]): AppData => ({ ...base, todos })

  it('is stable for equal content so we do not push in a loop', () => {
    expect(fingerprint(sameAs([todo('a', 'x')]))).toBe(fingerprint(sameAs([todo('a', 'x')])))
  })

  it('changes when the user edits something', () => {
    expect(fingerprint(sameAs([todo('a', 'x')]))).not.toBe(fingerprint(sameAs([todo('a', 'y')])))
  })

  it('ignores nothing the user can see: a new note changes it', () => {
    const withNote: AppData = { ...base, notes: [note('n', 'hi', 1)] }
    expect(fingerprint(withNote)).not.toBe(fingerprint(base))
  })

  it('changes when a recurring reminder is added', () => {
    const withRecurring: AppData = {
      ...base,
      recurringReminders: [
        {
          id: 'r1',
          title: '体检',
          startDate: '2026-09-20',
          rule: { kind: 'interval', interval: 1, unit: 'year' },
          neverEnds: true,
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    expect(fingerprint(withRecurring)).not.toBe(fingerprint(base))
  })
})

describe('recurringReminders migration', () => {
  it('treats only recurring content as non-empty so cloud will not wipe it', () => {
    const onlyRecurring: AppData = {
      ...emptyData(),
      recurringReminders: [
        {
          id: 'r1',
          title: '体检',
          startDate: '2026-09-20',
          rule: { kind: 'interval', interval: 1, unit: 'year' },
          neverEnds: true,
          enabled: true,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    expect(isEmptyData(onlyRecurring)).toBe(false)
  })
})
