import { useMemo, useState } from 'react'
import { daysUntil, nextOccurrence } from '../lib/dates'
import { COUNTDOWN_COLORS, COUNTDOWN_EMOJIS } from '../types'
import type { AppStore } from '../hooks/useAppStore'

export default function Countdowns({ store }: { store: AppStore }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [color, setColor] = useState<string>(COUNTDOWN_COLORS[0])
  const [emoji, setEmoji] = useState<string>(COUNTDOWN_EMOJIS[0])
  const [repeatYearly, setRepeatYearly] = useState(false)

  const add = () => {
    if (!title.trim() || !date) return
    store.addCountdown(title, date, { color, emoji, repeatYearly })
    setTitle('')
  }

  const cards = useMemo(
    () =>
      [...store.data.countdowns]
        .map((c) => ({ ...c, next: nextOccurrence(c.date, c.repeatYearly) }))
        .sort((a, b) => a.next.localeCompare(b.next)),
    [store.data.countdowns],
  )

  return (
    <section className="view">
      <header className="view-head">
        <h2>倒数日</h2>
        <p className="muted">像 Days Matter：一张卡片，一个大数字，重要日子一眼看到。</p>
      </header>

      <div className="card">
        <div className="row wrap">
          <input
            className="input"
            placeholder="事件名称，例如「考研」"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="事件名称"
          />
          <input
            className="input slim"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="事件日期"
          />
          <select className="input slim" value={emoji} onChange={(e) => setEmoji(e.target.value)}>
            {COUNTDOWN_EMOJIS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <label className="check tiny">
            <input
              type="checkbox"
              checked={repeatYearly}
              onChange={(e) => setRepeatYearly(e.target.checked)}
            />
            <span>每年重复</span>
          </label>
          <button className="btn primary" onClick={add}>
            添加
          </button>
        </div>
        <div className="swatches" aria-label="颜色">
          {COUNTDOWN_COLORS.map((c) => (
            <button
              key={c}
              className={`swatch ${color === c ? 'on' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className="cd-grid">
        {cards.length === 0 && <p className="empty">还没有倒数日。先记下一个你在盼的日子。</p>}
        {cards.map((c) => {
          const d = daysUntil(c.next)
          const label = d === 0 ? '就是今天' : d > 0 ? '还有' : '已过'
          return (
            <article key={c.id} className="cd-card" style={{ ['--cd' as string]: c.color }}>
              <div className="cd-top">
                <span className="cd-emoji">{c.emoji}</span>
                <button className="icon-btn light" onClick={() => store.removeCountdown(c.id)} aria-label="删除">
                  ✕
                </button>
              </div>
              <h3>{c.title}</h3>
              <p className="cd-date">{c.next}{c.repeatYearly ? ' · 每年' : ''}</p>
              <div className="cd-num">
                {d === 0 ? (
                  <strong>今天</strong>
                ) : (
                  <>
                    <span>{label}</span>
                    <strong>{Math.abs(d)}</strong>
                    <span>天</span>
                  </>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
