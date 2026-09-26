/**
 * 节日目录生成器。农历只交给 lunar-javascript@1.7.7 计算。
 * 中国调休来自国务院办公厅年度通知，没有通知的年份不猜补班。
 * 运行：node --import tsx src/lib/holidays/build.ts
 */
import { Lunar, Solar } from 'lunar-javascript'

export const HOLIDAY_SOURCE_VERSION = '2026.1'
export const LUNAR_LIB = 'lunar-javascript@1.7.7'

export type HolidayRegion = 'CN' | 'US'
export type HolidayKind = 'public_holiday' | 'day_off' | 'adjusted_workday' | 'traditional_festival' | 'observance'

export interface HolidayOccurrence {
  id: string
  stableKey: string
  region: HolidayRegion
  date: string
  name: string
  localizedNames?: Record<string, string>
  kind: HolidayKind
  isDayOff: boolean
  isAdjustedWorkday: boolean
  source: string
  sourceYear: number
  sourceVersion: string
  description?: string
  subdivision?: string
}
interface OfficialBlock {
  key: string
  name: string
  nameEn: string
  from: string
  to: string
  workdays: string[]
}

interface OfficialYear {
  year: number
  docNo: string
  sourceUrl: string
  publishedOn: string
  blocks: OfficialBlock[]
}

const CN_STATUTE = '《全国年节及纪念日放假办法》'
const OPM = 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/'

/** 国务院办公厅正式通知。放假区间含首尾，补班日单独列出。 */
const CN_OFFICIAL: OfficialYear[] = [
  {
    year: 2024,
    docNo: '国办发明电〔2023〕7号',
    sourceUrl: 'https://www.gov.cn/zhengce/content/202310/content_6911527.htm',
    publishedOn: '2023-10-25',
    blocks: [
      { key: 'new-year', name: '元旦', nameEn: "New Year's Day", from: '2024-01-01', to: '2024-01-01', workdays: [] },
      { key: 'spring-festival', name: '春节', nameEn: 'Spring Festival', from: '2024-02-10', to: '2024-02-17', workdays: ['2024-02-04', '2024-02-18'] },
      { key: 'qingming', name: '清明节', nameEn: 'Qingming Festival', from: '2024-04-04', to: '2024-04-06', workdays: [] },
      { key: 'labour-day', name: '劳动节', nameEn: 'Labour Day', from: '2024-05-01', to: '2024-05-05', workdays: ['2024-04-28', '2024-05-11'] },
      { key: 'dragon-boat', name: '端午节', nameEn: 'Dragon Boat Festival', from: '2024-06-08', to: '2024-06-10', workdays: [] },
      { key: 'mid-autumn', name: '中秋节', nameEn: 'Mid-Autumn Festival', from: '2024-09-15', to: '2024-09-17', workdays: ['2024-09-14'] },
      { key: 'national-day', name: '国庆节', nameEn: 'National Day', from: '2024-10-01', to: '2024-10-07', workdays: ['2024-09-29', '2024-10-12'] },
    ],
  },
  {
    year: 2025,
    docNo: '国办发明电〔2024〕12号',
    sourceUrl: 'https://www.gov.cn/zhengce/content/202411/content_6986380.htm',
    publishedOn: '2024-11-12',
    blocks: [
      { key: 'new-year', name: '元旦', nameEn: "New Year's Day", from: '2025-01-01', to: '2025-01-01', workdays: [] },
      { key: 'spring-festival', name: '春节', nameEn: 'Spring Festival', from: '2025-01-28', to: '2025-02-04', workdays: ['2025-01-26', '2025-02-08'] },
      { key: 'qingming', name: '清明节', nameEn: 'Qingming Festival', from: '2025-04-04', to: '2025-04-06', workdays: [] },
      { key: 'labour-day', name: '劳动节', nameEn: 'Labour Day', from: '2025-05-01', to: '2025-05-05', workdays: ['2025-04-27'] },
      { key: 'dragon-boat', name: '端午节', nameEn: 'Dragon Boat Festival', from: '2025-05-31', to: '2025-06-02', workdays: [] },
      { key: 'national-day', name: '国庆节、中秋节', nameEn: 'National Day and Mid-Autumn Festival', from: '2025-10-01', to: '2025-10-08', workdays: ['2025-09-28', '2025-10-11'] },
    ],
  },
  {
    year: 2026,
    docNo: '国办发明电〔2025〕7号',
    sourceUrl: 'https://www.gov.cn/zhengce/content/202511/content_7047090.htm',
    publishedOn: '2025-11-04',
    blocks: [
      { key: 'new-year', name: '元旦', nameEn: "New Year's Day", from: '2026-01-01', to: '2026-01-03', workdays: ['2026-01-04'] },
      { key: 'spring-festival', name: '春节', nameEn: 'Spring Festival', from: '2026-02-15', to: '2026-02-23', workdays: ['2026-02-14', '2026-02-28'] },
      { key: 'qingming', name: '清明节', nameEn: 'Qingming Festival', from: '2026-04-04', to: '2026-04-06', workdays: [] },
      { key: 'labour-day', name: '劳动节', nameEn: 'Labour Day', from: '2026-05-01', to: '2026-05-05', workdays: ['2026-05-09'] },
      { key: 'dragon-boat', name: '端午节', nameEn: 'Dragon Boat Festival', from: '2026-06-19', to: '2026-06-21', workdays: [] },
      { key: 'mid-autumn', name: '中秋节', nameEn: 'Mid-Autumn Festival', from: '2026-09-25', to: '2026-09-27', workdays: [] },
      { key: 'national-day', name: '国庆节', nameEn: 'National Day', from: '2026-10-01', to: '2026-10-07', workdays: ['2026-09-20', '2026-10-10'] },
    ],
  },
]

