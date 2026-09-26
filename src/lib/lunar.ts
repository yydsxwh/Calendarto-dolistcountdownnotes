import { Solar } from 'lunar-javascript'

/** 本地日历日期的农历月日，不转 UTC。 */
export function lunarLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return ''
  try {
    const lunar = Solar.fromYmd(Number(match[1]), Number(match[2]), Number(match[3])).getLunar()
    return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
  } catch {
    return ''
  }
}
