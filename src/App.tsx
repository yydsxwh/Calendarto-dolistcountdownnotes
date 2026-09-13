import { useEffect, useMemo, useRef, useState } from 'react'
import CalendarView from './components/CalendarView'
import Countdowns from './components/Countdowns'
import Notes from './components/Notes'
import Schedule from './components/Schedule'
import Today from './components/Today'
import Todos from './components/Todos'
import { useAppStore } from './hooks/useAppStore'
import { useReminders } from './hooks/useReminders'
import type { View } from './types'

const VIEWS: { id: View; label: string }[] = [
  { id: 'today', label: '今日' },
  { id: 'calendar', label: '日历' },
  { id: 'todos', label: '待办' },
  { id: 'schedule', label: '课表' },
  { id: 'days', label: '倒数日' },
  { id: 'notes', label: '便签' },
]

function parseView(): View {
  const hash = window.location.hash.replace('#', '') as View
  return VIEWS.some((v) => v.id === hash) ? hash : 'today'
}

export default function App() {
  const store = useAppStore()
  const reminders = useReminders(
    store.data.courses,
    store.data.exams,
    store.data.reminderSettings,
  )
  const [view, setView] = useState<View>(parseView)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onHash = () => setView(parseView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const open = (next: View) => {
    setView(next)
    window.location.hash = next
  }

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return {
      todos: store.data.todos.filter((t) => t.title.toLowerCase().includes(q)),
      countdowns: store.data.countdowns.filter((c) => c.title.toLowerCase().includes(q)),
      notes: store.data.notes.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
      ),
      courses: store.data.courses.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.location || '').toLowerCase().includes(q) ||
          (c.teacher || '').toLowerCase().includes(q),
      ),
      exams: store.data.exams.filter(
        (e) => e.name.toLowerCase().includes(q) || (e.location || '').toLowerCase().includes(q),
      ),
    }
  }, [query, store.data])

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="mark">日</span>
          <div>
            <strong>颗秒日事</strong>
            <p>日历 · 待办 · 课表 · 倒数日 · 便签</p>
          </div>
        </div>
        <nav className="tabs desktop-nav" aria-label="功能">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={`tab ${view === v.id && !hits ? 'active' : ''}`}
              onClick={() => open(v.id)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <input
            className="input search"
            placeholder="搜索待办、课表、考试、便签"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索"
          />
          <div className="menu-wrap">
            <button className="btn ghost" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              更多
            </button>
            {menuOpen && (
              <div className="menu">
                <button
                  onClick={() => {
                    store.downloadBackup()
                    setMenuOpen(false)
                  }}
                >
                  导出备份
                </button>
                <button
                  onClick={() => {
                    fileRef.current?.click()
                    setMenuOpen(false)
                  }}
                >
                  导入备份
                </button>
                <button
                  onClick={() => {
                    if (confirm('清空本机全部日事数据？此操作不可恢复。')) store.clearAll()
                    setMenuOpen(false)
                  }}
                >
                  清空本机数据
                </button>
                <a href="https://www.yydsxwh.com/products">返回软件产品</a>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void store.importBackup(file)
            e.target.value = ''
          }}
        />
      </header>

      {reminders.banner && (
        <div className={`remind-banner ${reminders.banner.kind}`} role="status">
          <div>
            <strong>{reminders.banner.title}</strong>
            <p>{reminders.banner.body}</p>
          </div>
          <button className="btn ghost" onClick={reminders.dismiss}>
            知道了
          </button>
        </div>
      )}

      <main className="main">
        {hits ? (
          <section className="view">
            <header className="view-head">
              <h2>搜索「{query}」</h2>
              <p className="muted">
                {hits.todos.length +
                  hits.countdowns.length +
                  hits.notes.length +
                  hits.courses.length +
                  hits.exams.length}{' '}
                条结果
              </p>
            </header>
            <div className="card">
              <h3>待办</h3>
              <ul className="mini-list">
                {hits.todos.length === 0 && <li className="empty-inline">无匹配待办</li>}
                {hits.todos.map((t) => (
                  <li key={t.id}>
                    <label>
                      <input type="checkbox" checked={t.done} onChange={() => store.toggleTodo(t.id)} />
                      <span>{t.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <h3>倒数日</h3>
              <ul className="mini-list">
                {hits.countdowns.length === 0 && <li className="empty-inline">无匹配倒数日</li>}
                {hits.countdowns.map((c) => (
                  <li key={c.id}>
                    {c.emoji} {c.title}
                  </li>
                ))}
              </ul>
              <h3>便签</h3>
              <ul className="mini-list">
                {hits.notes.length === 0 && <li className="empty-inline">无匹配便签</li>}
                {hits.notes.map((n) => (
                  <li key={n.id}>{n.title || n.body}</li>
                ))}
              </ul>
              <h3>课程</h3>
              <ul className="mini-list">
                {hits.courses.length === 0 && <li className="empty-inline">无匹配课程</li>}
                {hits.courses.map((c) => (
                  <li key={c.id}>
                    {c.name} · {c.startTime}-{c.endTime} {c.location}
                  </li>
                ))}
              </ul>
              <h3>考试</h3>
              <ul className="mini-list">
                {hits.exams.length === 0 && <li className="empty-inline">无匹配考试</li>}
                {hits.exams.map((e) => (
                  <li key={e.id}>
                    {e.name} · {e.date} {e.startTime}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : view === 'today' ? (
          <Today store={store} onOpen={open} />
        ) : view === 'calendar' ? (
          <CalendarView store={store} />
        ) : view === 'todos' ? (
          <Todos store={store} />
        ) : view === 'schedule' ? (
          <Schedule store={store} requestPermission={reminders.requestPermission} />
        ) : view === 'days' ? (
          <Countdowns store={store} />
        ) : (
          <Notes store={store} />
        )}
      </main>

      <nav className="bottom-nav" aria-label="移动导航">
        {VIEWS.map((v) => (
          <button key={v.id} className={view === v.id && !hits ? 'active' : ''} onClick={() => open(v.id)}>
            {v.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
