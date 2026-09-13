import { daysUntil, formatLong, nextOccurrence, startOfToday, toISODate } from '../lib/dates'
import type { AppStore } from '../hooks/useAppStore'
import type { View } from '../types'

export default function Today({
  store,
  onOpen,
}: {
  store: AppStore
  onOpen: (view: View) => void
}) {
  const today = startOfToday()
  const iso = toISODate(today)
  const hour = new Date().getHours()
  const hello = hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好'

  const overdue = store.data.todos.filter(
    (t) => !t.done && t.dueDate && t.dueDate < iso,
  )
  const todayTodos = store.data.todos.filter((t) => !t.done && t.dueDate === iso)
  const inbox = store.data.todos.filter((t) => !t.done && !t.dueDate)

  const upcoming = [...store.data.countdowns]
    .map((c) => ({ ...c, next: nextOccurrence(c.date, c.repeatYearly) }))
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, 3)

  const pinned = store.data.notes.filter((n) => n.pinned).slice(0, 4)

  return (
    <section className="view">
      <header className="view-head">
        <p className="kicker">{hello}</p>
        <h2>{formatLong(today)}</h2>
        <p className="muted">
          {store.stats.remaining} 件待办 · {store.stats.countdownCount} 个倒数日 ·{' '}
          {store.stats.noteCount} 条便签
        </p>
      </header>

      {upcoming[0] && (
        <article
          className="hero-countdown"
          style={{ ['--cd' as string]: upcoming[0].color }}
        >
          <div>
            <p className="kicker">最近的倒数日</p>
            <h3>
              {upcoming[0].emoji} {upcoming[0].title}
            </h3>
            <p className="muted">{upcoming[0].next}</p>
          </div>
          <div className="hero-num">
            {(() => {
              const d = daysUntil(upcoming[0].next)
              if (d === 0) return <span>今天</span>
              return (
                <>
                  <strong>{Math.abs(d)}</strong>
                  <em>{d > 0 ? '天后' : '天前'}</em>
                </>
              )
            })()}
          </div>
        </article>
      )}

      <div className="dash-grid">
        <article className="card">
          <div className="card-head">
            <h3>今天要做</h3>
            <button className="link" onClick={() => onOpen('todos')}>
              全部待办
            </button>
          </div>
          {overdue.length > 0 && (
            <ul className="mini-list">
              {overdue.map((t) => (
                <li key={t.id} className="overdue">
                  <label>
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => store.toggleTodo(t.id)}
                    />
                    <span>{t.title}</span>
                  </label>
                  <em>逾期 {t.dueDate}</em>
                </li>
              ))}
            </ul>
          )}
          {todayTodos.length === 0 && overdue.length === 0 && inbox.length === 0 && (
            <p className="empty-inline">今天很清闲。去添加一件待办吧。</p>
          )}
          <ul className="mini-list">
            {todayTodos.map((t) => (
              <li key={t.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => store.toggleTodo(t.id)}
                  />
                  <span>{t.title}</span>
                </label>
              </li>
            ))}
            {inbox.slice(0, 5).map((t) => (
              <li key={t.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => store.toggleTodo(t.id)}
                  />
                  <span>{t.title}</span>
                </label>
                <em>未定期</em>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <div className="card-head">
            <h3>倒数日</h3>
            <button className="link" onClick={() => onOpen('days')}>
              管理
            </button>
          </div>
          {upcoming.length === 0 && (
            <p className="empty-inline">还没有倒数日。考试、旅行、纪念日都可以记下来。</p>
          )}
          <ul className="mini-list">
            {upcoming.map((c) => {
              const d = daysUntil(c.next)
              return (
                <li key={c.id}>
                  <span>
                    {c.emoji} {c.title}
                  </span>
                  <em style={{ color: c.color }}>
                    {d === 0 ? '就是今天' : d > 0 ? `还有 ${d} 天` : `已过 ${-d} 天`}
                  </em>
                </li>
              )
            })}
          </ul>
        </article>

        <article className="card wide">
          <div className="card-head">
            <h3>钉住的便签</h3>
            <button className="link" onClick={() => onOpen('notes')}>
              全部便签
            </button>
          </div>
          {pinned.length === 0 && (
            <p className="empty-inline">把常用备忘钉在便签上，会显示在这里。</p>
          )}
          <div className="pin-row">
            {pinned.map((n) => (
              <div key={n.id} className="pin-note" style={{ background: n.color }}>
                <strong>{n.title || '无标题'}</strong>
                <p>{n.body}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
