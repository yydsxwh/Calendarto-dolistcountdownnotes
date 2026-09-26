import { useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { describeFire } from '../lib/reminder-rules'
import type { ReminderRule } from '../types'

const OFFSETS = [0, 5, 10, 30, 60, 1440]

export function ReminderRulesEditor({
  store,
  targetType,
  targetId,
  startLabel,
  start,
}: {
  store: AppStore
  targetType: ReminderRule['targetType']
  targetId: string
  startLabel: string
  start: Date | null
}) {
  const rules = (store.data.reminderRules ?? []).filter((rule) => rule.targetType === targetType && rule.targetId === targetId)
  const [delivery, setDelivery] = useState<ReminderRule['delivery']>('alarm')
  const [offset, setOffset] = useState(5)
  const [absolute, setAbsolute] = useState('')
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const add = (mode: ReminderRule['triggerMode']) => {
    const rule: ReminderRule = {
      id: crypto.randomUUID(),
      targetType,
      targetId,
      delivery,
      triggerMode: mode,
      offsetMinutes: mode === 'relative' ? offset : undefined,
      triggerAt: mode === 'absolute' ? absolute : undefined,
      timezone: zone,
      enabled: true,
      snoozeMinutes: 5,
      vibrationEnabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 1,
    }
    if (mode === 'relative' && start) {
      const fire = new Date(start.getTime() - offset * 60000)
      if (fire.getTime() <= Date.now()) return
    }
    if (mode === 'absolute') {
      const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(absolute) ? `${absolute}:00` : absolute
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) return
      rule.triggerAt = normalized
    }
    store.saveReminderRule(rule)
    setAbsolute('')
  }
  return (
    <details className="reminder-rules">
      <summary>提醒与闹钟</summary>
      <p className="muted">精确响铃由已登录且授权的 Android 客户端执行。网页可以保存规则，但不能在浏览器关闭后保证准时。</p>
      <p className="muted">事项时间：{startLabel}</p>
      <div className="row wrap">
        <select className="input slim" value={delivery} onChange={(e) => setDelivery(e.target.value as ReminderRule['delivery'])} aria-label="提醒方式">
          <option value="notification">普通通知</option>
          <option value="alarm">闹钟</option>
        </select>
        <select className="input slim" value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="提前多久">
          {OFFSETS.map((minutes) => <option key={minutes} value={minutes}>{minutes === 0 ? '准时' : minutes >= 60 ? `提前 ${minutes / 60} 小时` : `提前 ${minutes} 分钟`}</option>)}
        </select>
        <button className="btn tiny" type="button" onClick={() => add('relative')}>添加相对提醒</button>
      </div>
      <div className="row wrap">
        <input className="input slim" type="datetime-local" step="1" value={absolute} onChange={(e) => setAbsolute(e.target.value)} aria-label="绝对响铃时间" />
        <button className="btn tiny" type="button" onClick={() => add('absolute')}>添加指定时间</button>
      </div>
      <ul className="mini-list">
        {rules.map((rule) => {
          const described = start ? describeFire(rule, start) : { label: rule.triggerAt || '待计算', past: false }
          return (
            <li key={rule.id}>
              <span>{rule.delivery === 'alarm' ? '闹钟' : '通知'} · {described.label}{described.past ? ' · 这个时间已经过去' : ''}</span>
              <span className="row">
                <button className="btn tiny" type="button" onClick={() => store.saveReminderRule({ ...rule, enabled: !rule.enabled })}>{rule.enabled ? '关闭' : '开启'}</button>
                <button className="icon-btn" type="button" onClick={() => store.removeReminderRule(rule.id)} aria-label="删除提醒">✕</button>
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
