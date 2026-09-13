import { useEffect, useState } from 'react'
import { collectDueReminders, takeUnfired, type DueReminder } from '../lib/reminders'
import type { Course, Exam, ReminderSettings } from '../types'

export function useReminders(
  courses: Course[],
  exams: Exam[],
  settings: ReminderSettings,
) {
  const [banner, setBanner] = useState<DueReminder | null>(null)

  useEffect(() => {
    if (!settings.enabled) return

    const tick = () => {
      const due = takeUnfired(collectDueReminders(courses, exams, settings))
      if (due.length === 0) return
      const first = due[0]
      setBanner(first)
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        due.forEach((item) => {
          try {
            new Notification(item.title, { body: item.body, tag: item.key })
          } catch {
            // Safari / denied after grant edge cases
          }
        })
      }
    }

    tick()
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [courses, exams, settings])

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') return 'denied' as const
    if (Notification.permission === 'granted') return 'granted' as const
    return Notification.requestPermission()
  }

  const preview = (item: DueReminder) => {
    setBanner(item)
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(item.title, { body: item.body, tag: item.key })
      } catch {
        // ignore
      }
    }
  }

  return { banner, dismiss: () => setBanner(null), requestPermission, preview }
}
