import {
  COUNTDOWN_COLORS,
  COUNTDOWN_EMOJIS,
  NOTE_COLORS,
  STORAGE_KEY,
  type AppData,
  type Countdown,
  type Note,
  type Priority,
  type Todo,
} from '../types'

export const emptyData = (): AppData => ({
  todos: [],
  countdowns: [],
  notes: [],
})

export function loadData(): AppData {
  if (typeof window === 'undefined') return emptyData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return {
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      countdowns: Array.isArray(parsed.countdowns) ? parsed.countdowns : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    }
  } catch {
    return emptyData()
  }
}

export function saveData(data: AppData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function uid(): string {
  return crypto.randomUUID()
}

export function createTodo(
  title: string,
  extras: { dueDate?: string; priority?: Priority } = {},
): Todo {
  return {
    id: uid(),
    title: title.trim(),
    done: false,
    dueDate: extras.dueDate,
    priority: extras.priority ?? 'medium',
    createdAt: Date.now(),
  }
}

export function createCountdown(
  title: string,
  date: string,
  extras: { color?: string; emoji?: string; repeatYearly?: boolean } = {},
): Countdown {
  return {
    id: uid(),
    title: title.trim(),
    date,
    color: extras.color ?? COUNTDOWN_COLORS[0],
    emoji: extras.emoji ?? COUNTDOWN_EMOJIS[0],
    repeatYearly: extras.repeatYearly ?? false,
    createdAt: Date.now(),
  }
}

export function createNote(
  title: string,
  body: string,
  extras: { color?: string; date?: string } = {},
): Note {
  return {
    id: uid(),
    title: title.trim(),
    body,
    color: extras.color ?? NOTE_COLORS[0],
    pinned: false,
    date: extras.date,
    updatedAt: Date.now(),
  }
}

export function exportBlob(data: AppData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
}

export function parseImport(text: string): AppData {
  const parsed = JSON.parse(text) as Partial<AppData>
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('无效的备份文件')
  }
  return {
    todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    countdowns: Array.isArray(parsed.countdowns) ? parsed.countdowns : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
  }
}
