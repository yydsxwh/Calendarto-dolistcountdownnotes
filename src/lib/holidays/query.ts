import catalogFile from './catalog.json'
import type { HolidayKind, HolidayOccurrence } from './build'

export interface HolidayCatalogFile {
  version: string
  lunarLib: string
  generatedFrom: number
  generatedTo: number
  updatedAt: string
  occurrences: HolidayOccurrence[]
}

export const bundledHolidays = catalogFile as HolidayCatalogFile

export interface HolidayFilter {
  showCn?: boolean
  showUs?: boolean
  showPublic?: boolean
  showTraditional?: boolean
  showAdjusted?: boolean
}

export const defaultHolidaySettings = (language = 'zh-CN', timeZone = 'Asia/Shanghai'): Required<HolidayFilter> & { updatedAt: number } => ({
  showCn: language.toLowerCase().startsWith('zh') || timeZone.startsWith('Asia/Shanghai') || timeZone.startsWith('Asia/Chongqing') || timeZone.startsWith('Asia/Urumqi'),
  showUs: false,
  showPublic: true,
  showTraditional: true,
  showAdjusted: true,
  updatedAt: 0,
})

const PUBLIC_KINDS = new Set<HolidayKind>(['public_holiday', 'day_off'])
const TRADITIONAL_KINDS = new Set<HolidayKind>(['traditional_festival', 'observance'])

export function holidayVisible(item: HolidayOccurrence, filter: HolidayFilter): boolean {
  if (item.region === 'CN' && filter.showCn === false) return false
  if (item.region === 'US' && filter.showUs === false) return false
  if (item.kind === 'adjusted_workday') return filter.showAdjusted !== false
  if (PUBLIC_KINDS.has(item.kind) && filter.showPublic === false) return false
  if (TRADITIONAL_KINDS.has(item.kind) && filter.showTraditional === false) return false
  return true
}

export function holidaysInRange(from: string, to: string, filter: HolidayFilter = {}, source: HolidayOccurrence[] = bundledHolidays.occurrences): HolidayOccurrence[] {
  return source.filter((item) => item.date >= from && item.date <= to && holidayVisible(item, filter))
}

export function holidaysOn(date: string, filter: HolidayFilter = {}, source?: HolidayOccurrence[]): HolidayOccurrence[] {
  return holidaysInRange(date, date, filter, source)
}

/** 月历格子只留短名。补班优先于放假，放假优先于纪念日。 */
export function holidayBadges(items: HolidayOccurrence[], limit = 2): { shown: HolidayOccurrence[]; extra: number } {
  const rank = (item: HolidayOccurrence) => item.kind === 'adjusted_workday' ? 0 : item.isDayOff ? 1 : item.kind === 'public_holiday' ? 2 : 3
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh'))
  return { shown: sorted.slice(0, limit), extra: Math.max(0, sorted.length - limit) }
}

export function holidayMark(item: HolidayOccurrence): string {
  if (item.isAdjustedWorkday) return '班'
  if (item.isDayOff) return '休'
  if (item.kind === 'public_holiday') return '节'
  return '念'
}

export function daysUntil(date: string, today: string): number {
  const [ay, am, ad] = date.split('-').map(Number)
  const [by, bm, bd] = today.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}

export function nextOccurrence(stableKey: string, today: string, source: HolidayOccurrence[] = bundledHolidays.occurrences): HolidayOccurrence | null {
  return source.filter((item) => item.stableKey === stableKey && item.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
}

export function catalogVersion(): string {
  return bundledHolidays.version
}

export function catalogUpdatedAt(): string {
  return bundledHolidays.updatedAt
}
