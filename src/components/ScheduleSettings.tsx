import { useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import { DEFAULT_PERIODS, normalizeClockInput } from '../lib/periods'
import {
  TERM_KIND_LABEL,
  TERM_KINDS,
  academicYearOptions,
  currentAcademicYearStart,
  defaultWeekCount,
  termLabel,
} from '../lib/terms'
import type { Term, TermKind } from '../types'

type Panel = 'home' | 'term' | 'periods' | 'start' | 'rows' | 'weekstart'

export default function ScheduleSettings({
  store,
  open,
  onClose,
}: {
  store: AppStore
  open: boolean
  onClose: () => void
}) {
  const [panel, setPanel] = useState<Panel>('home')
  const current = store.currentTerm
  const view = store.data.timetableView

  const deleteTerm = (term: Term) => {
    if (store.data.terms.length <= 1) return
    const courseCount = store.data.courses.filter((course) => course.termId === term.id).length
    const courseNote = courseCount ? `这学期的 ${courseCount} 节课会一起删除。` : '这学期还没有课。'
    if (!window.confirm(`删除「${termLabel(term)}」？${courseNote}`)) return
    store.removeTerm(term.id)
  }

  if (!open || !current) return null

  const title =
    panel === 'home'
      ? `课表设置（${termLabel(current)}）`
      : panel === 'term'
        ? '学年学期'
        : panel === 'periods'
          ? '上课时间'
          : panel === 'start'
            ? '开学行课时间'
            : panel === 'rows'
              ? '隐藏行和列'
              : '每周起始日'

  return (
    <div className="tt-drawer-root" role="dialog" aria-label="课表设置">
      <button type="button" className="tt-drawer-mask" onClick={onClose} aria-label="关闭设置" />
      <aside className="tt-drawer">
        <header className="tt-drawer-head">
          <button
            type="button"
            className="icon-btn"
            onClick={() => (panel === 'home' ? onClose() : setPanel('home'))}
            aria-label={panel === 'home' ? '关闭' : '返回'}
          >
            ←
          </button>
          <div>
            <strong>{title}</strong>
            {panel === 'home' ? <p className="muted">{termLabel(current)}</p> : null}
          </div>
          {panel === 'term' ? (
            <button type="button" className="icon-btn" onClick={() => store.addTerm()} aria-label="新建学期">
              ＋
            </button>
          ) : (
            <span />
          )}
        </header>

        {panel === 'home' && (
          <div className="tt-drawer-list">
            <button type="button" className="tt-drawer-row" onClick={() => setPanel('term')}>
              <span>学年学期</span>
              <em>
                {termLabel(current)} <span>›</span>
              </em>
            </button>
            <button type="button" className="tt-drawer-row" onClick={() => setPanel('periods')}>
              <span>上课时间</span>
              <em>
                {view.classPeriods.length} 节 ›
              </em>
            </button>
            <button type="button" className="tt-drawer-row" onClick={() => setPanel('start')}>
              <span>设置开学行课时间</span>
              <em>
                {current.startDate || '未设置'} · {current.weekCount} 周 ›
              </em>
            </button>
            <p className="tt-drawer-label">通用设置</p>
            <button type="button" className="tt-drawer-row" onClick={() => setPanel('rows')}>
              <span>隐藏行和列</span>
              <em>
                藏 {view.hiddenHours.length} 时 / {view.hiddenWeekdays.length} 列 ›
              </em>
            </button>
            <button type="button" className="tt-drawer-row" onClick={() => setPanel('weekstart')}>
              <span>每周起始日</span>
              <em>{view.weekStartsOn === 7 ? '周日' : '周一'} ›</em>
            </button>
            <label className="tt-drawer-row">
              <span>显示非本周课程</span>
              <input
                type="checkbox"
                checked={view.showOffWeekCourses}
                onChange={(e) => store.updateTimetableView({ showOffWeekCourses: e.target.checked })}
              />
            </label>
          </div>
        )}

        {panel === 'term' && (
          <div className="tt-drawer-pane">
            <p className="muted">
              选择学年和第几学期。暑假/寒假小学期、社会实践、实习项目也可以单独建一份课表。
            </p>
            <ul className="tt-term-list">
              {store.data.terms.map((term) => (
                <li key={term.id} className={term.id === current.id ? 'is-on' : ''}>
                  <button type="button" onClick={() => store.setCurrentTerm(term.id)}>
                    {termLabel(term)}
                    {term.startDate ? ` · ${term.startDate} 起` : ''}
                    {` · ${term.weekCount} 周`}
                  </button>
                  {store.data.terms.length > 1 ? (
                    <button type="button" className="btn ghost" onClick={() => deleteTerm(term)}>
                      删除
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <h4>当前学期</h4>
            <label>
              学年
              <select
                className="input"
                value={current.yearStart}
                onChange={(e) => store.updateTerm(current.id, { yearStart: Number(e.target.value) })}
              >
                {academicYearOptions().map((year) => (
                  <option key={year} value={year}>
                    {year}-{year + 1}学年
                  </option>
                ))}
              </select>
            </label>
            <label>
              学期类型
              <select
                className="input"
                value={current.kind}
                onChange={(e) => {
                  const kind = e.target.value as TermKind
                  store.updateTerm(current.id, { kind, weekCount: defaultWeekCount(kind) })
                }}
              >
                {TERM_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {TERM_KIND_LABEL[kind]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                store.addTerm({
                  yearStart: currentAcademicYearStart(),
                  kind: 'summer',
                })
              }
            >
              新建暑假小学期
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => store.addTerm({ kind: 'practice' })}
            >
              新建社会实践课表
            </button>
            <button type="button" className="btn ghost" onClick={() => store.addTerm({ kind: 'intern' })}>
              新建实习项目课表
            </button>
            {store.data.terms.length > 1 ? (
              <button type="button" className="btn ghost" onClick={() => deleteTerm(current)}>
                删除当前学期
              </button>
            ) : (
              <p className="muted">至少保留一个学期。新建学期后，可以在上面的列表里点「删除」。</p>
            )}
          </div>
        )}

        {panel === 'periods' && (
          <div className="tt-drawer-pane">
            <p className="muted">
              导入课表后，左侧时间轴按开课、下课钟点标刻度，不必从整点开始。这里的「第 N 节」只用来把表格里的节次换成钟点。
            </p>
            {view.classPeriods.map((period, index) => (
              <div key={`${period.start}-${index}`} className="row wrap">
                <span className="tt-period-idx">第{index + 1}节</span>
                <input
                  className="input slim"
                  value={period.start}
                  onChange={(e) => {
                    const next = view.classPeriods.map((item, i) =>
                      i === index ? { ...item, start: e.target.value } : item,
                    )
                    store.updateTimetableView({ classPeriods: next })
                  }}
                  onBlur={(e) => {
                    const parsed = normalizeClockInput(e.target.value)
                    if (!parsed) return
                    const next = view.classPeriods.map((item, i) =>
                      i === index ? { ...item, start: parsed } : item,
                    )
                    store.updateTimetableView({ classPeriods: next })
                  }}
                />
                <input
                  className="input slim"
                  value={period.end}
                  onChange={(e) => {
                    const next = view.classPeriods.map((item, i) =>
                      i === index ? { ...item, end: e.target.value } : item,
                    )
                    store.updateTimetableView({ classPeriods: next })
                  }}
                  onBlur={(e) => {
                    const parsed = normalizeClockInput(e.target.value)
                    if (!parsed) return
                    const next = view.classPeriods.map((item, i) =>
                      i === index ? { ...item, end: parsed } : item,
                    )
                    store.updateTimetableView({ classPeriods: next })
                  }}
                />
              </div>
            ))}
            <div className="row wrap">
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  store.updateTimetableView({
                    classPeriods: [...view.classPeriods, { start: '22:00', end: '22:45' }],
                  })
                }
              >
                加一节
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => store.updateTimetableView({ classPeriods: DEFAULT_PERIODS.map((p) => ({ ...p })) })}
              >
                恢复高校默认
              </button>
            </div>
          </div>
        )}

        {panel === 'start' && (
          <div className="tt-drawer-pane">
            <p className="muted">开学日期用来算第几周。本学期一共几周，用来限制上一周 / 下一周翻页。</p>
            <label>
              开学 / 行课开始
              <input
                className="input"
                type="date"
                value={current.startDate}
                onChange={(e) => store.updateTerm(current.id, { startDate: e.target.value })}
              />
            </label>
            <label>
              一共几周
              <input
                className="input"
                type="number"
                min={1}
                max={40}
                value={current.weekCount}
                onChange={(e) =>
                  store.updateTerm(current.id, { weekCount: Math.max(1, Number(e.target.value) || 1) })
                }
              />
            </label>
          </div>
        )}

        {panel === 'rows' && (
          <div className="tt-drawer-pane">
            <p className="muted">
              课表是 00:00–23:59 的整张表。凌晨通常不上课，可以把这些行藏起来，需要时再显示。
            </p>
            <div className="row wrap">
              <button
                type="button"
                className="btn ghost"
                onClick={() => store.updateTimetableView({ hiddenHours: [0, 1, 2, 3, 4, 5] })}
              >
                隐藏凌晨
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => store.updateTimetableView({ hiddenHours: [] })}
              >
                显示全天
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() =>
                  store.updateTimetableView({
                    hiddenHours: [0, 1, 2, 3, 4, 5, 6, 7, 22, 23],
                  })
                }
              >
                只留上课时段
              </button>
            </div>
            <h4>隐藏小时行</h4>
            <div className="tt-chip-grid">
              {Array.from({ length: 24 }, (_, hour) => (
                <label key={hour} className={view.hiddenHours.includes(hour) ? 'is-off' : ''}>
                  <input
                    type="checkbox"
                    checked={view.hiddenHours.includes(hour)}
                    onChange={() => store.toggleHiddenHour(hour)}
                  />
                  {String(hour).padStart(2, '0')}:00
                </label>
              ))}
            </div>
            <h4>隐藏星期列</h4>
            <div className="tt-chip-grid">
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((label, i) => (
                <label key={label} className={view.hiddenWeekdays.includes(i + 1) ? 'is-off' : ''}>
                  <input
                    type="checkbox"
                    checked={view.hiddenWeekdays.includes(i + 1)}
                    onChange={() => store.toggleHiddenWeekday(i + 1)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {panel === 'weekstart' && (
          <div className="tt-drawer-pane">
            <label className="tt-drawer-row">
              <span>周一起始</span>
              <input
                type="radio"
                name="weekstart"
                checked={view.weekStartsOn === 1}
                onChange={() => store.updateTimetableView({ weekStartsOn: 1 })}
              />
            </label>
            <label className="tt-drawer-row">
              <span>周日起始</span>
              <input
                type="radio"
                name="weekstart"
                checked={view.weekStartsOn === 7}
                onChange={() => store.updateTimetableView({ weekStartsOn: 7 })}
              />
            </label>
          </div>
        )}
      </aside>
    </div>
  )
}
