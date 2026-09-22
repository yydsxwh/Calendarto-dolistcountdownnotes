import { describe, expect, it } from 'vitest'
import {
  PRIMARY_NAV,
  TIMETABLE_TABS,
  parseRoute,
  routeHash,
  isAdminHash,
} from './routes'

describe('底部导航', () => {
  it('一级入口正好五项，且是产品要求的名字', () => {
    expect(PRIMARY_NAV.map((item) => item.id)).toEqual([
      'today',
      'calendar',
      'timetable',
      'days',
      'notes',
    ])
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      '我的一天',
      '日历',
      '时间表',
      '日子',
      '便签',
    ])
  })

  it('时间表二级页覆盖课表 / 考试 / 自律 / 提醒', () => {
    expect(TIMETABLE_TABS.map((tab) => tab.id)).toEqual(['week', 'exams', 'self', 'remind'])
  })
})

describe('旧链接兼容', () => {
  it('#todos 进我的一天并定位待办', () => {
    expect(parseRoute('#todos')).toEqual({ view: 'today', timetableTab: 'week', focus: 'todos' })
  })

  it('#schedule / #exams / #selfschedule 映射到时间表对应二级页', () => {
    expect(parseRoute('#schedule')).toMatchObject({ view: 'timetable', timetableTab: 'week' })
    expect(parseRoute('#exams')).toMatchObject({ view: 'timetable', timetableTab: 'exams' })
    expect(parseRoute('#selfschedule')).toMatchObject({ view: 'timetable', timetableTab: 'self' })
  })

  it('#days 仍然是倒数日数据，只是显示名改成日子', () => {
    expect(parseRoute('#days').view).toBe('days')
    expect(PRIMARY_NAV.find((item) => item.id === 'days')?.label).toBe('日子')
  })

  it('未知 hash 回到我的一天而不是空白页', () => {
    expect(parseRoute('#nope')).toMatchObject({ view: 'today' })
    expect(parseRoute('')).toMatchObject({ view: 'today' })
  })

  it('刷新后能从规范 hash 还原同一个二级页', () => {
    for (const tab of TIMETABLE_TABS) {
      const route = { view: 'timetable' as const, timetableTab: tab.id, focus: null }
      expect(parseRoute(`#${routeHash(route)}`)).toEqual(route)
    }
  })

  it('管理后台不走一级导航', () => {
    expect(isAdminHash('#admin')).toBe(true)
    expect(isAdminHash('#admin/apis')).toBe(true)
    expect(isAdminHash('#today')).toBe(false)
  })
})
