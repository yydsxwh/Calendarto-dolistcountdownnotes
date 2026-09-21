import type { AppStore } from '../hooks/useAppStore'
import type { DueReminder } from '../lib/reminders'
import { TIMETABLE_TABS, type TimetableTab } from '../lib/routes'
import Schedule from './Schedule'
import SelfManagementTimetable from './SelfManagementTimetable'

/**
 * 「时间表」一级入口：课表 / 考试 / 自律 / 提醒。
 *
 * 只是把三个已有页面收进同一个二级导航，课程、考试、自律仍各自读写
 * `store` 里原来的字段，不复制状态，也不新建数据模型。
 */
export default function Timetable({
  store,
  tab,
  onTabChange,
  requestPermission,
  previewReminder,
}: {
  store: AppStore
  tab: TimetableTab
  onTabChange: (next: TimetableTab) => void
  requestPermission: () => Promise<NotificationPermission | 'denied' | 'granted'>
  previewReminder: (item: DueReminder) => void
}) {
  return (
    <div className="timetable-shell">
      <div className="tabs subtabs" role="tablist" aria-label="时间表">
        {TIMETABLE_TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={`tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'self' ? (
        <SelfManagementTimetable store={store} />
      ) : (
        <Schedule
          store={store}
          tab={tab}
          onTabChange={onTabChange}
          requestPermission={requestPermission}
          previewReminder={previewReminder}
        />
      )}
    </div>
  )
}
