/**
 * 现有功能回归基线 —— 数据模型与向后兼容
 *
 * 这些测试的存在目的只有一个：**以后加新功能时，CI 能发现旧功能被弄坏了。**
 *
 * 其中最重要的是 §向后兼容：线上每一位用户的数据都只存在于他自己浏览器的
 * `kemiao-days-v1` 里，我们没有任何服务端备份。`hydrateAppData` 一旦回归，
 * 用户数据就直接读不出来。所以旧格式必须逐个钉死。
 */
import { describe, expect, test } from 'vitest'
import {
  createCalendarEvent,
  createCountdown,
  createCourse,
  createExam,
  createNote,
  createSelfSchedule,
  createTerm,
  createTodo,
  emptyData,
  exportBlob,
  parseImport,
} from './store'
import { COUNTDOWN_COLORS, COUNTDOWN_EMOJIS, NOTE_COLORS, STORAGE_KEY } from '../types'

describe('存储键', () => {
  test('主数据键不能改 —— 改了等于所有老用户数据消失', () => {
    expect(STORAGE_KEY).toBe('kemiao-days-v1')
  })
})

describe('空数据', () => {
  test('所有集合都存在且为数组，UI 可以直接 .map', () => {
    const data = emptyData()
    expect(data.todos).toEqual([])
    expect(data.countdowns).toEqual([])
    expect(data.notes).toEqual([])
    expect(data.courses).toEqual([])
    expect(data.exams).toEqual([])
    expect(data.selfSchedules).toEqual([])
    expect(data.calendarEvents).toEqual([])
  })

  test('默认自带一个学期，课表不会因为没有学期而崩', () => {
    const data = emptyData()
    expect(data.terms).toHaveLength(1)
    expect(data.currentTermId).toBe(data.terms[0].id)
  })

  test('默认提醒设置保持既有取值', () => {
    const { reminderSettings } = emptyData()
    expect(reminderSettings.enabled).toBe(true)
    expect(reminderSettings.classDefaultMinutes).toBe(15)
    expect(reminderSettings.examDefaultMinutes).toBe(1440)
    expect(reminderSettings.examAlsoHourBefore).toBe(true)
    expect(reminderSettings.selfScheduleDefaultMinutes).toBe(10)
  })

  test('默认隐藏凌晨 0–5 点，周一为一周起点', () => {
    const { timetableView } = emptyData()
    expect(timetableView.hiddenHours).toEqual([0, 1, 2, 3, 4, 5])
    expect(timetableView.hiddenWeekdays).toEqual([])
    expect(timetableView.weekStartsOn).toBe(1)
    expect(timetableView.classPeriods.length).toBeGreaterThan(0)
  })
})

describe('待办', () => {
  test('创建时带上默认优先级和提醒', () => {
    const todo = createTodo('  交实验报告  ')
    expect(todo.title).toBe('交实验报告')
    expect(todo.done).toBe(false)
    expect(todo.priority).toBe('medium')
    expect(todo.remindMinutes).toBe(15)
    expect(todo.id).toBeTruthy()
  })

  test('到期日、时间、优先级、提醒都能带入', () => {
    const todo = createTodo('复习', {
      dueDate: '2026-12-01',
      dueTime: '19:30',
      priority: 'high',
      remindMinutes: 60,
    })
    expect(todo.dueDate).toBe('2026-12-01')
    expect(todo.dueTime).toBe('19:30')
    expect(todo.priority).toBe('high')
    expect(todo.remindMinutes).toBe(60)
  })
})

describe('倒数日', () => {
  test('默认不每年重复，带默认颜色和 emoji', () => {
    const countdown = createCountdown('考研', '2026-12-21')
    expect(countdown.title).toBe('考研')
    expect(countdown.date).toBe('2026-12-21')
    expect(countdown.repeatYearly).toBe(false)
    expect(countdown.color).toBe(COUNTDOWN_COLORS[0])
    expect(countdown.emoji).toBe(COUNTDOWN_EMOJIS[0])
  })

  test('每年重复可以开启 —— 这是目前唯一的「纪念日」能力', () => {
    const countdown = createCountdown('公司成立', '2026-09-19', { repeatYearly: true, emoji: '🎂' })
    expect(countdown.repeatYearly).toBe(true)
    expect(countdown.emoji).toBe('🎂')
  })
})

describe('便签', () => {
  test('创建时默认不钉住，带默认颜色', () => {
    const note = createNote('购物清单', '牛奶、面包')
    expect(note.title).toBe('购物清单')
    expect(note.body).toBe('牛奶、面包')
    expect(note.pinned).toBe(false)
    expect(note.color).toBe(NOTE_COLORS[0])
    expect(note.updatedAt).toBeGreaterThan(0)
  })

  test('可以绑定到某一天，供日历面板使用', () => {
    expect(createNote('会议纪要', '', { date: '2026-09-19' }).date).toBe('2026-09-19')
  })
})

