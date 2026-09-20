/**
 * 现有功能回归基线 —— 提醒引擎
 *
 * 覆盖目前会产生提醒的全部五类：课程 / 考试 / 待办 / 自我管理 / 日历事件。
 * 同时钉住两个已知局限，作为将来做持久化 Reminder 时的对照：
 * 触发窗口只有 90 秒，以及提醒只在页面打开时轮询。
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { collectDueReminders, takeUnfired, upcomingClasses, upcomingExams, upcomingReminderSlots } from './reminders'
import { createCalendarEvent, createCourse, createExam, createSelfSchedule, createTodo } from './store'
import { defaultReminderSettings } from '../types'

// 2026-09-21 是星期一，用它做所有「星期几」断言的锚点。
const MONDAY_0745 = new Date(2026, 8, 21, 7, 45, 0)

function installLocalStorage(): void {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(MONDAY_0745)
  installLocalStorage()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const settings = defaultReminderSettings()

describe('总开关', () => {
  test('关闭提醒后一条都不产生', () => {
    const course = createCourse('高数', { weekday: 1, startTime: '08:00', remindMinutes: 15 })
    const off = { ...settings, enabled: false }
    expect(collectDueReminders([course], [], off, Date.now())).toEqual([])
    expect(upcomingReminderSlots([course], [], off, Date.now())).toEqual([])
  })
})

describe('上课提醒', () => {
  test('周一 08:00 的课，提前 15 分钟在 07:45 触发', () => {
    const course = createCourse('高等数学', { weekday: 1, startTime: '08:00', endTime: '09:40', remindMinutes: 15 })
    const due = collectDueReminders([course], [], settings, Date.now())

    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('class')
    expect(due[0].title).toContain('高等数学')
    expect(due[0].body).toContain('08:00-09:40')
  })

  test('remindMinutes 为 0 表示不提醒', () => {
    const course = createCourse('高数', { weekday: 1, startTime: '08:00', remindMinutes: 0 })
    expect(collectDueReminders([course], [], settings, Date.now())).toEqual([])
  })

  test('别的星期的课现在不该响', () => {
    const course = createCourse('高数', { weekday: 4, startTime: '08:00', remindMinutes: 15 })
    expect(collectDueReminders([course], [], settings, Date.now())).toEqual([])
  })

  test('已知局限：触发窗口只有 90 秒，错过就不补发', () => {
    const course = createCourse('高数', { weekday: 1, startTime: '08:00', remindMinutes: 15 })
    // 07:45 命中
    expect(collectDueReminders([course], [], settings, Date.now())).toHaveLength(1)
    // 07:47 已经错过
    expect(collectDueReminders([course], [], settings, Date.now() + 120_000)).toHaveLength(0)
  })
})

describe('考试提醒', () => {
  test('提前一天的默认提醒会在正确时刻触发', () => {
    const exam = createExam('高等数学', { date: '2026-09-22', startTime: '07:45', remindMinutes: 1440 })
    const due = collectDueReminders([], [exam], { ...settings, examAlsoHourBefore: false }, Date.now())

    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('exam')
    expect(due[0].body).toContain('1 天后')
  })

  test('examAlsoHourBefore 会额外排一条提前 1 小时的提醒', () => {
    // 考试要排得够远，否则「提前一天」那条本身已经是过去时间。
    const exam = createExam('大学英语', { date: '2026-09-25', startTime: '14:00', remindMinutes: 1440 })
    const slots = upcomingReminderSlots([], [exam], settings, Date.now())
    expect(slots.filter((slot) => slot.kind === 'exam')).toHaveLength(2)
  })

  test('关掉 examAlsoHourBefore 就只剩一条', () => {
    const exam = createExam('大学英语', { date: '2026-09-25', startTime: '14:00', remindMinutes: 1440 })
    const slots = upcomingReminderSlots([], [exam], { ...settings, examAlsoHourBefore: false }, Date.now())
    expect(slots.filter((slot) => slot.kind === 'exam')).toHaveLength(1)
  })

  test('已经过去的提醒时刻不会再排进未来队列', () => {
    // 6 小时后开考，「提前一天」早就过去了，只应剩下提前 1 小时那条。
    const exam = createExam('大学英语', { date: '2026-09-21', startTime: '14:00', remindMinutes: 1440 })
    const slots = upcomingReminderSlots([], [exam], settings, Date.now())
    expect(slots.filter((slot) => slot.kind === 'exam')).toHaveLength(1)
  })
})

describe('待办提醒', () => {
  test('只有同时填了日期和时间才会提醒', () => {
    const withTime = createTodo('交报告', { dueDate: '2026-09-21', dueTime: '08:00', remindMinutes: 15 })
    const dateOnly = createTodo('看书', { dueDate: '2026-09-21', remindMinutes: 15 })

    expect(collectDueReminders([], [], settings, Date.now(), [withTime])).toHaveLength(1)
    expect(collectDueReminders([], [], settings, Date.now(), [dateOnly])).toHaveLength(0)
  })

  test('已完成的待办不再提醒', () => {
    const done = { ...createTodo('交报告', { dueDate: '2026-09-21', dueTime: '08:00', remindMinutes: 15 }), done: true }
    expect(collectDueReminders([], [], settings, Date.now(), [done])).toHaveLength(0)
  })

  test('提醒正文里带上优先级', () => {
    const todo = createTodo('交报告', {
      dueDate: '2026-09-21',
      dueTime: '08:00',
      remindMinutes: 15,
      priority: 'high',
    })
    expect(collectDueReminders([], [], settings, Date.now(), [todo])[0].body).toContain('高优先级')
  })
})

describe('自我管理提醒', () => {
  test('周一 08:00 的安排提前 15 分钟触发', () => {
    const item = createSelfSchedule('晨跑', { weekday: 1, startTime: '08:00', endTime: '09:00', remindMinutes: 15 })
    const due = collectDueReminders([], [], settings, Date.now(), [], [item])

    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('self')
    expect(due[0].title).toContain('晨跑')
  })
})

describe('日历事件提醒（有模型、暂无 UI）', () => {
  test('不重复的事件会提醒', () => {
    const event = createCalendarEvent('组会', { date: '2026-09-21', startTime: '08:00', remindMinutes: 15 })
    const due = collectDueReminders([], [], settings, Date.now(), [], [], [event])
    expect(due).toHaveLength(1)
    expect(due[0].kind).toBe('event')
  })

  test('全天事件不产生定时提醒', () => {
    const event = createCalendarEvent('校庆', { date: '2026-09-21', allDay: true, remindMinutes: 15 })
    expect(collectDueReminders([], [], settings, Date.now(), [], [], [event])).toHaveLength(0)
  })

  test('每周重复的事件会排出未来多次 —— 新周期系统必须保住这个行为', () => {
    const event = createCalendarEvent('周会', {
      date: '2026-09-21',
      startTime: '14:00',
      repeat: 'weekly',
      remindMinutes: 15,
    })
    const slots = upcomingReminderSlots([], [], settings, Date.now(), 2, [], [], [event])
    expect(slots.filter((slot) => slot.kind === 'event').length).toBeGreaterThan(1)
  })

  test('四种重复频率都能排出未来提醒', () => {
    for (const repeat of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      const event = createCalendarEvent('例行', {
        date: '2026-09-21',
        startTime: '14:00',
        repeat,
        remindMinutes: 15,
      })
      const slots = upcomingReminderSlots([], [], settings, Date.now(), 2, [], [], [event])
      expect(slots.filter((slot) => slot.kind === 'event').length).toBeGreaterThan(0)
    }
  })
})

describe('去重', () => {
  test('同一条提醒不会连响两次', () => {
    const course = createCourse('高数', { weekday: 1, startTime: '08:00', remindMinutes: 15 })
    const due = collectDueReminders([course], [], settings, Date.now())

    expect(takeUnfired(due)).toHaveLength(1)
    expect(takeUnfired(due)).toHaveLength(0)
  })

  test('去重键带时间戳，下一周同一节课还会响', () => {
    const course = createCourse('高数', { weekday: 1, startTime: '08:00', remindMinutes: 15 })
    const thisWeek = collectDueReminders([course], [], settings, Date.now())
    takeUnfired(thisWeek)

    vi.setSystemTime(new Date(2026, 8, 28, 7, 45, 0))
    const nextWeek = collectDueReminders([course], [], settings, Date.now())
    expect(takeUnfired(nextWeek)).toHaveLength(1)
  })
})

describe('列表辅助函数', () => {
  test('upcomingClasses 只挑当天的课并按时间排序', () => {
    const courses = [
      createCourse('下午课', { weekday: 1, startTime: '14:00' }),
      createCourse('上午课', { weekday: 1, startTime: '08:00' }),
      createCourse('周四课', { weekday: 4, startTime: '08:00' }),
    ]
    expect(upcomingClasses(courses, 1).map((c) => c.name)).toEqual(['上午课', '下午课'])
  })

  test('upcomingExams 过滤掉过去的考试并按日期排序', () => {
    const exams = [
      createExam('明年', { date: '2027-01-08' }),
      createExam('已过', { date: '2026-01-08' }),
      createExam('下月', { date: '2026-10-08' }),
    ]
    expect(upcomingExams(exams, '2026-09-21').map((e) => e.name)).toEqual(['下月', '明年'])
  })

  test('原生排程一次最多 96 条，不会无限堆通知', () => {
    const courses = Array.from({ length: 80 }, (_, index) =>
      createCourse(`课${index}`, { weekday: ((index % 7) + 1), startTime: '08:00', remindMinutes: 15 }),
    )
    expect(upcomingReminderSlots(courses, [], settings, Date.now(), 4).length).toBeLessThanOrEqual(96)
  })
})
