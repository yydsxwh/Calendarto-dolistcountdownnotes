import { useCallback, useEffect, useMemo, useState } from 'react'
import { nextOccurrence, toISODate } from '../lib/dates'
import {
  createCountdown,
  createCourse,
  createExam,
  createNote,
  createTodo,
  emptyData,
  exportBlob,
  loadData,
  parseImport,
  saveData,
} from '../lib/store'
import type {
  AppData,
  Countdown,
  Course,
  Exam,
  Note,
  Priority,
  ReminderSettings,
  Todo,
} from '../types'

export function useAppStore() {
  const [data, setData] = useState<AppData>(emptyData)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setData(loadData())
    setReady(true)
  }, [])

  useEffect(() => {
    if (ready) saveData(data)
  }, [data, ready])

  const replace = useCallback((next: AppData) => setData(next), [])

  const addTodo = useCallback((title: string, extras?: { dueDate?: string; priority?: Priority }) => {
    const todo = createTodo(title, extras)
    if (!todo.title) return
    setData((prev) => ({ ...prev, todos: [todo, ...prev.todos] }))
  }, [])

  const toggleTodo = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    }))
  }, [])

  const updateTodo = useCallback((id: string, patch: Partial<Todo>) => {
    setData((prev) => ({
      ...prev,
      todos: prev.todos.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
  }, [])

  const removeTodo = useCallback((id: string) => {
    setData((prev) => ({ ...prev, todos: prev.todos.filter((t) => t.id !== id) }))
  }, [])

  const addCountdown = useCallback(
    (
      title: string,
      date: string,
      extras?: { color?: string; emoji?: string; repeatYearly?: boolean },
    ) => {
      const item = createCountdown(title, date, extras)
      if (!item.title || !item.date) return
      setData((prev) => ({
        ...prev,
        countdowns: [...prev.countdowns, item],
      }))
    },
    [],
  )

  const updateCountdown = useCallback((id: string, patch: Partial<Countdown>) => {
    setData((prev) => ({
      ...prev,
      countdowns: prev.countdowns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  const removeCountdown = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      countdowns: prev.countdowns.filter((c) => c.id !== id),
    }))
  }, [])

  const addNote = useCallback(
    (title: string, body: string, extras?: { color?: string; date?: string }) => {
      const note = createNote(title, body, extras)
      if (!note.title && !note.body.trim()) return
      setData((prev) => ({ ...prev, notes: [note, ...prev.notes] }))
    },
    [],
  )

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setData((prev) => ({
      ...prev,
      notes: prev.notes.map((n) =>
        n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n,
      ),
    }))
  }, [])

  const removeNote = useCallback((id: string) => {
    setData((prev) => ({ ...prev, notes: prev.notes.filter((n) => n.id !== id) }))
  }, [])

  const addCourse = useCallback((name: string, extras?: Partial<Omit<Course, 'id' | 'name' | 'createdAt'>>) => {
    const course = createCourse(name, extras)
    if (!course.name) return
    setData((prev) => ({ ...prev, courses: [...prev.courses, course] }))
  }, [])

  const addCourses = useCallback((courses: Course[]) => {
    if (courses.length === 0) return
    setData((prev) => ({ ...prev, courses: [...prev.courses, ...courses] }))
  }, [])

  const updateCourse = useCallback((id: string, patch: Partial<Course>) => {
    setData((prev) => ({
      ...prev,
      courses: prev.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [])

  const removeCourse = useCallback((id: string) => {
    setData((prev) => ({ ...prev, courses: prev.courses.filter((c) => c.id !== id) }))
  }, [])

  const clearCourses = useCallback(() => {
    setData((prev) => ({ ...prev, courses: [] }))
  }, [])

  const addExam = useCallback((name: string, extras?: Partial<Omit<Exam, 'id' | 'name' | 'createdAt'>>) => {
    const exam = createExam(name, extras)
    if (!exam.name || !exam.date) return
    setData((prev) => ({
      ...prev,
      exams: [...prev.exams, exam].sort((a, b) => a.date.localeCompare(b.date)),
    }))
  }, [])

  const addExams = useCallback((exams: Exam[]) => {
    if (exams.length === 0) return
    setData((prev) => ({
      ...prev,
      exams: [...prev.exams, ...exams].sort((a, b) => a.date.localeCompare(b.date)),
    }))
  }, [])

  const updateExam = useCallback((id: string, patch: Partial<Exam>) => {
    setData((prev) => ({
      ...prev,
      exams: prev.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }, [])

  const removeExam = useCallback((id: string) => {
    setData((prev) => ({ ...prev, exams: prev.exams.filter((e) => e.id !== id) }))
  }, [])

  const updateReminderSettings = useCallback((patch: Partial<ReminderSettings>) => {
    setData((prev) => ({
      ...prev,
      reminderSettings: { ...prev.reminderSettings, ...patch },
    }))
  }, [])

  const clearAll = useCallback(() => setData(emptyData()), [])

  const downloadBackup = useCallback(() => {
    const blob = exportBlob(data)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kemiao-days-${toISODate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [data])

  const importBackup = useCallback(async (file: File) => {
    const text = await file.text()
    replace(parseImport(text))
  }, [replace])

  const itemsOnDate = useCallback(
    (iso: string) => ({
      todos: data.todos.filter((t) => t.dueDate === iso),
      countdowns: data.countdowns.filter(
        (c) => nextOccurrence(c.date, c.repeatYearly) === iso || c.date === iso,
      ),
      notes: data.notes.filter((n) => n.date === iso),
      exams: data.exams.filter((e) => e.date === iso),
    }),
    [data],
  )

  const stats = useMemo(() => {
    const remaining = data.todos.filter((t) => !t.done).length
    return {
      remaining,
      countdownCount: data.countdowns.length,
      noteCount: data.notes.length,
      courseCount: data.courses.length,
      examCount: data.exams.length,
    }
  }, [data])

  return {
    data,
    ready,
    stats,
    addTodo,
    toggleTodo,
    updateTodo,
    removeTodo,
    addCountdown,
    updateCountdown,
    removeCountdown,
    addNote,
    updateNote,
    removeNote,
    addCourse,
    addCourses,
    updateCourse,
    removeCourse,
    clearCourses,
    addExam,
    addExams,
    updateExam,
    removeExam,
    updateReminderSettings,
    clearAll,
    downloadBackup,
    importBackup,
    itemsOnDate,
    replace,
  }
}

export type AppStore = ReturnType<typeof useAppStore>
