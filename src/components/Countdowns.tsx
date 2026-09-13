import { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface Countdown {
  id: string
  title: string
  date: string // YYYY-MM-DD
}

function daysBetween(target: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const t = new Date(target + 'T00:00:00')
  const diff = Math.round((t.getTime() - today.getTime()) / 86400000)
  return diff
}

export default function Countdowns() {
  const [items, setItems] = useLocalStorage<Countdown[]>('countdowns', [])
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')

  const add = () => {
    if (!title.trim() || !date) return
    setItems(
      [...items, { id: crypto.randomUUID(), title: title.trim(), date }].sort(
        (a, b) => a.date.localeCompare(b.date),
      ),
    )
    setTitle('')
    setDate('')
  }

  const remove = (id: string) => setItems(items.filter((i) => i.id !== id))

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>倒数日</h2>
        <span className="pill">{items.length} 个事件</span>
      </header>

      <div className="row wrap">
        <input
          className="input"
          placeholder="事件名称，例如「春节」"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="事件名称"
        />
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="事件日期"
        />
        <button className="btn primary" onClick={add}>
          添加
        </button>
      </div>

      <ul className="list">
        {items.length === 0 && <li className="empty">还没有倒数日事件</li>}
        {items.map((i) => {
          const d = daysBetween(i.date)
          const label =
            d === 0 ? '就是今天' : d > 0 ? `还有 ${d} 天` : `已过 ${-d} 天`
          return (
            <li key={i.id} className="list-item">
              <div className="cd-info">
                <span className="cd-title">{i.title}</span>
                <span className="cd-date">{i.date}</span>
              </div>
              <span
                className={`cd-days ${d > 0 ? 'future' : d === 0 ? 'today' : 'past'}`}
              >
                {label}
              </span>
              <button
                className="icon-btn"
                onClick={() => remove(i.id)}
                aria-label="删除"
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