const LUNAR_FESTIVALS: { month: number; day: number; key: string; name: string; nameEn: string; statutory: boolean }[] = [
  { month: 1, day: 1, key: 'spring-festival', name: '春节', nameEn: 'Spring Festival', statutory: true },
  { month: 1, day: 15, key: 'lantern', name: '元宵节', nameEn: 'Lantern Festival', statutory: false },
  { month: 5, day: 5, key: 'dragon-boat', name: '端午节', nameEn: 'Dragon Boat Festival', statutory: true },
  { month: 7, day: 7, key: 'qixi', name: '七夕', nameEn: 'Qixi', statutory: false },
  { month: 8, day: 15, key: 'mid-autumn', name: '中秋节', nameEn: 'Mid-Autumn Festival', statutory: true },
  { month: 9, day: 9, key: 'double-ninth', name: '重阳节', nameEn: 'Double Ninth Festival', statutory: false },
]

const SOLAR_FESTIVALS: { month: number; day: number; key: string; name: string; nameEn: string; kind: HolidayKind }[] = [
  { month: 1, day: 1, key: 'new-year', name: '元旦', nameEn: "New Year's Day", kind: 'public_holiday' },
  { month: 3, day: 8, key: 'womens-day', name: '妇女节', nameEn: "International Women's Day", kind: 'observance' },
  { month: 5, day: 1, key: 'labour-day', name: '劳动节', nameEn: 'Labour Day', kind: 'public_holiday' },
  { month: 5, day: 4, key: 'youth-day', name: '青年节', nameEn: 'Youth Day', kind: 'observance' },
  { month: 6, day: 1, key: 'childrens-day', name: "儿童节", nameEn: "Children's Day", kind: 'observance' },
  { month: 9, day: 10, key: 'teachers-day', name: '教师节', nameEn: "Teachers' Day", kind: 'observance' },
  { month: 10, day: 1, key: 'national-day', name: '国庆节', nameEn: 'National Day', kind: 'public_holiday' },
]

export const CATALOG_YEARS = { from: 2024, to: 2032 }

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseIso(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.split('-').map((part) => Number(part))
  return { y, m, d }
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = []
  const start = Date.UTC(parseIso(from).y, parseIso(from).m - 1, parseIso(from).d)
  const end = Date.UTC(parseIso(to).y, parseIso(to).m - 1, parseIso(to).d)
  for (let t = start; t <= end; t += 86400000) {
    const date = new Date(t)
    out.push(iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()))
  }
  return out
}

function occur(input: Omit<HolidayOccurrence, 'id'> & { id?: string }): HolidayOccurrence {
  return { ...input, id: input.id ?? `${input.region}:${input.stableKey}:${input.kind}:${input.date}` }
}

function qingming(year: number): string {
  for (let day = 3; day <= 6; day += 1) {
    const solar = Solar.fromYmd(year, 4, day)
    if (solar.getLunar().getJieQi() === '清明') return solar.toYmd()
  }
  throw new Error(`清明节气未找到 ${year}`)
}

function lunarDate(year: number, month: number, day: number): string {
  return Lunar.fromYmd(year, month, day).getSolar().toYmd()
}

