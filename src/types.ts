export type View = 'today' | 'calendar' | 'todos' | 'schedule' | 'days' | 'notes'

export type ExamKind = 'midterm' | 'final' | 'makeup' | 'other'

export interface Course {
  id: string
  name: string
  weekday: number
  startTime: string
  endTime: string
  location?: string
  teacher?: string
  weeks?: string
  color: string
  remindMinutes: number
  createdAt: number
}

export interface Exam {
  id: string
  name: string
  kind: ExamKind
  date: string
  startTime: string
  endTime?: string
  location?: string
  seat?: string
  remindMinutes: number
  createdAt: number
}

export interface ReminderSettings {
  enabled: boolean
  classDefaultMinutes: number
  examDefaultMinutes: number
  examAlsoHourBefore: boolean
}

export const COURSE_COLORS = [
  '#0ea5e9',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#14b8a6',
  '#6366f1',
] as const

export const defaultReminderSettings = (): ReminderSettings => ({
  enabled: true,
  classDefaultMinutes: 15,
  examDefaultMinutes: 1440,
  examAlsoHourBefore: true,
})

export const EXAM_KIND_LABEL: Record<ExamKind, string> = {
  midterm: '期中',
  final: '期末',
  makeup: '补考',
  other: '其他',
}

export type Priority = 'high' | 'medium' | 'low'

export interface Todo {
  id: string
  title: string
  done: boolean
  dueDate?: string
  priority: Priority
  createdAt: number
}

export interface Countdown {
  id: string
  title: string
  date: string
  color: string
  emoji: string
  repeatYearly: boolean
  createdAt: number
}

export interface Note {
  id: string
  title: string
  body: string
  color: string
  pinned: boolean
  date?: string
  updatedAt: number
}

export interface AppData {
  todos: Todo[]
  countdowns: Countdown[]
  notes: Note[]
  courses: Course[]
  exams: Exam[]
  reminderSettings: ReminderSettings
}

export const NOTE_COLORS = [
  '#fef08a',
  '#fecdd3',
  '#bbf7d0',
  '#bae6fd',
  '#ddd6fe',
  '#fed7aa',
] as const

export const COUNTDOWN_COLORS = [
  '#0ea5e9',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#10b981',
  '#ec4899',
] as const

export const COUNTDOWN_EMOJIS = ['🎯', '🎂', '✈️', '📚', '💍', '🎓', '🏠', '🎉'] as const

export const STORAGE_KEY = 'kemiao-days-v1'
