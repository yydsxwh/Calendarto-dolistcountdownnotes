/** 国内高校常见 45 分钟小节，用于表格只写「第 N 节」时补全时间。 */
export const DEFAULT_PERIODS: { start: string; end: string }[] = [
  { start: '08:00', end: '08:45' },
  { start: '08:55', end: '09:40' },
  { start: '10:00', end: '10:45' },
  { start: '10:55', end: '11:40' },
  { start: '14:00', end: '14:45' },
  { start: '14:55', end: '15:40' },
  { start: '16:00', end: '16:45' },
  { start: '16:55', end: '17:40' },
  { start: '19:00', end: '19:45' },
  { start: '19:55', end: '20:40' },
  { start: '20:50', end: '21:35' },
]

export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const

export function padTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function parseClock(raw: string): string | null {
  const text = raw.replace(/[：.]/g, ':').trim()
  const match = text.match(/\b(\d{1,2}):(\d{2})\b/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return padTime(h, m)
}

export function parseTimeRange(raw: string): { start: string; end: string } | null {
  const text = raw.replace(/[：.]/g, ':').replace(/[～~—–－]/g, '-')
  const match = text.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/)
  if (!match) return null
  const start = parseClock(match[1])
  const end = parseClock(match[2])
  if (!start || !end) return null
  return { start, end }
}

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function durationMinutes(start: string, end: string): number {
  return Math.max(0, minutesOf(end) - minutesOf(start))
}

export function formatDuration(start: string, end: string): string {
  const mins = durationMinutes(start, end)
  if (mins >= 60 && mins % 60 === 0) return `${mins / 60} 小时`
  if (mins >= 60) return `${Math.floor(mins / 60)} 小时 ${mins % 60} 分`
  return `${mins} 分钟`
}

export function periodRange(from: number, to: number): { start: string; end: string } | null {
  const a = DEFAULT_PERIODS[from - 1]
  const b = DEFAULT_PERIODS[to - 1]
  if (!a || !b) return null
  return { start: a.start, end: b.end }
}

export function parsePeriodHint(raw: string): { start: string; end: string } | null {
  const ranged = parseTimeRange(raw)
  if (ranged) return ranged
  const span = raw.match(/第?\s*(\d{1,2})\s*[-~到至]\s*(\d{1,2})\s*节/)
  if (span) return periodRange(Number(span[1]), Number(span[2]))
  const single = raw.match(/第?\s*(\d{1,2})\s*节/)
  if (single) return periodRange(Number(single[1]), Number(single[1]))
  return null
}

export function parseWeekday(raw: string): number | null {
  const text = raw.trim()
  const named: Record<string, number> = {
    周一: 1,
    周二: 2,
    周三: 3,
    周四: 4,
    周五: 5,
    周六: 6,
    周日: 7,
    周天: 7,
    星期一: 1,
    星期二: 2,
    星期三: 3,
    星期四: 4,
    星期五: 5,
    星期六: 6,
    星期日: 7,
    星期天: 7,
    mon: 1,
    monday: 1,
    tue: 2,
    tues: 2,
    tuesday: 2,
    wed: 3,
    wednesday: 3,
    thu: 4,
    thursday: 4,
    fri: 5,
    friday: 5,
    sat: 6,
    saturday: 6,
    sun: 7,
    sunday: 7,
  }
  const lower = text.toLowerCase()
  if (named[text] != null) return named[text]
  if (named[lower] != null) return named[lower]
  const week = text.match(/(?:周|星期|礼拜)\s*([一二三四五六七日天1-7])/)
  if (week) {
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      日: 7,
      天: 7,
      '1': 1,
      '2': 2,
      '3': 3,
      '4': 4,
      '5': 5,
      '6': 6,
      '7': 7,
    }
    return map[week[1]] ?? null
  }
  return null
}

export function jsWeekday(date = new Date()): number {
  const day = date.getDay()
  return day === 0 ? 7 : day
}

export function combineDateTime(iso: string, hhmm: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  const [hh, mm] = hhmm.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm, 0, 0)
}