function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1))
  const shift = (weekday - first.getUTCDay() + 7) % 7
  return iso(year, month, 1 + shift + (n - 1) * 7)
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0))
  const shift = (last.getUTCDay() - weekday + 7) % 7
  return iso(year, month, last.getUTCDate() - shift)
}

/** 周六提前到周五，周日顺延到周一。日期用 UTC，避免本地时区把日期挪走。 */
export function observedDate(actual: string): string {
  const { y, m, d } = parseIso(actual)
  const date = new Date(Date.UTC(y, m - 1, d))
  const weekday = date.getUTCDay()
  if (weekday === 6) return iso(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate() - 1)
  if (weekday === 0) {
    const next = new Date(date.getTime() + 86400000)
    return iso(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())
  }
  return actual
}

/** Gregorian computus. */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return iso(year, month, day)
}

function pushCnOfficial(out: HolidayOccurrence[], year: OfficialYear) {
  const source = `${year.docNo} ${year.sourceUrl}`
  for (const block of year.blocks) {
    for (const date of eachDate(block.from, block.to)) {
      out.push(occur({
        stableKey: `cn:${block.key}`,
        region: 'CN',
        date,
        name: block.name,
        localizedNames: { 'zh-CN': block.name, en: block.nameEn },
        kind: 'day_off',
        isDayOff: true,
        isAdjustedWorkday: false,
        source,
        sourceYear: year.year,
        sourceVersion: year.publishedOn,
        description: `${block.name}放假`,
      }))
    }
    for (const date of block.workdays) {
      out.push(occur({
        stableKey: `cn:workday:${block.key}`,
        region: 'CN',
        date,
        name: '补班',
        localizedNames: { 'zh-CN': '补班', en: 'Adjusted workday' },
        kind: 'adjusted_workday',
        isDayOff: false,
        isAdjustedWorkday: true,
        source,
        sourceYear: year.year,
        sourceVersion: year.publishedOn,
        description: `${block.name}调休补班`,
      }))
    }
  }
}

function pushCnFestivals(out: HolidayOccurrence[], year: number, officialYears: Set<number>) {
  const pending = !officialYears.has(year)
  const add = (key: string, name: string, nameEn: string, date: string, statutory: boolean) => {
    out.push(occur({
      stableKey: `cn:${key}`,
      region: 'CN',
      date,
      name,
      localizedNames: { 'zh-CN': name, en: nameEn },
      kind: statutory ? 'public_holiday' : key === 'lantern' || key === 'qixi' || key === 'double-ninth' ? 'traditional_festival' : 'public_holiday',
      isDayOff: false,
      isAdjustedWorkday: false,
      source: statutory ? CN_STATUTE : '中国常见传统节日',
      sourceYear: year,
      sourceVersion: HOLIDAY_SOURCE_VERSION,
      description: pending && statutory ? '官方放假安排待公布' : undefined,
    }))
  }
  for (const item of SOLAR_FESTIVALS) {
    const statutory = item.kind === 'public_holiday'
    out.push(occur({
      stableKey: `cn:${item.key}`,
      region: 'CN',
      date: iso(year, item.month, item.day),
      name: item.name,
      localizedNames: { 'zh-CN': item.name, en: item.nameEn },
      kind: item.kind,
      isDayOff: false,
      isAdjustedWorkday: false,
      source: statutory ? CN_STATUTE : '中国常见纪念日',
      sourceYear: year,
      sourceVersion: HOLIDAY_SOURCE_VERSION,
      description: pending && statutory ? '官方放假安排待公布' : undefined,
    }))
  }
  add('qingming', '清明节', 'Qingming Festival', qingming(year), true)
  for (const item of LUNAR_FESTIVALS) {
    add(item.key, item.name, item.nameEn, lunarDate(year, item.month, item.day), item.statutory)
  }
}

function federal(out: HolidayOccurrence[], year: number, key: string, name: string, nameZh: string, actual: string) {
  const observed = observedDate(actual)
  out.push(occur({
    stableKey: `us:${key}`,
    region: 'US',
    date: actual,
    name,
    localizedNames: { en: name, 'zh-CN': nameZh },
    kind: 'public_holiday',
    isDayOff: observed === actual,
    isAdjustedWorkday: false,
    source: OPM,
    sourceYear: year,
    sourceVersion: HOLIDAY_SOURCE_VERSION,
    description: observed === actual ? '美国联邦法定假日' : `节日日期。联邦机构补休在 ${observed}`,
  }))
  if (observed !== actual) {
    out.push(occur({
      stableKey: `us:observed:${key}`,
      region: 'US',
      date: observed,
      name: `${nameZh}补休`,
      localizedNames: { en: `${name} (observed)`, 'zh-CN': `${nameZh}补休` },
      kind: 'day_off',
      isDayOff: true,
      isAdjustedWorkday: false,
      source: OPM,
      sourceYear: year,
      sourceVersion: HOLIDAY_SOURCE_VERSION,
      description: `联邦机构补休日，节日当天是 ${actual}`,
    }))
  }
}

