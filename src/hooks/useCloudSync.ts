import { useCallback, useEffect, useRef, useState } from 'react'
import { SyncConflict, SyncUnauthorized, SyncUnavailable, pullRemote, pushRemote } from '../lib/cloud-sync'
import { fingerprint, isEmptyData, mergeAppData } from '../lib/sync-merge'
import { fetchSiteUser, type SiteUser } from '../lib/site-session'
import type { AppData } from '../types'

/**
 * iCloud 式的同步：登录之后改什么都自动存到云端，不用记得点保存；同时保留一个
 * 「立即同步」按钮，给想确认一下的人。本机始终是完整副本，云端断了也能照常用。
 */
export type SyncState =
  | 'starting'
  | 'signedOut'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'error'

export type CloudSync = {
  user: SiteUser | null
  state: SyncState
  lastSyncedAt: number | null
  /** 云端还没收到的本地改动。 */
  pendingChanges: boolean
  syncNow: () => void
  refreshUser: () => void
}

/** 改完停手多久才推送。太短会把每个按键都发出去，太长会让人觉得没存上。 */
const PUSH_DEBOUNCE_MS = 1200
const RETRY_BASE_MS = 4000
const RETRY_MAX_MS = 60000

type Args = {
  data: AppData
  ready: boolean
  replace: (next: AppData) => void
}

export function useCloudSync({ data, ready, replace }: Args): CloudSync {
  const [user, setUser] = useState<SiteUser | null>(null)
  const [state, setState] = useState<SyncState>('starting')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [pendingChanges, setPendingChanges] = useState(false)

  // 这些都放 ref：它们变化不应该重新触发推送，否则会自己推自己。
  const versionRef = useRef(0)
  const syncedPrintRef = useRef<string | null>(null)
  const dataRef = useRef(data)
  const busyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const retryRef = useRef(RETRY_BASE_MS)
  const hydratedRef = useRef(false)

  dataRef.current = data

  const adopt = useCallback(
    (next: AppData, version: number) => {
      versionRef.current = version
      syncedPrintRef.current = fingerprint(next)
      replace(next)
      setLastSyncedAt(Date.now())
      setPendingChanges(false)
    },
    [replace],
  )

  const settle = useCallback((version: number, print: string) => {
    versionRef.current = version
    syncedPrintRef.current = print
    setLastSyncedAt(Date.now())
  }, [])

  /** 拉云端 → 和本机合并 → 需要时推回去。登录后和点「立即同步」都走这里。 */
  const reconcile = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setState('syncing')
    try {
      const remote = await pullRemote()
      if (!remote.authenticated) {
        setUser(null)
        setState('signedOut')
        hydratedRef.current = true
        return
      }

      const local = dataRef.current
      const localEmpty = isEmptyData(local)
      const remoteEmpty = isEmptyData(remote.data)

      if (remote.data && !remoteEmpty && localEmpty) {
        // 新设备：云端就是全部真相，直接采用。
        adopt(remote.data, remote.version)
      } else if (!localEmpty && remoteEmpty) {
        // 第一次上云：把本机内容整份传上去，不覆盖任何东西。
        const result = await pushRemote(local, remote.version)
        settle(result.version, fingerprint(local))
      } else if (remote.data && !remoteEmpty && !localEmpty) {
        const merged = mergeAppData(local, remote.data)
        const mergedPrint = fingerprint(merged)
        if (mergedPrint === fingerprint(remote.data)) {
          // 云端已经包含本机的一切，只要对齐版本号。
          adopt(remote.data, remote.version)
        } else {
          const result = await pushRemote(merged, remote.version)
          adopt(merged, result.version)
        }
      } else {
        // 两边都空，记住版本号就好。
        versionRef.current = remote.version
        syncedPrintRef.current = fingerprint(local)
      }

      hydratedRef.current = true
      retryRef.current = RETRY_BASE_MS
      setState('synced')
      setPendingChanges(false)
    } catch (error) {
      hydratedRef.current = true
      if (error instanceof SyncUnauthorized) {
        setUser(null)
        setState('signedOut')
      } else if (error instanceof SyncUnavailable) {
        setState('offline')
      } else {
        setState('error')
      }
    } finally {
      busyRef.current = false
    }
  }, [adopt, settle])

  const loadUser = useCallback(async () => {
    try {
      const nextUser = await fetchSiteUser()
      setUser(nextUser)
      if (!nextUser) {
        setState('signedOut')
        hydratedRef.current = true
      }
    } catch {
      setUser(null)
      setState('offline')
      hydratedRef.current = true
    }
  }, [])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  // 登录状态确定后做第一次对账。
  useEffect(() => {
    if (!ready || !user) return
    hydratedRef.current = false
    void reconcile()
  }, [ready, user, reconcile])

  /** 本机一有改动就自动推送。这是「实时保存到云端」的那一半。 */
  useEffect(() => {
    if (!ready || !user || !hydratedRef.current) return
    const print = fingerprint(data)
    if (print === syncedPrintRef.current) return

    setPendingChanges(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      void (async () => {
        if (busyRef.current) return
        busyRef.current = true
        setState('syncing')
        const snapshot = dataRef.current
        const snapshotPrint = fingerprint(snapshot)
        try {
          const result = await pushRemote(snapshot, versionRef.current)
          settle(result.version, snapshotPrint)
          retryRef.current = RETRY_BASE_MS
          setState('synced')
          setPendingChanges(fingerprint(dataRef.current) !== snapshotPrint)
        } catch (error) {
          if (error instanceof SyncConflict) {
            // 另一台设备先写了。合并两边再推，谁的内容都不丢。
            const merged = mergeAppData(snapshot, error.remote.data ?? snapshot)
            try {
              const result = await pushRemote(merged, error.remote.version)
              adopt(merged, result.version)
              setState('synced')
            } catch {
              setState('error')
            }
          } else if (error instanceof SyncUnauthorized) {
            setUser(null)
            setState('signedOut')
          } else {
            setState('offline')
          }
        } finally {
          busyRef.current = false
        }
      })()
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [data, ready, user, adopt, settle])

  // 断线之后自己爬起来，并在回到页面时补一次同步。
  useEffect(() => {
    if (!user) return
    let retryTimer: number | null = null
    if (state === 'offline') {
      retryTimer = window.setTimeout(() => {
        retryRef.current = Math.min(retryRef.current * 2, RETRY_MAX_MS)
        void reconcile()
      }, retryRef.current)
    }
    const wake = () => {
      if (document.visibilityState === 'visible') void reconcile()
    }
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      if (retryTimer) window.clearTimeout(retryTimer)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [state, user, reconcile])

  const syncNow = useCallback(() => {
    if (!user) {
      void loadUser()
      return
    }
    void reconcile()
  }, [user, reconcile, loadUser])

  const refreshUser = useCallback(() => {
    void loadUser()
  }, [loadUser])

  return { user, state, lastSyncedAt, pendingChanges, syncNow, refreshUser }
}
