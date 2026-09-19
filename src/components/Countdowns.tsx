import { useMemo, useState } from 'react'
import { dayFacts, formatShort } from '../lib/dates'
import { COUNTDOWN_COLORS, COUNTDOWN_EMOJIS } from '../types'
import type { AppStore } from '../hooks/useAppStore'

type Filter = 'all' | 'upcoming' | 'passed'

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'upcoming', label: '还没到' },
  { id: 'passed', label: '已经过去' },
]

export default function Countdowns({ store }: { store: AppStore }) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [color, setColor] = useState<string>(COUNTDOWN_COLORS[0])
  const [emoji, setEmoji] = useState<string>(COUNTDOWN_EMOJIS[0])
  const [repeatYearly, setRepeatYearly] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  const add = () => {
    if (!title.trim() || !date) return
    store.addCountdown(title, date, { color, emoji, repeatYearly })
    setTitle('')
  }

  const cards = useMemo(
    () =>
      store.data.countdowns
        .map((c) => ({ ...c, facts: dayFacts(c.date, c.repeatYearly) }))
        // 快到的排前面；纯纪念日（没有未来场次）按最近发生的排在后面。
        .sort((a, b) => {
          if (a.facts.hasUpcoming !== b.facts.hasUpcoming) return a.facts.hasUpcoming ? -1 : 1
          if (a.facts.hasUpcoming) return a.facts.daysToNext - b.facts.daysToNext
          return a.facts.elapsedDays - b.facts.elapsedDays
        }),
    [store.data.countdowns],
  )

  const visible = cards.filter((c) =>
    filter === 'all' ? true : filter === 'upcoming' ? c.facts.hasUpcoming : c.facts.originPassed,
  )

  return (
    <section className="view">
      <header className="view-head">
        <h2>倒数日 · 纪念日</h2>
        <p className="muted">
          一张卡片同时回答两件事：还有多少天到来，以及已经过去了多少天。生日、节日、
          出生那天、公司成立那天，都记在这里。
        </p>
      </header>

      <div className="card">
        <div className="row wrap">
          <input
            className="input"
            placeholder="事件名称，例如「我的生日」「公司成立」"
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
        <p className="muted tiny">
          日期可以填未来，也可以填过去。填过去的日子并勾上「每年重复」，就同时是纪念日和下一个周年倒数。
        </p>
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

      <div className="seg" role="tablist" aria-label="筛选">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={filter === f.id ? 'on' : ''}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="cd-grid">
        {visible.length === 0 && (
          <p className="empty">
            {cards.length === 0
              ? '还没有日子。记下一个你在盼的，或者一个想一直记着的。'
              : '这个筛选下没有日子。'}
          </p>
        )}
        {visible.map((c) => {
          const f = c.facts
          const isToday = f.hasUpcoming && f.daysToNext === 0
          return (
            <article key={c.id} className="cd-card" style={{ ['--cd' as string]: c.color }}>
              <div className="cd-top">
                <span className="cd-emoji">{c.emoji}</span>
                <button
                  className="icon-btn light"
                  onClick={() => store.removeCountdown(c.id)}
                  aria-label="删除"
                >
                  ✕
                </button>
              </div>
              <h3>{c.title}</h3>
              <p className="cd-date">
                {c.repeatYearly ? `${formatShort(c.date)} · 每年` : c.date}
                {f.originPassed && c.repeatYearly && f.upcomingOrdinal > 0 && ` · 第 ${f.upcomingOrdinal} 年`}
              </p>

              <div className="cd-num">
                {isToday ? (
                  <strong>就是今天</strong>
                ) : f.hasUpcoming ? (
                  <>
                    <span>还有</span>
                    <strong>{f.daysToNext}</strong>
                    <span>天</span>
                  </>
                ) : (
                  <>
                    <span>已过</span>
                    <strong>{f.elapsedDays}</strong>
                    <span>天</span>
                  </>
                )}
              </div>

              {/* 过去的日子同时告诉你累计了多久；重复的日子再补一句下一次什么时候。 */}
              {f.originPassed && (
                <p className="cd-foot">
                  距 {c.date} 已经过去 {f.elapsedDays} 天
                  {f.yearsSince > 0 && `（满 ${f.yearsSince} 年）`}
                  {c.repeatYearly && !isToday && f.hasUpcoming && ` · 下一次 ${f.next}`}
                </p>
              )}
              {!f.originPassed && c.repeatYearly && !isToday && (
                <p className="cd-foot">下一次 {f.next}</p>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
