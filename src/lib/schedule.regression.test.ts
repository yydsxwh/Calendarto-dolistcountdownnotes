/**
 * 现有功能回归基线 —— 课表、学期、日历与倒数日的日期计算
 *
 * 课表是功能最重的模块，它的教学周、单双周、时间轴和重叠排布一旦回归，
 * 用户会直接看到课上错时间。这里把这些规则逐条钉住。
 */
import { describe, expect, test, vi, afterEach } from 'vitest'
import {
  buildTimeAxis,
  courseInTeachingWeek,
  courseInTerm,
  hiddenHourRuns,
  layoutDayCourses,
  parseWeekNumbers,
  shiftWeek,
  startOfWeek,
  teachingWeekNumber,
  visibleHours,
  weekDays,
} from './week-grid'
import { createCourse } from './store'
import { daysUntil, monthCells, nextOccurrence, parseISODate, toISODate } from './dates'
import { defaultWeekCount, guessTermKind, termLabel, TERM_KINDS } from './terms'
import { minutesOf, normalizeClockInput, parseTimeRange, parseWeekday } from './periods'

afterEach(() => {
  vi.useRealTimers()
})

describe('单双周与教学周解析', () => {
  test.each([
    ['1-16周', [1, 8, 16], [17]],
    ['1,3,5', [1, 3, 5], [2, 4]],
    ['1-16单周', [1, 3, 15], [2, 4, 16]],
    ['1-16双周', [2, 4, 16], [1, 3, 15]],
    ['1-8,10-16周', [1, 8, 10, 16], [9]],
  ])('「%s」命中 %j，不命中 %j', (spec, hit, miss) => {
    const weeks = parseWeekNumbers(spec)
    expect(weeks).not.toBeNull()
    for (const week of hit) expect(weeks?.has(week)).toBe(true)
    for (const week of miss) expect(weeks?.has(week)).toBe(false)
  })

  test('只写「单周」时覆盖整个学期的奇数周', () => {
    const weeks = parseWeekNumbers('单周')
    expect(weeks?.has(1)).toBe(true)
    expect(weeks?.has(2)).toBe(false)
  })

  test('空的周数说明表示每周都上', () => {
    expect(parseWeekNumbers('')).toBeNull()
    expect(parseWeekNumbers(undefined)).toBeNull()
  })

  test('没写周数的课在任何教学周都显示', () => {
    expect(courseInTeachingWeek(createCourse('高数'), 7)).toBe(true)
  })

  test('单周的课在第 8 周不显示', () => {
    const course = createCourse('高数', { weeks: '1-16单周' })
    expect(courseInTeachingWeek(course, 7)).toBe(true)
    expect(courseInTeachingWeek(course, 8)).toBe(false)
  })

  test('拿不到教学周时一律显示，避免整张课表空掉', () => {
    expect(courseInTeachingWeek(createCourse('高数', { weeks: '1-16单周' }), null)).toBe(true)
  })
})

describe('学期归属', () => {
  test('课程只在自己的学期显示', () => {
    const course = createCourse('高数', { termId: 'term-a' })
    expect(courseInTerm(course, 'term-a')).toBe(true)
    expect(courseInTerm(course, 'term-b')).toBe(false)
  })

  test('老数据没有 termId 时不被过滤掉', () => {
    expect(courseInTerm(createCourse('高数'), 'term-a')).toBe(true)
  })

  test('六种学期类型都有标签和默认周数', () => {
    for (const kind of TERM_KINDS) {
      expect(defaultWeekCount(kind)).toBeGreaterThan(0)
      expect(termLabel({ id: 'x', yearStart: 2026, kind, startDate: '', weekCount: 16 })).toContain('2026-2027')
    }
  })

  test('自定义标题优先于自动标签', () => {
    const label = termLabel({ id: 'x', yearStart: 2026, kind: 'fall', title: '大三上', startDate: '', weekCount: 16 })
    expect(label).toBe('大三上')
  })

  test('按月份猜学期类型', () => {
    expect(guessTermKind(new Date(2026, 8, 1))).toBe('fall')
    expect(guessTermKind(new Date(2026, 2, 1))).toBe('spring')
    expect(guessTermKind(new Date(2026, 6, 1))).toBe('summer')
    expect(guessTermKind(new Date(2026, 0, 1))).toBe('winter')
  })
})