describe('课程', () => {
  test('默认周一 08:00–09:40，提前 15 分钟提醒', () => {
    const course = createCourse('高等数学')
    expect(course.name).toBe('高等数学')
    expect(course.weekday).toBe(1)
    expect(course.startTime).toBe('08:00')
    expect(course.endTime).toBe('09:40')
    expect(course.remindMinutes).toBe(15)
  })

  test('教师、教室、单双周、学期都能带入', () => {
    const course = createCourse('线性代数', {
      weekday: 2,
      startTime: '10:00',
      endTime: '11:40',
      location: '教一1506',
      teacher: '王老师',
      weeks: '1-16单周',
      termId: 'term-1',
    })
    expect(course.location).toBe('教一1506')
    expect(course.teacher).toBe('王老师')
    expect(course.weeks).toBe('1-16单周')
    expect(course.termId).toBe('term-1')
  })

  test('已知缺口：createCourse 会丢掉 note，备注只能靠 updateCourse 写入', () => {
    // 这里钉的是**现状**而不是期望。Course 类型有 note、课程详情页也在存备注，
    // 但工厂函数没有透传它。目前不影响用户（UI 走 updateCourse），修复留到
    // 下一阶段，见 docs/existing-features.md 的「已知缺口」。
    expect(createCourse('线性代数', { note: '带计算器' }).note).toBeUndefined()
  })
})

describe('考试', () => {
  test('默认按期末处理，提前一天提醒', () => {
    const exam = createExam('高等数学', { date: '2027-01-08' })
    expect(exam.kind).toBe('final')
    expect(exam.startTime).toBe('09:00')
    expect(exam.remindMinutes).toBe(1440)
  })

  test('期中 / 补考 / 座位都能带入', () => {
    const exam = createExam('大学英语', { kind: 'makeup', date: '2027-03-01', seat: '15' })
    expect(exam.kind).toBe('makeup')
    expect(exam.seat).toBe('15')
  })
})

describe('自我管理时间表', () => {
  test('默认周一 08:00–09:00，提前 10 分钟', () => {
    const item = createSelfSchedule('晨跑')
    expect(item.weekday).toBe(1)
    expect(item.startTime).toBe('08:00')
    expect(item.endTime).toBe('09:00')
    expect(item.remindMinutes).toBe(10)
    expect(item.priority).toBe('medium')
  })
})

describe('日历事件（有模型、暂无 UI）', () => {
  test('默认不重复、非全天、提前 15 分钟', () => {
    const event = createCalendarEvent('组会', { date: '2026-09-21' })
    expect(event.repeat).toBe('none')
    expect(event.allDay).toBe(false)
    expect(event.remindMinutes).toBe(15)
    expect(event.priority).toBe('medium')
  })

  test('已经支持四种重复频率 —— 新周期系统应复用，不要另起一套', () => {
    for (const repeat of ['daily', 'weekly', 'monthly', 'yearly'] as const) {
      expect(createCalendarEvent('例会', { date: '2026-09-21', repeat }).repeat).toBe(repeat)
    }
  })
})

describe('学期', () => {
  test('新学期带默认周数', () => {
    expect(createTerm({ kind: 'fall' }).weekCount).toBe(16)
    expect(createTerm({ kind: 'summer' }).weekCount).toBe(4)
    expect(createTerm({ kind: 'intern' }).weekCount).toBe(8)
  })
})

