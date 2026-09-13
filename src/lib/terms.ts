import { DEFAULT_PERIODS } from './periods'
import type { Term, TermKind, TimetableViewSettings } from '../types'

export const TERM_KIND_LABEL: Record<TermKind, string> = {
  fall: '第1学期',
  spring: '第2学期',
  summer: '暑假小学期',
  winter: '寒假小学期',
  practice: '社会实践',
  intern: '实习项目',
}

export const TERM_KINDS: TermKind[] = [
  'fall',
  'spring',
  'summer',
  'winter',
  'practice',
  'intern',
]

export function currentAcademicYearStart(date = new Date()): number {
  return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1
}

export function guessTermKind(date = new Date()): TermKind {
  const month = date.getMonth() + 1
  if (month >= 8 && month <= 12) return 'fall'
  if (month >= 2 && month <= 6) return 'spring'
  if (month === 7) return 'summer'
  return 'winter'
}

export function defaultWeekCount(kind: TermKind): number {
  if (kind === 'summer' || kind === 'winter') return 4
  if (kind === 'practice' || kind === 'intern') return 8
  return 16
}

export function termLabel(term: Term): string {
  if (term.title?.trim()) return term.title.trim()
  return `${term.yearStart}-${term.yearStart + 1}学年 ${TERM_KIND_LABEL[term.kind]}`
}

export function defaultTimetableView(): TimetableViewSettings {
  return {
    weekStartsOn: 1,
    showOffWeekCourses: false,
    hiddenHours: [0, 1, 2, 3, 4, 5],
    hiddenWeekdays: [],
    classPeriods: DEFAULT_PERIODS.map((p) => ({ ...p })),
  }
}

export function academicYearOptions(around = currentAcademicYearStart()): number[] {
  return [around - 1, around, around + 1, around + 2]
}
