import { useEffect, useMemo, useState } from 'react'
import {
  MONTHS,
  WEEKDAYS,
  formatLong,
  monthCells,
  startOfToday,
  toISODate,
} from '../lib/dates'
import {
  draftFromRecurring,
  emptyRecurringDraft,
  extrasFromDraft,
  formatRecurrenceRule,
  occurrencesInRange,
  type RecurringDraft,
} from '../lib/recurrence'
import type { AppStore } from '../hooks/useAppStore'
import RecurringReminderForm from './RecurringReminderForm'

export default function CalendarView({ store }: { store: AppStore }) {
  const today = startOfToday()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [quick, setQuick] = useState('')
  const [kind, setKind] = useState<'todo' | 'countdown' | 'note' | 'recurring'>('todo')
  const [draft, setDraft] = useState<RecurringDraft>(() => emptyRecurringDraft(toISODate(today)))
  const [editingId, setEditingId] = useState<string | null>(null)

  const iso = toISODate(selected)
  const cells = useMemo(() => monthCells(view), [view])
  const dayItems = store.itemsOnDate(iso)

  useEffect(() => {
    if (editingId) return
    setDraft((prev) => ({ ...prev, startDate: iso }))
  }, [iso, editingId])

  const marks = useMemo(() => {
    const map = new Map<string, { todo: boolean; day: boolean; note: boolean; exam: boolean; recurring: boolean }>()
    const mark = (key: string, field: 'todo' | 'day' | 'note' | 'exam' | 'recurring') => {
      const cur = map.get(key) ?? { todo: false, day: false, note: false, exam: false, recurring: false }
      cur[field] = true
      map.set(key, cur)
    }
    store.data.todos.forEach((t) => t.dueDate && mark(t.dueDate, 'todo'))
    store.data.countdowns.forEach((c) => {
      mark(c.date, 'day')
      if (c.repeatYearly) {
        const next = new Date(view.getFullYear(), parseInt(c.date.slice(5, 7), 10) - 1, parseInt(c.date.slice(8, 10), 10))
        mark(toISODate(next), 'day')
      }
    })
    store.data.notes.forEach((n) => n.date && mark(n.date, 'note'))
    store.data.exams.forEach((e) => mark(e.date, 'exam'))
    const monthStart = toISODate(new Date(view.getFullYear(), view.getMonth(), 1))
    const monthEnd = toISODate(new Date(view.getFullYear(), view.getMonth() + 1, 0))
    store.data.recurringReminders.forEach((item) => {
      occurrencesInRange(item, monthStart, monthEnd).forEach((day) => mark(day, 'recurring'))
    })
    return map
  }, [store.data, view])

  const addQuick = () => {
    const title = quick.trim()
    if (!title) return
    if (kind === 'todo') store.addTodo(title, { dueDate: iso })
    else if (kind === 'countdown') store.addCountdown(title, iso)
    else if (kind === 'note') store.addNote(title, '', { date: iso })
    setQuick('')
  }

  const saveRecurring = () => {
    const title = draft.title.trim()
    if (!title || !draft.startDate) return
    const extras = extrasFromDraft(draft)
    if (editingId) {
      store.updateRecurringReminder(editingId, { title, ...extras })
    } else {
      store.addRecurringReminder(title, extras)
    }
    setEditingId(null)
    setDraft(emptyRecurringDraft(iso))
  }

  return (
    <section className="view calendar-layout">
      <div className="card cal-card">
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label="上个月">
            ‹
          </button>
          <div>
            <h2>
              {view.getFullYear()} 年 {MONTHS[view.getMonth()]}
            </h2>
            <button
              className="link"
              onClick={() => {
                setView(new Date(today.getFullYear(), today.getMonth(), 1))
                setSelected(today)
              }}
            >
              回到今天
            </button>
          </div>
          <button className="icon-btn" onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label="下个月">
            ›
          </button>
        </div>
        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} className="cal-cell empty-cell" />
            const key = toISODate(date)
            const isToday = key === toISODate(today)
            const isSelected = key === iso
            const dots = marks.get(key)
            return (
              <button
                key={idx}
                className={`cal-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelected(date)}
              >
                {date.getDate()}
                <span className="dots">
                  {dots?.todo && <i className="dot todo" />}
                  {dots?.day && <i className="dot day" />}
                  {dots?.note && <i className="dot note" />}
                  {dots?.exam && <i className="dot exam" />}
                  {dots?.recurring && <i className="dot recurring" />}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <aside className="card day-panel">
        <h3>{formatLong(selected)}</h3>
        <div className="row wrap">
          <select className="input slim" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="todo">待办</option>
            <option value="countdown">倒数日</option>
            <option value="note">便签</option>
            <option value="recurring">周期性提醒</option>
          </select>
          {kind !== 'recurring' && (
            <>
              <input
                className="input"
                placeholder={kind === 'todo' ? '这天要做什么…' : kind === 'countdown' ? '这天倒数什么…' : '这天记一笔…'}
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addQuick()}
                aria-label="快速添加到这一天"
              />
              <button className="btn primary" onClick={addQuick}>
                添加
              </button>
            </>
          )}
        </div>
        {kind === 'recurring' && (
          <RecurringReminderForm
            draft={draft}
            onChange={setDraft}
            onSubmit={saveRecurring}
            onCancel={
              editingId
                ? () => {
                    setEditingId(null)
                    setDraft(emptyRecurringDraft(iso))
                  }
                : undefined
            }
            submitLabel={editingId ? '保存周期提醒' : '添加周期提醒'}
          />
        )}

        <h4>周期性提醒</h4>
        <ul className="mini-list">
          {dayItems.recurring.length === 0 && <li className="empty-inline">这天没有周期提醒</li>}
          {dayItems.recurring.map((item) => (
            <li key={item.id} className={item.enabled ? '' : 'is-paused'}>
              <span>
                {item.title}
                <em>
                  {' '}
                  {formatRecurrenceRule(item.rule)}
                  {item.remindTime ? ` · ${item.remindTime}` : ''}
                  {item.enabled ? '' : ' · 已暂停'}
                </em>
              </span>
              <span className="row wrap">
                <button
                  className="link"
                  onClick={() => {
                    setKind('recurring')
                    setEditingId(item.id)
                    setDraft(draftFromRecurring(item))
                  }}
                >
                  编辑
                </button>
                <button className="link" onClick={() => store.updateRecurringReminder(item.id, { enabled: !item.enabled })}>
                  {item.enabled ? '暂停' : '启用'}
                </button>
                <button className="icon-btn" onClick={() => store.removeRecurringReminder(item.id)} aria-label="删除周期提醒">
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>

        <h4>待办</h4>
        <ul className="mini-list">
          {dayItems.todos.length === 0 && <li className="empty-inline">这天没有待办</li>}
          {dayItems.todos.map((t) => (
            <li key={t.id} className={t.done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={t.done} onChange={() => store.toggleTodo(t.id)} />
                <span>{t.title}</span>
              </label>
              <button className="icon-btn" onClick={() => store.removeTodo(t.id)} aria-label="删除">
                ✕
              </button>
            </li>
          ))}
        </ul>

        <h4>倒数日</h4>
        <ul className="mini-list">
          {dayItems.countdowns.length === 0 && <li className="empty-inline">这天没有倒数日</li>}
          {dayItems.countdowns.map((c) => (
            <li key={c.id}>
              <span>
                {c.emoji} {c.title}
              </span>
              <button className="icon-btn" onClick={() => store.removeCountdown(c.id)} aria-label="删除">
                ✕
              </button>
            </li>
          ))}
        </ul>

        <h4>考试</h4>
        <ul className="mini-list">
          {dayItems.exams.length === 0 && <li className="empty-inline">这天没有考试</li>}
          {dayItems.exams.map((e) => (
            <li key={e.id}>
              <span>
                {e.name} {e.startTime}
                {e.location ? ` · ${e.location}` : ''}
              </span>
              <button className="icon-btn" onClick={() => store.removeExam(e.id)} aria-label="删除考试">
                ✕
              </button>
            </li>
          ))}
        </ul>

        <h4>便签</h4>
        <ul className="mini-list">
          {dayItems.notes.length === 0 && <li className="empty-inline">这天没有便签</li>}
          {dayItems.notes.map((n) => (
            <li key={n.id}>
              <span>{n.title || n.body || '空白便签'}</span>
              <button className="icon-btn" onClick={() => store.removeNote(n.id)} aria-label="删除">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </section>
  )
}