describe('向后兼容 —— 老用户的 localStorage 必须继续读得出来', () => {
  test('最小对象也能读出完整结构', () => {
    const data = parseImport('{}')
    expect(data.todos).toEqual([])
    expect(data.terms).toHaveLength(1)
    expect(data.timetableView.hiddenHours).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('没有 remindMinutes 的老课程补成 15，不会变成 undefined', () => {
    const data = parseImport(
      JSON.stringify({ courses: [{ id: 'c1', name: '高数', weekday: 1, startTime: '08:00', endTime: '09:40' }] }),
    )
    expect(data.courses[0].remindMinutes).toBe(15)
  })

  test('没有 remindMinutes 的老待办补成 15', () => {
    const data = parseImport(JSON.stringify({ todos: [{ id: 't1', title: '写作业', done: false }] }))
    expect(data.todos[0].remindMinutes).toBe(15)
  })

  test('老的 termStart 字段会回填成一个学期，课表不会丢教学周', () => {
    const data = parseImport(JSON.stringify({ termStart: '2026-09-07' }))
    expect(data.terms).toHaveLength(1)
    expect(data.terms[0].startDate).toBe('2026-09-07')
    expect(data.termStart).toBe('2026-09-07')
  })

  test('没有 termId 的老课程自动归到当前学期', () => {
    const data = parseImport(
      JSON.stringify({
        termStart: '2026-09-07',
        courses: [{ id: 'c1', name: '高数', weekday: 1, startTime: '08:00', endTime: '09:40' }],
      }),
    )
    expect(data.courses[0].termId).toBe(data.currentTermId)
  })

  test('老的自我管理条目补齐 priority 和 remindMinutes', () => {
    const data = parseImport(
      JSON.stringify({
        selfSchedules: [{ id: 's1', title: '健身', weekday: 3, startTime: '18:00', endTime: '19:00' }],
      }),
    )
    expect(data.selfSchedules[0].priority).toBe('medium')
    expect(data.selfSchedules[0].remindMinutes).toBe(10)
  })

  test('老的日历事件补齐 repeat / allDay / priority', () => {
    const data = parseImport(
      JSON.stringify({ calendarEvents: [{ id: 'e1', title: '组会', date: '2026-09-21' }] }),
    )
    expect(data.calendarEvents[0].repeat).toBe('none')
    expect(data.calendarEvents[0].allDay).toBe(false)
    expect(data.calendarEvents[0].priority).toBe('medium')
  })

  test('部分 reminderSettings 与默认值合并，不会丢字段', () => {
    const data = parseImport(JSON.stringify({ reminderSettings: { classDefaultMinutes: 30 } }))
    expect(data.reminderSettings.classDefaultMinutes).toBe(30)
    expect(data.reminderSettings.examDefaultMinutes).toBe(1440)
    expect(data.reminderSettings.enabled).toBe(true)
  })

  test('集合字段被写坏成非数组时回落成空数组，而不是让应用崩掉', () => {
    const data = parseImport(JSON.stringify({ todos: 'corrupted', notes: null, exams: 42 }))
    expect(data.todos).toEqual([])
    expect(data.notes).toEqual([])
    expect(data.exams).toEqual([])
  })

  test('currentTermId 指向一个不存在的学期时回落到第一个', () => {
    const data = parseImport(JSON.stringify({ currentTermId: 'ghost' }))
    expect(data.currentTermId).toBe(data.terms[0].id)
  })

  test('hiddenHours 全 24 小时会被拒绝，否则课表会整个空掉', () => {
    const all = Array.from({ length: 24 }, (_, hour) => hour)
    const data = parseImport(JSON.stringify({ timetableView: { hiddenHours: all } }))
    expect(data.timetableView.hiddenHours).toEqual([0, 1, 2, 3, 4, 5])
  })

  test('hiddenWeekdays 全 7 天会被清空，否则周课表没有列', () => {
    const data = parseImport(JSON.stringify({ timetableView: { hiddenWeekdays: [1, 2, 3, 4, 5, 6, 7] } }))
    expect(data.timetableView.hiddenWeekdays).toEqual([])
  })

  test('无效 JSON 抛错，不会静默吞掉用户的备份文件', () => {
    expect(() => parseImport('not json')).toThrow()
  })
})

describe('备份导出 / 导入闭环', () => {
  test('导出再导入，七类业务数据一条不少', async () => {
    const original = {
      ...emptyData(),
      todos: [createTodo('交实验报告', { dueDate: '2026-12-01' })],
      countdowns: [createCountdown('考研', '2026-12-21', { repeatYearly: true })],
      notes: [createNote('购物清单', '牛奶')],
      courses: [createCourse('高数', { weeks: '1-16单周' })],
      exams: [createExam('高数', { date: '2027-01-08' })],
      selfSchedules: [createSelfSchedule('晨跑')],
      calendarEvents: [createCalendarEvent('组会', { date: '2026-09-21' })],
    }

    const restored = parseImport(await exportBlob(original).text())

    expect(restored.todos.map((t) => t.title)).toEqual(['交实验报告'])
    expect(restored.countdowns[0].repeatYearly).toBe(true)
    expect(restored.notes.map((n) => n.title)).toEqual(['购物清单'])
    expect(restored.courses[0].weeks).toBe('1-16单周')
    expect(restored.exams.map((e) => e.name)).toEqual(['高数'])
    expect(restored.selfSchedules.map((s) => s.title)).toEqual(['晨跑'])
    expect(restored.calendarEvents.map((e) => e.title)).toEqual(['组会'])
  })
})
