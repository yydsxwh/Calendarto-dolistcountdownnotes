import { RECURRENCE_UNITS } from '../types'
import type { RecurringDraft } from '../lib/recurrence'

export default function RecurringReminderForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  draft: RecurringDraft
  onChange: (next: RecurringDraft) => void
  onSubmit: () => void
  onCancel?: () => void
  submitLabel: string
}) {
  const set = (patch: Partial<RecurringDraft>) => onChange({ ...draft, ...patch })

  return (
    <div className="recurring-form">
      <div className="row wrap">
        <input
          className="input"
          placeholder="标题，例如「换季提醒」「体检」"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          aria-label="周期提醒标题"
        />
        <input
          className="input slim"
          type="date"
          value={draft.startDate}
          onChange={(e) => set({ startDate: e.target.value })}
          aria-label="开始日期"
        />
        <input
          className="input slim"
          type="time"
          value={draft.remindTime}
          onChange={(e) => set({ remindTime: e.target.value })}
          aria-label="提醒时间，可不填"
        />
      </div>
      <textarea
        className="input recurring-note"
        rows={2}
        placeholder="内容 / 备注，可不填"
        value={draft.body}
        onChange={(e) => set({ body: e.target.value })}
        aria-label="内容备注"
      />
      <div className="row wrap">
        <label className="check tiny">
          <span>每</span>
          <input
            className="input slim recurring-interval"
            type="number"
            min={1}
            step={1}
            value={draft.interval}
            onChange={(e) => set({ interval: Number(e.target.value) })}
            aria-label="周期间隔"
          />
        </label>
        <select
          className="input slim"
          value={draft.unit}
          onChange={(e) => set({ unit: e.target.value as RecurringDraft['unit'] })}
          aria-label="周期单位"
        >
          {RECURRENCE_UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <label className="check tiny">
          <input
            type="checkbox"
            checked={draft.neverEnds}
            onChange={(e) => set({ neverEnds: e.target.checked, endDate: e.target.checked ? '' : draft.endDate })}
          />
          <span>永不结束</span>
        </label>
        {!draft.neverEnds && (
          <input
            className="input slim"
            type="date"
            value={draft.endDate}
            onChange={(e) => set({ endDate: e.target.value })}
            aria-label="结束日期"
          />
        )}
        <label className="check tiny">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
          <span>启用</span>
        </label>
      </div>
      <div className="row wrap">
        <button className="btn primary" onClick={onSubmit}>
          {submitLabel}
        </button>
        {onCancel && (
          <button className="btn ghost" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
      <p className="muted tiny">按自然月 / 自然年计算，例如每月 31 日在 2 月会落到月末。不填时间只出现在日历，填了时间才会响铃。</p>
    </div>
  )
}
