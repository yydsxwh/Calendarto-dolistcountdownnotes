import { useCallback, useEffect, useState } from 'react'

/**
 * Persist a piece of React state to localStorage so it survives reloads.
 * Falls back gracefully to the initial value if storage is unavailable.
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  const readValue = useCallback((): T => {
    if (typeof window === 'undefined') return initialValue
    try {
      const item = window.localStorage.getItem(key)
      return item ? (JSON.parse(item) as T) : initialValue
    } catch {
      return initialValue
    }
  }, [key, initialValue])

  const [storedValue, setStoredValue] = useState<T>(readValue)

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue))
    } catch {
      // Ignore write errors (e.g. private mode / quota exceeded).
    }
  }, [key, storedValue])

  return [storedValue, setStoredValue] as const
}
