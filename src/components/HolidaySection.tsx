import { useMemo, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { toISODate } from '../lib/dates'
import { catalogUpdatedAt, daysUntil, holidayMark, holidaysInRange, nextOccurrence } from '../lib/holidays/query'
import type { HolidayOccurrence, HolidayRegion } from '../lib/holidays/build'
import type { ReminderRule } from '../types'

function todayIso() {
  return toISODate(new Date())
}

export function HolidaySettingsCard({ store }: { store: AppStore }) {
  const settings = store.data.holidaySettings
  const set = (patch: Partial<typeof settings>) => store.updateHolidaySettings(patch)
  return (
    <div className="card">
      <h3>节日与假期</h3>
      <p className="muted">节假日数据更新时间 {catalogUpdatedAt().replace('T', ' ').replace('Z', ' UTC')}。没网时用本机缓存，不会把旧安排假装成最新官方通知。</p>
      <div className="row wrap">
        <label className="check"><input type="checkbox" checked={settings.showCn} onChange={(e) => set({ showCn: e.target.checked })} /><span>显示中国节日</span></label>
        <label className="check"><input type="checkbox" checked={settings.showUs} onChange={(e) => set({ showUs: e.target.checked })} /><span>显示美国节日</span></label>
        <label className="check"><input type="checkbox" checked={settings.showPublic} onChange={(e) => set({ showPublic: e.target.checked })} /><span>法定假日 / 放假</span></label>
        <label className="check"><input type="checkbox" checked={settings.showTraditional} onChange={(e) => set({ showTraditional: e.target.checked })} /><span>传统节日 / 文化节日</span></label>
        <label className="check"><input type="checkbox" checked={settings.showAdjusted} onChange={(e) => set({ showAdjusted: e.target.checked })} /><span>调休补班</span></label>
      </div>
    </div>
  )
}

export function HolidayDayList({ store, date }: { store: AppStore; date: string }) {
  const items = holidaysInRange(date, date, store.data.holidaySettings)
  if (!items.length) return null
  return (
    <>
      <h4>节日</h4>
      <ul className="mini-list">
        {items.map((item) => (
          <HolidayRow key={item.id} store={store} item={item} />
        ))}
      </ul>
    </>
  )
}

export function HolidayBoards({ store, mode }: { store: AppStore; mode: 'remind' | 'days' }) {
  const today = todayIso()
  const [region, setRegion] = useState<'all' | HolidayRegion>('all')
  const [kind, setKind] = useState<'all' | 'public' | 'traditional' | 'work'>('all')
  const items = useMemo(() => {
    const span = holidaysInRange(mode === 'days' ? '2024-01-01' : today, '2032-12-31', store.data.holidaySettings)
    return span.filter((item) => {
      if (region !== 'all' && item.region !== region) return false
      if (kind === 'public' && item.kind !== 'public_holiday' && item.kind !== 'day_off') return false
      if (kind === 'traditional' && item.kind !== 'traditional_festival' && item.kind !== 'observance') return false
      if (kind === 'work' && !item.isAdjustedWorkday) return false
      if (mode === 'remind' && item.kind === 'day_off') return false
      return true
    }).slice(0, mode === 'remind' ? 24 : 40)
  }, [store.data.holidaySettings, region, kind, mode, today])
  return (
    <div className="card">
      <h3>{mode === 'remind' ? '即将到来的节日' : '节日'}</h3>
      <p className="muted">系统节日只读。收藏或添加提醒只会记下你的偏好，不会改节日本身。</p>
      <div className="row wrap">
        {(['all', 'CN', 'US'] as const).map((id) => (
          <button key={id} className={`tab ${region === id ? 'active' : ''}`} onClick={() => setRegion(id)}>{id === 'all' ? '全部' : id === 'CN' ? '中国' : '美国'}</button>
        ))}
        {(['all', 'public', 'traditional', 'work'] as const).map((id) => (
          <button key={id} className={`tab ${kind === id ? 'active' : ''}`} onClick={() => setKind(id)}>{id === 'all' ? '全部类型' : id === 'public' ? '法定/放假' : id === 'traditional' ? '传统/文化' : '补班'}</button>
        ))}
      </div>
      <ul className="mini-list">
        {items.map((item) => {
          const delta = daysUntil(item.date, today)
          return (
            <li key={item.id}>
              <span>
                <b className={`holiday-mark ${item.isAdjustedWorkday ? 'work' : item.isDayOff ? 'off' : 'observe'}`}>{holidayMark(item)}</b>
                {' '}{item.date} {item.name} · {item.region === 'CN' ? '中国' : '美国'} · {delta === 0 ? '就是今天' : delta > 0 ? `还有 ${delta} 天` : `已经过去 ${-delta} 天`}
                {item.description ? ` · ${item.description}` : ''}
              </span>
              <HolidayActions store={store} item={item} />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function HolidayRow({ store, item }: { store: AppStore; item: HolidayOccurrence }) {
  return (
    <li>
      <span>
        <b className={`holiday-mark ${item.isAdjustedWorkday ? 'work' : item.isDayOff ? 'off' : 'observe'}`}>{holidayMark(item)}</b>
        {' '}{item.name}{item.description ? ` · ${item.description}` : ''}
      </span>
      <HolidayActions store={store} item={item} />
    </li>
  )
}

function HolidayActions({ store, item }: { store: AppStore; item: HolidayOccurrence }) {
  const fav = (store.data.holidayFavorites ?? []).some((row) => row.stableKey === item.stableKey)
  const addReminder = (daysBefore: number) => {
    const next = nextOccurrence(item.stableKey, todayIso()) ?? item
    const rule: ReminderRule = {
      id: crypto.randomUUID(),
      targetType: 'holiday',
      targetId: item.stableKey,
      delivery: 'notification',
      triggerMode: 'absolute',
      triggerAt: `${shiftDate(next.date, -daysBefore)}T09:00`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
      enabled: true,
      snoozeMinutes: 5,
      vibrationEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
    }
    store.saveReminderRule(rule)
  }
  return (
    <span className="row">
      <button className="btn tiny" onClick={() => store.toggleHolidayFavorite(item.stableKey, item.region)}>{fav ? '已收藏' : '收藏到我的日子'}</button>
      <button className="btn tiny" onClick={() => addReminder(1)}>提前 1 天提醒</button>
      <button className="btn tiny" onClick={() => addReminder(3)}>提前 3 天</button>
    </span>
  )
}

function shiftDate(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`
}
