import { useCallback, useEffect, useMemo, useState } from 'react'
import { nextOccurrence, toISODate } from '../lib/dates'
import {
  createCountdown,
  createNote,
  createTodo,
  emptyData,
  exportBlob,
  loadData,
  parseImport,
  saveData,
} from '../lib/store'
import type { AppData, Countdown, Note, Priority, Todo } from '../types'

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
    }),
    [data],
  )

  const stats = useMemo(() => {
    const remaining = data.todos.filter((t) => !t.done).length
    return {
      remaining,
      countdownCount: data.countdowns.length,
      noteCount: data.notes.length,
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
    clearAll,
    downloadBackup,
    importBackup,
    itemsOnDate,
    replace,
  }
}

export type AppStore = ReturnType<typeof useAppStore>
