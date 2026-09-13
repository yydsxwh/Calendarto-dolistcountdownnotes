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
  type Term,
  type TimetableViewSettings,
  type Todo,
} from '../types'
import {
  currentAcademicYearStart,
  defaultTimetableView,
  defaultWeekCount,
  guessTermKind,
} from './terms'

export function createTerm(extras: Partial<Term> = {}): Term {
  const kind = extras.kind ?? guessTermKind()
  return {
    id: extras.id ?? uid(),
    yearStart: extras.yearStart ?? currentAcademicYearStart(),
    kind,
    title: extras.title,
    startDate: extras.startDate ?? '',
    weekCount: extras.weekCount ?? defaultWeekCount(kind),
  }
}

function hydrateTimetableView(raw?: Partial<TimetableViewSettings>): TimetableViewSettings {
  const base = defaultTimetableView()
  if (!raw || typeof raw !== 'object') return base
  const hiddenHours = Array.isArray(raw.hiddenHours)
    ? raw.hiddenHours.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    : base.hiddenHours
  const hiddenWeekdays = Array.isArray(raw.hiddenWeekdays)
    ? raw.hiddenWeekdays.filter((d) => d >= 1 && d <= 7)
    : base.hiddenWeekdays
  return {
    weekStartsOn: raw.weekStartsOn === 7 ? 7 : 1,
    showOffWeekCourses: Boolean(raw.showOffWeekCourses),
    hiddenHours: hiddenHours.length === 24 ? base.hiddenHours : hiddenHours,
    hiddenWeekdays: hiddenWeekdays.length === 7 ? [] : hiddenWeekdays,
    classPeriods:
      Array.isArray(raw.classPeriods) && raw.classPeriods.length > 0
        ? raw.classPeriods.map((p) => ({ start: p.start, end: p.end }))
        : base.classPeriods,
  }
}

function hydrateAppData(parsed: Partial<AppData>): AppData {
  const timetableView = hydrateTimetableView(parsed.timetableView)
  let terms = Array.isArray(parsed.terms)
    ? parsed.terms.filter((t): t is Term => Boolean(t && typeof t.id === 'string'))
    : []
  if (terms.length === 0) {
    terms = [
      createTerm({
        startDate: typeof parsed.termStart === 'string' ? parsed.termStart : '',
      }),
    ]
  }
  const currentTermId =
    (typeof parsed.currentTermId === 'string' && terms.some((t) => t.id === parsed.currentTermId)
      ? parsed.currentTermId
      : terms[0].id)
  const current = terms.find((t) => t.id === currentTermId) ?? terms[0]
  const courses = (Array.isArray(parsed.courses) ? parsed.courses : []).map((course) => ({
    ...course,
    termId: course.termId || current.id,
  }))
  return {
    todos: Array.isArray(parsed.todos) ? parsed.todos : [],
    countdowns: Array.isArray(parsed.countdowns) ? parsed.countdowns : [],
    notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    courses,
    exams: Array.isArray(parsed.exams) ? parsed.exams : [],
    reminderSettings: {
      ...defaultReminderSettings(),
      ...(parsed.reminderSettings as ReminderSettings | undefined),
    },
    terms,
    currentTermId: current.id,
    timetableView,
    termStart: current.startDate || undefined,
  }
}

export const emptyData = (): AppData => hydrateAppData({})

export function loadData(): AppData {
  if (typeof window === 'undefined') return emptyData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyData()
    return hydrateAppData(JSON.parse(raw) as Partial<AppData>)
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
  return hydrateAppData(parsed)
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
    termId: extras.termId,
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
