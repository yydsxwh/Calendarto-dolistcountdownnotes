import { useState } from 'react'
import { daysUntil, formatLong, nextOccurrence, startOfToday, toISODate } from '../lib/dates'
import { jsWeekday } from '../lib/periods'
import { upcomingClasses, upcomingExams } from '../lib/reminders'
import {
  draftFromRecurring,
  emptyRecurringDraft,
  extrasFromDraft,
  formatRecurrenceRule,
  upcomingRecurring,
  type RecurringDraft,
} from '../lib/recurrence'
import { courseInTeachingWeek, courseInTerm, startOfWeek, teachingWeekNumber } from '../lib/week-grid'
import { EXAM_KIND_LABEL } from '../types'
import type { AppStore } from '../hooks/useAppStore'
import type { View } from '../types'
import RecurringReminderForm from './RecurringReminderForm'

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
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<RecurringDraft>(() => emptyRecurringDraft(iso))
  const recurringRows = upcomingRecurring(store.data.recurringReminders, today, 8)

  const closeForm = () => {
    setFormOpen(false)
    setEditingId(null)
    setDraft(emptyRecurringDraft(iso))
  }

  const saveRecurring = () => {
    const title = draft.title.trim()
    if (!title || !draft.startDate) return
    const extras = extrasFromDraft(draft)
    if (editingId) store.updateRecurringReminder(editingId, { title, ...extras })
    else store.addRecurringReminder(title, extras)
    closeForm()
  }

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
  const weekNo = teachingWeekNumber(
    startOfWeek(today, store.data.timetableView.weekStartsOn),
    store.currentTerm?.startDate,
    store.data.timetableView.weekStartsOn,
  )
  const todayClasses = upcomingClasses(store.data.courses, jsWeekday(today)).filter(
    (c) => courseInTerm(c, store.data.currentTermId) && courseInTeachingWeek(c, weekNo),
  )
  const nextExams = upcomingExams(store.data.exams, iso).slice(0, 4)

  return (
    <section className="view">
      <header className="view-head">
        <p className="kicker">{hello}</p>
        <h2>{formatLong(today)}</h2>
        <p className="muted">
          {store.stats.remaining} 件待办 · {store.stats.courseCount} 节课 ·{' '}
          {store.stats.examCount} 场考试 · {store.stats.noteCount} 条便签
        </p>
      </header>

      <div className="recurring-cta-row">
        <button
          className="btn primary recurring-cta"
          onClick={() => {
            setEditingId(null)
            setDraft(emptyRecurringDraft(iso))
            setFormOpen(true)
          }}
        >
          新建周期性提醒
        </button>
      </div>

      {formOpen && (
        <article className="card recurring-editor">
          <div className="card-head">
            <h3>{editingId ? '编辑周期性提醒' : '新建周期性提醒'}</h3>
            <button className="link" onClick={closeForm}>
              收起
            </button>
          </div>
          <RecurringReminderForm
            draft={draft}
            onChange={setDraft}
            onSubmit={saveRecurring}
            onCancel={closeForm}
            submitLabel={editingId ? '保存' : '创建'}
          />
        </article>
      )}

      <article className="card recurring-panel">
        <div className="card-head">
          <h3>周期性提醒</h3>
          <span className="muted tiny">按规则计算下一场，不预先生成几十年数据</span>
        </div>
        {recurringRows.length === 0 && (
          <p className="empty-inline">还没有周期提醒。可以设每 3 天、每 2 周、每 6 个月或每 10 年。</p>
        )}
        <ul className="mini-list">
          {recurringRows.map(({ item, next }) => {
            const d = daysUntil(next)
            return (
              <li key={item.id} className={item.enabled ? '' : 'is-paused'}>
                <span>
                  <strong>{item.title}</strong>
                  <em>
                    {formatRecurrenceRule(item.rule)}
                    {item.remindTime ? ` · ${item.remindTime}` : ''}
                    {' · '}
                    {d === 0 ? '就是今天' : d > 0 ? `${next} · ${d} 天后` : next}
                    {item.enabled ? '' : ' · 已暂停'}
                  </em>
                </span>
                <span className="row wrap">
                  <button
                    className="link"
                    onClick={() => {
                      setEditingId(item.id)
                      setDraft(draftFromRecurring(item))
                      setFormOpen(true)
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
            )
          })}
        </ul>
      </article>

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
            <h3>今天的课</h3>
            <button className="link" onClick={() => onOpen('schedule')}>
              课程表
            </button>
          </div>
          {todayClasses.length === 0 && (
            <p className="empty-inline">今天没有课。导入课表后会按星期自动出现。</p>
          )}
          <ul className="mini-list">
            {todayClasses.map((c) => (
              <li key={c.id}>
                <span>
                  {c.startTime}-{c.endTime} {c.name}
                </span>
                <em>
                  {[c.location, c.teacher].filter(Boolean).join(' · ') ||
                    `提前 ${c.remindMinutes} 分提醒`}
                </em>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <div className="card-head">
            <h3>考试时间表</h3>
            <button className="link" onClick={() => onOpen('schedule')}>
              全部考试
            </button>
          </div>
          {nextExams.length === 0 && (
            <p className="empty-inline">还没登记考试。期中期末时间记错会错过，请尽早导入。</p>
          )}
          <ul className="mini-list">
            {nextExams.map((e) => {
              const d = daysUntil(e.date)
              return (
                <li key={e.id}>
                  <span>
                    {EXAM_KIND_LABEL[e.kind]} {e.name}
                  </span>
                  <em>
                    {e.date} {e.startTime}
                    {d === 0 ? ' · 今天开考' : d > 0 ? ` · ${d} 天后` : ' · 已过'}
                  </em>
                </li>
              )
            })}
          </ul>
        </article>

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
