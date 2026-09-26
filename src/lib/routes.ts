/**
 * 一级导航只有五项：我的一天 / 日历 / 时间表 / 日子 / 便签。
 *
 * 待办并进「我的一天」，课表 / 考试 / 自律并进「时间表」，倒数日改名「日子」。
 * 合并的是入口不是数据，所以旧 hash 必须继续可用：老书签、搜索结果和
 * Android 深层链接都还在用 `#todos` `#schedule` `#exams` `#selfschedule`。
 */

export type PrimaryView = 'today' | 'calendar' | 'timetable' | 'days' | 'notes'
export type TimetableTab = 'week' | 'exams' | 'self' | 'remind'
export type TodayFocus = 'todos' | null

export type Route = {
  view: PrimaryView
  timetableTab: TimetableTab
  focus: TodayFocus
}

export const PRIMARY_NAV: { id: PrimaryView; label: string; icon: string }[] = [
  { id: 'today', label: '我的一天', icon: '☀️' },
  { id: 'calendar', label: '日历', icon: '📅' },
  { id: 'timetable', label: '时间表', icon: '📚' },
  { id: 'days', label: '日子', icon: '🔥' },
  { id: 'notes', label: '便签', icon: '🌸' },
]

export const TIMETABLE_TABS: { id: TimetableTab; label: string }[] = [
  { id: 'week', label: '课表' },
  { id: 'exams', label: '考试' },
  { id: 'self', label: '自律' },
  { id: 'remind', label: '提醒' },
]

const DEFAULT_ROUTE: Route = { view: 'today', timetableTab: 'week', focus: null }

/** 旧 hash → 新路由。保留旧 id，避免历史链接和已发布 APK 打开空白页。 */
const LEGACY: Record<string, Route> = {
  '': DEFAULT_ROUTE,
  today: DEFAULT_ROUTE,
  todos: { view: 'today', timetableTab: 'week', focus: 'todos' },
  calendar: { view: 'calendar', timetableTab: 'week', focus: null },
  schedule: { view: 'timetable', timetableTab: 'week', focus: null },
  timetable: { view: 'timetable', timetableTab: 'week', focus: null },
  exams: { view: 'timetable', timetableTab: 'exams', focus: null },
  selfschedule: { view: 'timetable', timetableTab: 'self', focus: null },
  self: { view: 'timetable', timetableTab: 'self', focus: null },
  days: { view: 'days', timetableTab: 'week', focus: null },
  countdown: { view: 'days', timetableTab: 'week', focus: null },
  notes: { view: 'notes', timetableTab: 'week', focus: null },
}

function isTimetableTab(value: string): value is TimetableTab {
  return TIMETABLE_TABS.some((tab) => tab.id === value)
}

export function parseRoute(rawHash: string): Route {
  const hash = rawHash.replace(/^#/, '').replace(/^\/+|\/+$/g, '').toLowerCase()
  const [head, tail] = hash.split('/')
  if (head === 'timetable' && tail) {
    const tab = tail === 'week' ? 'week' : tail === 'schedule' ? 'week' : tail
    if (isTimetableTab(tab)) return { view: 'timetable', timetableTab: tab, focus: null }
    return { view: 'timetable', timetableTab: 'week', focus: null }
  }
  return LEGACY[head] ?? DEFAULT_ROUTE
}

/** 写回地址栏时用规范 hash，前进/后退和刷新才能停在同一个二级页。 */
export function routeHash(route: Route): string {
  if (route.view === 'timetable') return `timetable/${route.timetableTab}`
  if (route.view === 'today' && route.focus === 'todos') return 'todos'
  return route.view
}

export function routeForView(view: PrimaryView): Route {
  return { view, timetableTab: 'week', focus: null }
}

export function isAdminHash(hash: string, pathname = ''): boolean {
  const clean = hash.replace(/^#/, '')
  return clean === 'admin' || clean.startsWith('admin/') || /\/admin(\/|$)/.test(pathname)
}
