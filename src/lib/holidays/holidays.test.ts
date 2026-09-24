import { describe, expect, it } from 'vitest'
import { buildHolidayCatalog, eachDate, easterSunday, observedDate } from './build'
import { daysUntil, holidayBadges, holidaysOn, nextOccurrence } from './query'

const catalog = buildHolidayCatalog(2024, 2032)

function on(date: string, name?: string) {
  const items = catalog.filter((item) => item.date === date && (name == null || item.name === name))
  return items
}

describe('中国 2026 国务院放假', () => {
  it('元旦放假与补班', () => {
    expect(eachDate('2026-01-01', '2026-01-03').every((date) => on(date).some((item) => item.isDayOff && item.name === '元旦'))).toBe(true)
    expect(on('2026-01-04', '补班')[0]?.isAdjustedWorkday).toBe(true)
    expect(on('2026-01-04').some((item) => item.isDayOff)).toBe(false)
  })

  it('春节、端午、中秋、国庆逐日', () => {
    for (const date of eachDate('2026-02-15', '2026-02-23')) expect(on(date).some((item) => item.name === '春节' && item.isDayOff)).toBe(true)
    expect(on('2026-02-14', '补班')[0]?.description).toContain('春节')
    expect(on('2026-02-28', '补班')).toHaveLength(1)
    for (const date of eachDate('2026-04-04', '2026-04-06')) expect(on(date).some((item) => item.name === '清明节' && item.isDayOff)).toBe(true)
    for (const date of eachDate('2026-05-01', '2026-05-05')) expect(on(date).some((item) => item.name === '劳动节' && item.isDayOff)).toBe(true)
    expect(on('2026-05-09', '补班')[0]?.description).toContain('劳动节')
    for (const date of eachDate('2026-06-19', '2026-06-21')) expect(on(date).some((item) => item.name === '端午节' && item.isDayOff)).toBe(true)
    for (const date of eachDate('2026-09-25', '2026-09-27')) expect(on(date).some((item) => item.name === '中秋节' && item.isDayOff)).toBe(true)
    for (const date of eachDate('2026-10-01', '2026-10-07')) expect(on(date).some((item) => item.name === '国庆节' && item.isDayOff)).toBe(true)
    expect(on('2026-09-20', '补班')[0]?.description).toContain('国庆')
    expect(on('2026-10-10', '补班')).toHaveLength(1)
  })

  it('节日本身和放假日不是同一条伪造调休', () => {
    const spring = catalog.find((item) => item.date === '2026-02-17' && item.kind === 'public_holiday' && item.name === '春节')
    expect(spring?.stableKey).toBe('cn:spring-festival')
    const future = catalog.find((item) => item.sourceYear === 2027 && item.stableKey === 'cn:spring-festival' && item.kind === 'public_holiday')
    expect(future?.description).toBe('官方放假安排待公布')
    expect(catalog.some((item) => item.sourceYear === 2027 && item.isAdjustedWorkday)).toBe(false)
  })
})

describe('农历与美国规则', () => {
  it('农历节日跨年', () => {
    expect(catalog.find((item) => item.stableKey === 'cn:spring-festival' && item.kind === 'public_holiday' && item.sourceYear === 2025)?.date).toBe('2025-01-29')
    expect(catalog.find((item) => item.stableKey === 'cn:lantern' && item.sourceYear === 2026)?.date).toBe('2026-03-03')
    expect(catalog.find((item) => item.stableKey === 'cn:qixi' && item.sourceYear === 2026)?.kind).toBe('traditional_festival')
    expect(catalog.find((item) => item.stableKey === 'cn:double-ninth' && item.sourceYear === 2024)?.date).toBe('2024-10-11')
  })

  it('美国第 N 个星期和补休', () => {
    expect(catalog.find((item) => item.stableKey === 'us:mlk' && item.sourceYear === 2026)?.date).toBe('2026-01-19')
    expect(catalog.find((item) => item.stableKey === 'us:washington' && item.sourceYear === 2026)?.date).toBe('2026-02-16')
    expect(catalog.find((item) => item.stableKey === 'us:memorial' && item.sourceYear === 2026)?.date).toBe('2026-05-25')
    expect(catalog.find((item) => item.stableKey === 'us:labor' && item.sourceYear === 2026)?.date).toBe('2026-09-07')
    expect(catalog.find((item) => item.stableKey === 'us:columbus' && item.sourceYear === 2026)?.date).toBe('2026-10-12')
    expect(catalog.find((item) => item.stableKey === 'us:thanksgiving' && item.sourceYear === 2026)?.date).toBe('2026-11-26')
    expect(observedDate('2026-07-04')).toBe('2026-07-03')
    expect(catalog.find((item) => item.stableKey === 'us:observed:independence' && item.sourceYear === 2026)?.date).toBe('2026-07-03')
    expect(catalog.find((item) => item.stableKey === 'us:independence' && item.sourceYear === 2026)?.isDayOff).toBe(false)
    expect(catalog.find((item) => item.stableKey === 'us:halloween' && item.sourceYear === 2026)?.kind).toBe('observance')
    expect(catalog.find((item) => item.stableKey === 'us:halloween' && item.sourceYear === 2026)?.isDayOff).toBe(false)
  })

  it('复活节与同日多节日', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(on('2026-04-05').map((item) => item.name)).toEqual(expect.arrayContaining(['清明节', 'Easter']))
    const badges = holidayBadges(on('2026-04-05'), 1)
    expect(badges.extra).toBeGreaterThan(0)
  })

  it('日期不因时区字符串偏移', () => {
    expect(daysUntil('2026-10-01', '2026-09-24')).toBe(7)
    expect(nextOccurrence('cn:national-day', '2026-09-24', catalog)?.date).toBe('2026-10-01')
  })

  it('重复生成不产生重复 id', () => {
    const ids = catalog.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('查询', () => {
  it('按日过滤', () => {
    expect(holidaysOn('2026-06-01', { showCn: true, showUs: false }, catalog).some((item) => item.name === '儿童节')).toBe(true)
    expect(holidaysOn('2026-06-01', { showCn: false }, catalog)).toHaveLength(0)
  })
})
