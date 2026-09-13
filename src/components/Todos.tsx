import { useMemo, useState } from 'react'
import { startOfToday, toISODate } from '../lib/dates'
import type { AppStore } from '../hooks/useAppStore'
import type { Priority } from '../types'

type Filter = 'all' | 'today' | 'upcoming' | 'done'

export default function Todos({ store }: { store: AppStore }) {
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [filter, setFilter] = useState<Filter>('all')
  const today = toISODate(startOfToday())

  const add = () => {
    if (!title.trim()) return
    store.addTodo(title, { dueDate: dueDate || undefined, priority })
    setTitle('')
  }

  const visible = useMemo(() => {
    return store.data.todos.filter((t) => {
      if (filter === 'done') return t.done
      if (t.done) return false
      if (filter === 'today') return t.dueDate === today
      if (filter === 'upcoming') return Boolean(t.dueDate && t.dueDate > today)
      return true
    })
  }, [store.data.todos, filter, today])

  return (
    <section className="view">
      <header className="view-head">
        <h2>待办清单</h2>
        <p className="muted">到期日会点在日历上。灵感来自滴答清单：先写下，再排期。</p>
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
          <select
            className="input slim"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
            aria-label="优先级"
          >
            <option value="high">高优</option>
            <option value="medium">普通</option>
            <option value="low">低优</option>
          </select>
          <button className="btn primary" onClick={add}>
            添加
          </button>
        </div>

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
              <span className="meta">{t.dueDate || '未定期'}</span>
              <button className="icon-btn" onClick={() => store.removeTodo(t.id)} aria-label="删除">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
