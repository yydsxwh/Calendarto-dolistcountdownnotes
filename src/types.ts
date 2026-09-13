export type View = 'today' | 'calendar' | 'todos' | 'days' | 'notes'

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
