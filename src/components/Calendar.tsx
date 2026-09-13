import { useMemo, useState } from 'react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = [
  '一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月',
]

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export default function Calendar() {
  const today = new Date()
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState<Date>(today)

  const cells = useMemo(() => {
    const year = view.getFullYear()
    const month = view.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const result: (Date | null)[] = []
    for (let i = 0; i < firstDay; i++) result.push(null)
    for (let d = 1; d <= daysInMonth; d++) result.push(new Date(year, month, d))
    while (result.length % 7 !== 0) result.push(null)
    return result
  }, [view])

  const changeMonth = (delta: number) =>
    setView(new Date(view.getFullYear(), view.getMonth() + delta, 1))

  const goToday = () => {
    setView(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelected(today)
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>日历</h2>
        <button className="btn ghost small" onClick={goToday}>
          今天
        </button>
      </header>

      <div className="cal-nav">
        <button className="icon-btn" onClick={() => changeMonth(-1)} aria-label="上个月">
          ‹
        </button>
        <span className="cal-title">
          {view.getFullYear()} 年 {MONTHS[view.getMonth()]}
        </span>
        <button className="icon-btn" onClick={() => changeMonth(1)} aria-label="下个月">
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
          const isToday = sameDay(date, today)
          const isSelected = sameDay(date, selected)
          return (
            <button
              key={idx}
              className={`cal-cell ${isToday ? 'today' : ''} ${
                isSelected ? 'selected' : ''
              }`}
              onClick={() => setSelected(date)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      <div className="cal-selected">
        已选择：
        <strong>
          {selected.getFullYear()} 年 {MONTHS[selected.getMonth()]}{' '}
          {selected.getDate()} 日 星期{WEEKDAYS[selected.getDay()]}
        </strong>
      </div>
    </section>
  )
}