function observance(out: HolidayOccurrence[], year: number, key: string, name: string, nameZh: string, date: string) {
  out.push(occur({
    stableKey: `us:${key}`,
    region: 'US',
    date,
    name,
    localizedNames: { en: name, 'zh-CN': nameZh },
    kind: 'observance',
    isDayOff: false,
    isAdjustedWorkday: false,
    source: '美国常见文化节日',
    sourceYear: year,
    sourceVersion: HOLIDAY_SOURCE_VERSION,
    description: '文化节日或纪念日，不是全国统一法定放假',
  }))
}

function pushUs(out: HolidayOccurrence[], year: number) {
  federal(out, year, 'new-year', "New Year's Day", '元旦', iso(year, 1, 1))
  federal(out, year, 'mlk', 'Birthday of Martin Luther King, Jr.', '马丁·路德·金日', nthWeekday(year, 1, 1, 3))
  federal(out, year, 'washington', "Washington's Birthday", '华盛顿诞辰', nthWeekday(year, 2, 1, 3))
  federal(out, year, 'memorial', 'Memorial Day', '阵亡将士纪念日', lastWeekday(year, 5, 1))
  federal(out, year, 'juneteenth', 'Juneteenth National Independence Day', '六月节', iso(year, 6, 19))
  federal(out, year, 'independence', 'Independence Day', '独立日', iso(year, 7, 4))
  federal(out, year, 'labor', 'Labor Day', '劳动节', nthWeekday(year, 9, 1, 1))
  federal(out, year, 'columbus', 'Columbus Day', '哥伦布日', nthWeekday(year, 10, 1, 2))
  federal(out, year, 'veterans', 'Veterans Day', '退伍军人节', iso(year, 11, 11))
  federal(out, year, 'thanksgiving', 'Thanksgiving Day', '感恩节', nthWeekday(year, 11, 4, 4))
  federal(out, year, 'christmas', 'Christmas Day', '圣诞节', iso(year, 12, 25))
  observance(out, year, 'valentines', "Valentine's Day", '情人节', iso(year, 2, 14))
  observance(out, year, 'easter', 'Easter', '复活节', easterSunday(year))
  observance(out, year, 'mothers', "Mother's Day", '母亲节', nthWeekday(year, 5, 0, 2))
  observance(out, year, 'fathers', "Father's Day", '父亲节', nthWeekday(year, 6, 0, 3))
  observance(out, year, 'halloween', 'Halloween', '万圣节', iso(year, 10, 31))
  observance(out, year, 'christmas-eve', 'Christmas Eve', '平安夜', iso(year, 12, 24))
  observance(out, year, 'new-year-eve', "New Year's Eve", '跨年夜', iso(year, 12, 31))
}

export function buildHolidayCatalog(from = CATALOG_YEARS.from, to = CATALOG_YEARS.to): HolidayOccurrence[] {
  const out: HolidayOccurrence[] = []
  const officialYears = new Set(CN_OFFICIAL.map((item) => item.year))
  for (const year of CN_OFFICIAL) {
    if (year.year >= from && year.year <= to) pushCnOfficial(out, year)
  }
  for (let year = from; year <= to; year += 1) {
    pushCnFestivals(out, year, officialYears)
    pushUs(out, year)
  }
  const seen = new Set<string>()
  return out.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  }).sort((a, b) => a.date.localeCompare(b.date) || a.region.localeCompare(b.region) || a.name.localeCompare(b.name, 'zh'))
}

export interface HolidayCatalogFile {
  version: string
  lunarLib: string
  generatedFrom: number
  generatedTo: number
  updatedAt: string
  occurrences: HolidayOccurrence[]
}

export function buildCatalogFile(): HolidayCatalogFile {
  return {
    version: HOLIDAY_SOURCE_VERSION,
    lunarLib: LUNAR_LIB,
    generatedFrom: CATALOG_YEARS.from,
    generatedTo: CATALOG_YEARS.to,
    updatedAt: '2026-09-24T00:00:00Z',
    occurrences: buildHolidayCatalog(),
  }
}
