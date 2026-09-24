import { useEffect, useMemo, useState } from 'react'
import {
  MONTHS,
  WEEKDAYS,
  formatLong,
  monthCells,
  startOfToday,
  toISODate,
} from '../lib/dates'
import { compareByStartTime, eventMatchesDate, formatEventTime, formatTodoTimeRange } from '../lib/calendar-events'
import {
  draftFromRecurring,
  emptyRecurringDraft,
  extrasFromDraft,
  formatRecurrenceRule,
  occurrencesInRange,
  type RecurringDraft,
} from '../lib/recurrence'
import type { AppStore } from '../hooks/useAppStore'
import type { CalendarEvent } from '../types'
import RecurringReminderForm from './RecurringReminderForm'
import { HolidayDayList } from './HolidaySection'
import { ReminderRulesEditor } from './ReminderRulesEditor'
import { holidayBadges, holidayMark, holidaysOn } from '../lib/holidays/query'

const EVENT_REPEAT_OPTIONS: { value: CalendarEvent['repeat']; label: string }[] = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' },
]

export default function CalendarView({ store }: { store: AppStore }) {
  const today = startOfToday()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(today)
  const [quick, setQuick] = useState('')
  const [kind, setKind] = useState<'event' | 'todo' | 'countdown' | 'note' | 'recurring'>('todo')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [location, setLocation] = useState('')
  const [repeat, setRepeat] = useState<CalendarEvent['repeat']>('none')
  const [eventRemind, setEventRemind] = useState(store.data.reminderSettings.eventDefaultMinutes)
  const [draft, setDraft] = useState<RecurringDraft>(() => emptyRecurringDraft(toISODate(today)))
  const [editingId, setEditingId] = useState<string | null>(null)

  const iso = toISODate(selected)
  const cells = useMemo(() => monthCells(view), [view])
  const dayItems = store.itemsOnDate(iso)
  const sortedEvents = useMemo(() => [...dayItems.events].sort((a, b) => compareByStartTime(a, b)), [dayItems.events])

  useEffect(() => {
    if (editingId) return
    setDraft((prev) => ({ ...prev, startDate: iso }))
  }, [iso, editingId])

  const marks = useMemo(() => {
    const map = new Map<string, { todo: boolean; day: boolean; note: boolean; exam: boolean; event: boolean; recurring: boolean }>()
    const mark = (key: string, field: 'todo' | 'day' | 'note' | 'exam' | 'event' | 'recurring') => {
      const cur = map.get(key) ?? { todo: false, day: false, note: false, exam: false, event: false, recurring: false }
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
    for (const date of cells) {
      if (!date) continue
      const key = toISODate(date)
      for (const event of store.data.calendarEvents) {
        if (eventMatchesDate(event, key)) mark(key, 'event')
      }
    }
    const monthStart = toISODate(new Date(view.getFullYear(), view.getMonth(), 1))
    const monthEnd = toISODate(new Date(view.getFullYear(), view.getMonth() + 1, 0))
    store.data.recurringReminders.forEach((item) => {
      occurrencesInRange(item, monthStart, monthEnd).forEach((day) => mark(day, 'recurring'))
    })
    return map
  }, [store.data, view, cells])

  const addQuick = () => {
    const title = quick.trim()
    if (!title) return
    if (kind === 'event') {
      store.addCalendarEvent(title, {
        date: iso,
        startTime: allDay ? undefined : startTime,
        endTime: allDay ? undefined : endTime,
        allDay,
        location: location.trim() || undefined,
        repeat,
        remindMinutes: allDay ? 0 : eventRemind,
      })
      setLocation('')
    } else if (kind === 'todo') {
      store.addTodo(title, {
        dueDate: iso,
        dueTime: allDay ? undefined : startTime || undefined,
        dueEndTime: allDay || !endTime ? undefined : endTime,
        remindMinutes: !allDay && startTime ? eventRemind : 0,
      })
    } else if (kind === 'countdown') store.addCountdown(title, iso)
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
            const holidayItems = holidaysOn(key, store.data.holidaySettings)
            const badges = holidayBadges(holidayItems, 1)
            const holidayLabel = holidayItems.map((item) => `${holidayMark(item)}${item.name}`).join(' ')
            return (
              <button
                key={idx}
                className={`cal-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`}
                onClick={() => setSelected(date)}
                aria-label={`${date.getDate()}日${holidayLabel ? ` ${holidayLabel}` : ''}`}
              >
                {date.getDate()}
                {badges.shown[0] && (
                  <span className="cal-holiday">{holidayMark(badges.shown[0])} {badges.shown[0].name}{badges.extra ? ` +${badges.extra}` : ''}</span>
                )}
                <span className="dots">
                  {dots?.event && <i className="dot event" />}
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
        <HolidayDayList store={store} date={iso} />
        <div className="row wrap">
          <select className="input slim" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="event">日程</option>
            <option value="todo">待办</option>
            <option value="countdown">倒数日</option>
            <option value="note">便签</option>
            <option value="recurring">周期性提醒</option>
          </select>
          {kind !== 'recurring' && (
            <>
              <input
                className="input"
                placeholder={kind === 'event' ? '日程标题，例如「小组讨论」' : kind === 'todo' ? '这天要做什么…' : kind === 'countdown' ? '这天倒数什么…' : '这天记一笔…'}
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
        {(kind === 'event' || kind === 'todo') && (
          <div className="stack gap-sm">
            <div className="row wrap align-center">
              <label className="check-inline">
                <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
                全天
              </label>
              {!allDay && (
                <>
                  <input className="input slim" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} aria-label="开始时间" />
                  <span className="muted">到</span>
                  <input className="input slim" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} aria-label="结束时间" />
                  <select className="input slim" value={eventRemind} onChange={(e) => setEventRemind(Number(e.target.value))} aria-label="提前提醒">
                    <option value={0}>不提醒</option>
                    <option value={5}>提前 5 分</option>
                    <option value={15}>提前 15 分</option>
                    <option value={30}>提前 30 分</option>
                    <option value={60}>提前 1 小时</option>
                  </select>
                </>
              )}
            </div>
            {kind === 'event' && (
              <div className="row wrap">
                <input className="input" placeholder="地点（可选）" value={location} onChange={(e) => setLocation(e.target.value)} aria-label="地点" />
                <select className="input slim" value={repeat ?? 'none'} onChange={(e) => setRepeat(e.target.value as CalendarEvent['repeat'])} aria-label="重复">
                  {EVENT_REPEAT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value ?? 'none'}>{option.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
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

        <h4>日程</h4>
        <ul className="mini-list">
          {sortedEvents.length === 0 && <li className="empty-inline">这天没有日程</li>}
          {sortedEvents.map((event) => (
            <li key={event.id}>
              <span>
                {formatEventTime(event) ? `${formatEventTime(event)} ` : ''}
                {event.title}
                {event.location ? ` · ${event.location}` : ''}
                <ReminderRulesEditor store={store} targetType="event" targetId={event.id} startLabel={`${event.date} ${event.startTime || '全天'}`} start={event.startTime ? new Date(`${event.date}T${event.startTime}`) : new Date(`${event.date}T09:00`)} />
                {event.repeat && event.repeat !== 'none'
                  ? ` · ${EVENT_REPEAT_OPTIONS.find((option) => option.value === event.repeat)?.label ?? ''}`
                  : ''}
              </span>
              <button className="icon-btn" onClick={() => store.removeCalendarEvent(event.id)} aria-label="删除日程">✕</button>
            </li>
          ))}
        </ul>

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
                <span>{formatTodoTimeRange(t) ? `${formatTodoTimeRange(t)} ` : ''}{t.title}</span>
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
                {e.endTime ? `-${e.endTime}` : ''}
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
