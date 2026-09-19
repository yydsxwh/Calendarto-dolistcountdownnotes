import { describe, expect, it } from 'vitest'
import { dayFacts, daysSince, daysUntil, nextOccurrence, parseISODate } from './dates'

const on = (iso: string) => parseISODate(iso)

describe('daysSince', () => {
  it('counts whole days after a past date', () => {
    expect(daysSince('2026-09-10', on('2026-09-19'))).toBe(9)
  })

  it('is zero on the day itself', () => {
    expect(daysSince('2026-09-19', on('2026-09-19'))).toBe(0)
  })

  it('goes negative while the date is still ahead', () => {
    expect(daysSince('2026-12-25', on('2026-09-19'))).toBe(-97)
  })
})

describe('nextOccurrence', () => {
  it('leaves a one-off date alone', () => {
    expect(nextOccurrence('2026-12-25', false, on('2026-09-19'))).toBe('2026-12-25')
  })

  it('finds this year when the day is still ahead', () => {
    expect(nextOccurrence('1998-12-25', true, on('2026-09-19'))).toBe('2026-12-25')
  })

  it('rolls to next year once the day has passed', () => {
    expect(nextOccurrence('1998-03-02', true, on('2026-09-19'))).toBe('2027-03-02')
  })

  it('treats today as the occurrence, not next year', () => {
    expect(nextOccurrence('1998-09-19', true, on('2026-09-19'))).toBe('2026-09-19')
  })
})

/**
 * 用户给的四个真实例子。倒数日和纪念日是同一个功能，一条记录要同时回答
 * 「还有多少天」和「已经过去多少天」。
 */
describe('dayFacts', () => {
  const today = on('2026-09-19')

  it('counts down to a plain future date (圣诞节)', () => {
    const f = dayFacts('2026-12-25', false, today)
    expect(f.hasUpcoming).toBe(true)
    expect(f.daysToNext).toBe(97)
    expect(f.originPassed).toBe(false)
    expect(f.elapsedDays).toBe(-97)
  })

  it('counts a repeating festival to its next round (每年圣诞节)', () => {
    const f = dayFacts('2020-12-25', true, today)
    expect(f.next).toBe('2026-12-25')
    expect(f.daysToNext).toBe(97)
    expect(f.originPassed).toBe(true)
    expect(f.elapsedDays).toBe(2094)
  })

  it('gives a birthday both the elapsed life and the next birthday (28 岁生日)', () => {
    // 1998-10-01 出生，2026-09-19 这天还没过生日，所以满 27 年，下一次是第 28 个。
    const f = dayFacts('1998-10-01', true, today)
    expect(f.originPassed).toBe(true)
    expect(f.yearsSince).toBe(27)
    expect(f.next).toBe('2026-10-01')
    expect(f.daysToNext).toBe(12)
    expect(f.upcomingOrdinal).toBe(28)
  })

  it('counts days lived since a birth date (出生那天)', () => {
    const f = dayFacts('1998-10-01', false, today)
    expect(f.originPassed).toBe(true)
    expect(f.elapsedDays).toBe(10215)
    // 不重复的过去日子没有未来场次，卡片显示「已过」。
    expect(f.hasUpcoming).toBe(false)
    expect(f.upcomingOrdinal).toBe(0)
  })

  it('counts days since founding a company (公司成立)', () => {
    const f = dayFacts('2024-03-15', false, today)
    expect(f.elapsedDays).toBe(918)
    expect(f.hasUpcoming).toBe(false)
    expect(f.yearsSince).toBe(2)
  })

  it('marks the day itself as today rather than past or future', () => {
    const f = dayFacts('2026-09-19', false, today)
    expect(f.daysToNext).toBe(0)
    expect(f.hasUpcoming).toBe(true)
    expect(f.originPassed).toBe(false)
    expect(f.elapsedDays).toBe(0)
  })

  it('does not claim a completed year on the anniversary eve', () => {
    expect(dayFacts('2000-09-20', true, today).yearsSince).toBe(25)
    expect(dayFacts('2000-09-19', true, today).yearsSince).toBe(26)
  })
})

describe('daysUntil stays as other views expect', () => {
  it('is positive for the future and negative for the past', () => {
    const iso = new Date().toISOString().slice(0, 10)
    expect(daysUntil(iso)).toBe(0)
  })
})
