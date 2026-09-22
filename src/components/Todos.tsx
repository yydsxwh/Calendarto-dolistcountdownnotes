import { useMemo, useState } from 'react'
import { formatTodoTimeRange } from '../lib/calendar-events'
import { startOfToday, toISODate } from '../lib/dates'
import type { AppStore } from '../hooks/useAppStore'
import type { Priority } from '../types'

const REMINDERS = [
  [0, '不提醒'],
  [5, '提前5分钟'],
  [10, '提前10分钟'],
  [15, '提前15分钟'],
  [30, '提前30分钟'],
  [60, '提前1小时'],
  [120, '提前2小时'],
  [1440, '提前1天'],
] as const

type Filter = 'all' | 'today' | 'upcoming' | 'done'

export default function Todos({
  store,
  embedded = false,
}: {
  store: AppStore
  /** 嵌在「我的一天」里时不再重复一层 view 外壳 */
  embedded?: boolean
}) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [dueEndTime, setDueEndTime] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [remind, setRemind] = useState(15)
  const [filter, setFilter] = useState<Filter>('all')
  const today = toISODate(startOfToday())

  const add = () => {
    if (!title.trim()) return
    store.addTodo(title, {
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      dueEndTime: dueEndTime || undefined,
      priority,
      remindMinutes: dueDate && dueTime ? remind : 0,
    })
    setTitle('')
    setDueTime('')
    setDueEndTime('')
  }

  const visible = useMemo(
    () =>
      store.data.todos.filter((t) => {
        if (filter === 'done') return t.done
        if (t.done) return false
        if (filter === 'today') return t.dueDate === today
        if (filter === 'upcoming') return Boolean(t.dueDate && t.dueDate > today)
        return true
      }),
    [store.data.todos, filter, today],
  )

  const Wrapper = embedded ? 'div' : 'section'
  return (
    <Wrapper className={embedded ? 'todo-panel' : 'view'}>
      <header className="view-head">
        <h2>待办清单</h2>
        <p className="muted">
          待办是可勾选的任务清单；若需要「从几点到几点」的日程块，请到日历添加<strong>日程</strong>。
          这里也可填开始与结束时间，方便对照安排。
        </p>
      </header>
      <div className="card">
        <div className="row wrap">
          <input
            className="input"
            placeholder="添加待办，例如「交实验报告」"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            aria-label="新待办"
          />
          <input
            className="input slim"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="到期日"
          />
          <input
            className="input slim"
            type="time"
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
            aria-label="开始时间"
          />
          <input
            className="input slim"
            type="time"
            value={dueEndTime}
            onChange={(e) => setDueEndTime(e.target.value)}
            aria-label="结束时间"
          />
          <select
            className="input slim"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="重要级别"
          >
            <option value="high">🔴 重要</option>
            <option value="medium">🟡 普通</option>
            <option value="low">⚪ 不重要</option>
          </select>
          <select
            className="input slim"
            value={remind}
            onChange={(e) => setRemind(Number(e.target.value))}
            aria-label="提醒时间"
          >
            {REMINDERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn primary" onClick={add}>
            添加
          </button>
        </div>
        <p className="muted">
          通知按「开始时间」提前触发；结束时间仅用于展示时间段。手机 App 会使用系统本地通知。
        </p>
        <div className="tabs">
          {(
            [
              ['all', '未完成'],
              ['today', '今天'],
              ['upcoming', '即将到期'],
              ['done', '已完成'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`tab ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="item-list">
          {visible.length === 0 && <li className="empty">这一栏是空的</li>}
          {visible.map((t) => (
            <li key={t.id} className={`item ${t.done ? 'done' : ''}`}>
              <label className="check">
                <input type="checkbox" checked={t.done} onChange={() => store.toggleTodo(t.id)} />
                <span className={`prio ${t.priority}`} />
                <span>{t.title}</span>
              </label>
              <span className="meta">
                {t.dueDate || '未定期'}
                {formatTodoTimeRange(t) ? ` ${formatTodoTimeRange(t)}` : ''}
                {t.remindMinutes > 0
                  ? ` · 提前${t.remindMinutes >= 1440 ? '1天' : `${t.remindMinutes}分`}`
                  : ''}
              </span>
              <button className="icon-btn" onClick={() => store.removeTodo(t.id)} aria-label="删除">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Wrapper>
  )
}