describe('周次计算', () => {
  test('开学当周是第 1 周', () => {
    expect(teachingWeekNumber(parseISODate('2026-09-07'), '2026-09-07')).toBe(1)
  })

  test('三周后是第 4 周', () => {
    expect(teachingWeekNumber(parseISODate('2026-09-28'), '2026-09-07')).toBe(4)
  })

  test('没设开学日期就没有周次', () => {
    expect(teachingWeekNumber(parseISODate('2026-09-28'), undefined)).toBeNull()
  })

  test('startOfWeek 按周一取整，也支持周日起', () => {
    const wednesday = new Date(2026, 8, 23)
    expect(toISODate(startOfWeek(wednesday, 1))).toBe('2026-09-21')
    expect(toISODate(startOfWeek(wednesday, 7))).toBe('2026-09-20')
  })

  test('翻周前后各 7 天', () => {
    const monday = parseISODate('2026-09-21')
    expect(toISODate(shiftWeek(monday, 1))).toBe('2026-09-28')
    expect(toISODate(shiftWeek(monday, -1))).toBe('2026-09-14')
  })

  test('weekDays 默认给出 7 列，隐藏周末后剩 5 列', () => {
    const monday = parseISODate('2026-09-21')
    expect(weekDays(monday, monday, 1)).toHaveLength(7)
    expect(weekDays(monday, monday, 1, [6, 7])).toHaveLength(5)
  })
})

describe('时间轴与隐藏行', () => {
  test('默认隐藏 0–5 点后剩 18 个可见小时', () => {
    expect(visibleHours([0, 1, 2, 3, 4, 5])).toHaveLength(18)
  })

  test('全部隐藏会被兜底，课表不会变成空白', () => {
    expect(visibleHours(Array.from({ length: 24 }, (_, hour) => hour))).toEqual([8])
  })

  test('连续隐藏的小时合成一段，供 ▾ 展开使用', () => {
    expect(hiddenHourRuns([0, 1, 2, 3, 4, 5])).toEqual([{ start: 0, end: 5 }])
    expect(hiddenHourRuns([0, 1, 22, 23])).toEqual([
      { start: 0, end: 1 },
      { start: 22, end: 23 },
    ])
  })

  test('刻度跟随上下课时钟，而不是只有整点', () => {
    const axis = buildTimeAxis({
      hiddenHours: [0, 1, 2, 3, 4, 5],
      courses: [
        { startTime: '08:30', endTime: '09:30' },
        { startTime: '10:30', endTime: '11:30' },
      ],
    })
    const labels = axis.marks.map((mark) => mark.label)
    expect(labels).toContain('08:30')
    expect(labels).toContain('11:30')
  })

  test('可见范围裁剪到第一节开始与最后一节结束', () => {
    const axis = buildTimeAxis({
      hiddenHours: [0, 1, 2, 3, 4, 5],
      courses: [{ startTime: '08:30', endTime: '09:30' }],
    })
    expect(axis.originMin).toBe(minutesOf('08:30'))
    expect(axis.endMin).toBe(minutesOf('09:30'))
  })

  test('没有课时回落到整点刻度', () => {
    const axis = buildTimeAxis({ hiddenHours: [0, 1, 2, 3, 4, 5] })
    expect(axis.marks.every((mark) => mark.kind === 'hour')).toBe(true)
  })
})

