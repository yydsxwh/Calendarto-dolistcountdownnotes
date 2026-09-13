import {
  COURSE_COLORS,
  COUNTDOWN_COLORS,
  COUNTDOWN_EMOJIS,
  NOTE_COLORS,
  STORAGE_KEY,
  defaultReminderSettings,
  type AppData,
  type Countdown,
  type Course,
  type Exam,
  type ExamKind,
  type Note,
  type Priority,
  type ReminderSettings,
  type Todo,
} from '../types'

export const emptyData = (): AppData => ({
  todos: [],
  countdowns: [],
  notes: [],
  courses: [],
  exams: [],
  reminderSettings: defaultReminderSettings(),
  termStart: undefined,
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
      courses: Array.isArray(parsed.courses) ? parsed.courses : [],
      exams: Array.isArray(parsed.exams) ? parsed.exams : [],
      reminderSettings: {
        ...defaultReminderSettings(),
        ...(parsed.reminderSettings as ReminderSettings | undefined),
      },
      termStart: typeof parsed.termStart === 'string' && parsed.termStart ? parsed.termStart : undefined,
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
    courses: Array.isArray(parsed.courses) ? parsed.courses : [],
    exams: Array.isArray(parsed.exams) ? parsed.exams : [],
    reminderSettings: {
      ...defaultReminderSettings(),
      ...(parsed.reminderSettings as ReminderSettings | undefined),
    },
    termStart: typeof parsed.termStart === 'string' && parsed.termStart ? parsed.termStart : undefined,
  }
}

export function createCourse(
  name: string,
  extras: Partial<Omit<Course, 'id' | 'name' | 'createdAt'>> = {},
): Course {
  return {
    id: uid(),
    name: name.trim(),
    weekday: extras.weekday ?? 1,
    startTime: extras.startTime ?? '08:00',
    endTime: extras.endTime ?? '09:40',
    location: extras.location,
    teacher: extras.teacher,
    weeks: extras.weeks,
    color: extras.color ?? COURSE_COLORS[0],
    remindMinutes: extras.remindMinutes ?? 15,
    createdAt: Date.now(),
  }
}

export function createExam(
  name: string,
  extras: Partial<Omit<Exam, 'id' | 'name' | 'createdAt'>> = {},
): Exam {
  return {
    id: uid(),
    name: name.trim(),
    kind: (extras.kind as ExamKind | undefined) ?? 'final',
    date: extras.date ?? '',
    startTime: extras.startTime ?? '09:00',
    endTime: extras.endTime,
    location: extras.location,
    seat: extras.seat,
    remindMinutes: extras.remindMinutes ?? 1440,
    createdAt: Date.now(),
  }
}
