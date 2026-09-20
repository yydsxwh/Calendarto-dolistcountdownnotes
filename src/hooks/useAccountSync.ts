import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppData } from '../types'
import {
  consumeAuthError,
  exchangeNativeHandoff,
  fetchSession,
  logout,
  pullDaysData,
  pushDaysData,
  readCheckpoint,
  startLogin,
  SyncError,
  writeCheckpoint,
  type AccountUser,
} from '../lib/cloud-sync'
import { planReconcile } from '../lib/sync-plan'

export type SyncStatus = 'checking' | 'signed-out' | 'syncing' | 'synced' | 'error'

const PUSH_DEBOUNCE_MS = 1200

function isEmptyData(data: AppData): boolean {
  return (
    data.todos.length === 0 &&
    data.countdowns.length === 0 &&
    data.notes.length === 0 &&
    data.courses.length === 0 &&
    data.exams.length === 0 &&
    data.selfSchedules.length === 0 &&
    data.calendarEvents.length === 0 &&
    (data.recurringReminders?.length ?? 0) === 0
  )
}

const snapshotOf = (value: AppData) => JSON.stringify(value)

/**
 * 统一账号登录状态 + 跨设备同步引擎。
 *
 * 必须挂在应用顶层，而不是挂在「更多」下拉菜单里：菜单关掉组件就会卸载，
 * 用户不打开菜单的改动就永远同步不上去。这里只和日事自己的后端通信，
 * 账号中心的授权跳转、令牌交换和身份校验都在服务端完成。
 */
export function useAccountSync(data: AppData, replace: (next: AppData) => void, appReady = true) {
  const [user, setUser] = useState<AccountUser | null>(null)
  const [status, setStatus] = useState<SyncStatus>('checking')
  const [notice, setNotice] = useState<string | null>(null)

  const latestData = useRef(data)
  latestData.current = data

  // 版本号只放在 ref 里。放进 state 并列入 effect 依赖，会让每次推送成功
  // 都触发下一次推送——一个永不停止的循环，并发推送还会互相 409。
  const versionRef = useRef(0)
  // 服务端在 versionRef 这个版本上到底存了什么。
  const syncedSnapshot = useRef<string | null>(null)
  // 首次对账完成前不推送，否则会把空白状态写上云。
  const ready = useRef(false)
  // 同一时刻只允许一个同步动作，避免对账与防抖推送互相踩。
  const busy = useRef(false)
  const pushTimer = useRef<number | null>(null)

  const remember = useCallback((accountUserId: string, version: number, snapshot: string) => {
    versionRef.current = version
    syncedSnapshot.current = snapshot
    writeCheckpoint({ accountUserId, version, snapshot })
  }, [])

  const adopt = useCallback(
    (accountUserId: string, remote: Partial<AppData> | null, remoteVersion: number) => {
      if (!remote) return
      replace(remote as AppData)
      remember(accountUserId, remoteVersion, snapshotOf(remote as AppData))
    },
    [remember, replace],
  )

  const publish = useCallback(
    async (accountUserId: string, baseVersion: number) => {
      const snapshot = snapshotOf(latestData.current)
      const written = await pushDaysData(latestData.current, baseVersion)
      remember(accountUserId, written.version, snapshot)
    },
    [remember],
  )

  /** 完整对账：确认登录状态，把本机与云端拉齐。 */
  const sync = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setStatus('syncing')

    try {
      const session = await fetchSession()
      if (!session.authenticated || session.user === null) {
        setUser(null)
        setStatus('signed-out')
        return
      }
      setUser(session.user)

      const account = session.user.accountUserId
      const remote = await pullDaysData()
      const checkpoint = readCheckpoint()
      const localSnapshot = snapshotOf(latestData.current)

      const plan = planReconcile({
        accountUserId: account,
        remoteVersion: remote.version,
        localSnapshot,
        localIsEmpty: isEmptyData(latestData.current),
        checkpoint,
      })

      versionRef.current = remote.version
      syncedSnapshot.current = plan.action === 'noop' ? localSnapshot : null

      if (plan.action === 'upload') {
        await publish(account, plan.baseVersion)
      } else if (plan.action === 'adopt') {
        adopt(account, remote.data, remote.version)
      } else if (plan.action === 'ask') {
        // 两边都有上次同步之后的改动，或这台设备第一次连上一个已有数据的
        // 账号。不静默覆盖任何一边，交给用户决定。
        const useRemote = window.confirm(
          plan.reason === 'diverged'
            ? '这个账号在其他设备上有更新，本机也有改动。\n\n确定：用云端数据覆盖本机。\n取消：保留本机数据并上传覆盖云端。'
            : '这个账号在其他设备上已有数据。\n\n确定：用云端数据覆盖本机。\n取消：保留本机数据并上传覆盖云端。',
        )
        if (useRemote) adopt(account, remote.data, remote.version)
        else await publish(account, remote.version)
      }

      setStatus('synced')
      setNotice(null)
    } catch (error) {
      if (error instanceof SyncError && error.code === 'unauthenticated') {
        setUser(null)
        setStatus('signed-out')
        return
      }
      setStatus('error')
      setNotice(error instanceof SyncError ? error.message : '同步失败，请稍后再试。')
    } finally {
      ready.current = true
      busy.current = false
    }
  }, [adopt, publish])

  useEffect(() => {
    if (!appReady) return
    const authError = consumeAuthError()
    if (authError) setNotice(authError)

    // 原生外壳登录后带回的一次性交接码。
    const handoff = new URLSearchParams(window.location.search).get('handoff')
    if (handoff) {
      void exchangeNativeHandoff(handoff)
        .then(() => sync())
        .catch(() => {
          ready.current = true
          setStatus('signed-out')
          setNotice('客户端登录凭据已失效，请重新登录。')
        })
      return
    }

    void sync()
  }, [sync, appReady])

  // 本机数据变化后回推。依赖里只有 data 和 user：版本号走 ref，
  // 所以推送成功不会把自己再触发一遍。
  useEffect(() => {
    if (!appReady || user === null) return
    if (pushTimer.current !== null) window.clearTimeout(pushTimer.current)

    pushTimer.current = window.setTimeout(() => {
      void (async () => {
        if (!ready.current || busy.current) return
        if (snapshotOf(latestData.current) === syncedSnapshot.current) return

        busy.current = true
        setStatus('syncing')
        try {
          await publish(user.accountUserId, versionRef.current)
          setStatus('synced')
          setNotice(null)
        } catch (error) {
          if (error instanceof SyncError && error.code === 'version_conflict') {
            // 别的设备先写了。拉回服务端快照再让用户决定，不要硬覆盖。
            busy.current = false
            await sync()
            return
          }
          if (error instanceof SyncError && error.code === 'unauthenticated') {
            setUser(null)
            setStatus('signed-out')
            return
          }
          setStatus('error')
          setNotice(error instanceof SyncError ? error.message : '同步失败，请稍后再试。')
        } finally {
          busy.current = false
        }
      })()
    }, PUSH_DEBOUNCE_MS)

    return () => {
      if (pushTimer.current !== null) window.clearTimeout(pushTimer.current)
    }
  }, [data, user, publish, sync, appReady])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } finally {
      // 退出日事不等于退出统一账号：只清掉日事这一侧的登录状态，
      // 本机数据原样保留。
      versionRef.current = 0
      syncedSnapshot.current = null
      setUser(null)
      setStatus('signed-out')
      setNotice('已退出日事。本机数据仍然保留。')
    }
  }, [])

  return { user, status, notice, sync, signOut, startLogin }
}

export type AccountSyncState = ReturnType<typeof useAccountSync>