describe('课程块排布', () => {
  test('不重叠的课各占满一列', () => {
    const laid = layoutDayCourses(
      [
        createCourse('上午', { startTime: '08:00', endTime: '09:40' }),
        createCourse('下午', { startTime: '14:00', endTime: '15:40' }),
      ],
      [],
      56,
    )
    expect(laid).toHaveLength(2)
    expect(laid.every((item) => item.cols === 1)).toBe(true)
  })

  test('时间重叠的课自动分成两列', () => {
    const laid = layoutDayCourses(
      [
        createCourse('A', { startTime: '08:00', endTime: '09:40' }),
        createCourse('B', { startTime: '09:00', endTime: '10:40' }),
      ],
      [],
      56,
    )
    expect(laid).toHaveLength(2)
    expect(laid.every((item) => item.cols === 2)).toBe(true)
    expect(new Set(laid.map((item) => item.col)).size).toBe(2)
  })

  test('结束早于开始的脏数据被丢弃，不会画出负高度', () => {
    expect(layoutDayCourses([createCourse('坏', { startTime: '10:00', endTime: '09:00' })], [], 56)).toEqual([])
  })
})

describe('时间解析', () => {
  test.each([
    ['8:05', '08:05'],
    ['08:30', '08:30'],
    ['0830', '08:30'],
    ['08：30', '08:30'],
    ['08.30', '08:30'],
  ])('normalizeClockInput(%j) → %j', (input, expected) => {
    expect(normalizeClockInput(input)).toBe(expected)
  })

  test.each(['8:5', '25:00', '08:70', '随便写'])('拒绝无法识别的时间 %j', (input) => {
    // 分钟必须两位：「8:5」不接受，避免把 8:50 误读成 8:05。
    expect(normalizeClockInput(input)).toBeNull()
  })

  test('解析时间区间', () => {
    expect(parseTimeRange('08:00-09:40')).toEqual({ start: '08:00', end: '09:40' })
  })

  test('中文星期能解析成 1–7', () => {
    expect(parseWeekday('周一')).toBe(1)
    expect(parseWeekday('星期日')).toBe(7)
  })
})

describe('倒数日日期计算', () => {
  test('未来日期返回正数天数', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 12, 0, 0))
    expect(daysUntil('2026-09-29')).toBe(10)
  })

  test('今天返回 0', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 23, 30, 0))
    expect(daysUntil('2026-09-19')).toBe(0)
  })

  test('过去日期返回负数，卡片显示「已过 N 天」', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 12, 0, 0))
    expect(daysUntil('2026-09-09')).toBe(-10)
  })

  test('不重复的倒数日始终指向原日期', () => {
    expect(nextOccurrence('2020-01-01', false)).toBe('2020-01-01')
  })

  test('每年重复：今年还没到就用今年', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 1, 12, 0, 0))
    expect(nextOccurrence('2020-09-19', true)).toBe('2026-09-19')
  })

  test('每年重复：今年已过就跳到明年', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 20, 12, 0, 0))
    expect(nextOccurrence('2020-09-19', true)).toBe('2027-09-19')
  })

  test('每年重复：当天仍算今年，不会提前跳走', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 19, 12, 0, 0))
    expect(nextOccurrence('2020-09-19', true)).toBe('2026-09-19')
  })
})

describe('月历网格', () => {
  test('单元格数量是 7 的整数倍，网格不会错位', () => {
    for (const month of [0, 1, 5, 11]) {
      expect(monthCells(new Date(2026, month, 1)).length % 7).toBe(0)
    }
  })

  test('2026 年 9 月有 30 个真实日期', () => {
    const real = monthCells(new Date(2026, 8, 1)).filter(Boolean)
    expect(real).toHaveLength(30)
  })

  test('第一格落在正确的星期列上', () => {
    // 2026-09-01 是星期二，前面应当补两个空格（周日、周一）。
    const cells = monthCells(new Date(2026, 8, 1))
    expect(cells[0]).toBeNull()
    expect(cells[1]).toBeNull()
    expect(toISODate(cells[2] as Date)).toBe('2026-09-01')
  })

  test('闰年 2 月有 29 天', () => {
    expect(monthCells(new Date(2028, 1, 1)).filter(Boolean)).toHaveLength(29)
  })
})
