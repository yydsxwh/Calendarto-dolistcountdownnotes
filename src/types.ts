export type View = 'today' | 'calendar' | 'todos' | 'schedule' | 'exams' | 'selfschedule' | 'days' | 'notes'
export type ExamKind = 'midterm' | 'final' | 'makeup' | 'other'
export type TermKind = 'fall' | 'spring' | 'summer' | 'winter' | 'practice' | 'intern'
export type Priority = 'high' | 'medium' | 'low'
export type ReminderMinutes = 0 | 5 | 10 | 15 | 30 | 60 | 120 | 1440
export interface Term { id: string; yearStart: number; kind: TermKind; title?: string; startDate: string; weekCount: number }
export interface ClassPeriod { start: string; end: string }
export interface TimetableViewSettings { weekStartsOn: 1 | 7; showOffWeekCourses: boolean; hiddenHours: number[]; hiddenWeekdays: number[]; classPeriods: ClassPeriod[] }
export interface Course { id: string; name: string; weekday: number; startTime: string; endTime: string; location?: string; teacher?: string; weeks?: string; color: string; remindMinutes: number; createdAt: number; termId?: string; note?: string }
export interface Exam { id: string; name: string; kind: ExamKind; date: string; startTime: string; endTime?: string; location?: string; seat?: string; remindMinutes: number; createdAt: number }
export interface SelfScheduleItem { id: string; title: string; weekday: number; startTime: string; endTime: string; color: string; note?: string; remindMinutes: number; priority: Priority; createdAt: number }
export interface CalendarEvent { id: string; title: string; date: string; startTime?: string; endTime?: string; allDay: boolean; location?: string; note?: string; color: string; priority: Priority; remindMinutes: number; repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'; createdAt: number }
/** 已实现：天 / 周 / 月 / 年。不要把规则写死成只有「每年」。 */
export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'
/**
 * 周期规则。现在完整支持 interval。
 * term / season / onThisDay 只占位，给以后「每学期」「开学后 N 天」
 * 「期末前 N 天」「季节/事件前后 N 天」「那年今日」留结构，本轮不算 occurrence。
 */
export type RecurrenceKind = 'interval' | 'term' | 'season' | 'onThisDay'
export type TermRecurrencePhase = 'afterStart' | 'beforeEnd'
export interface RecurrenceRule {
  kind: RecurrenceKind
  interval?: number
  unit?: RecurrenceUnit
  termPhase?: TermRecurrencePhase
  offsetDays?: number
  season?: string
  eventKey?: string
}
export interface RecurringReminder {
  id: string
  title: string
  body?: string
  startDate: string
  remindTime?: string
  rule: RecurrenceRule
  endDate?: string
  neverEnds: boolean
  enabled: boolean
  createdAt: number
  updatedAt: number
}
export const RECURRENCE_UNITS: { id: RecurrenceUnit; label: string }[] = [
  { id: 'day', label: '天' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
  { id: 'year', label: '年' },
]
export interface ReminderSettings { enabled: boolean; classDefaultMinutes: number; examDefaultMinutes: number; eventDefaultMinutes: number; todoDefaultMinutes: number; selfScheduleDefaultMinutes: number; examAlsoHourBefore: boolean }
export type ReminderTargetType = 'todo' | 'event' | 'exam' | 'course' | 'self' | 'day' | 'holiday' | 'recurring'
export type ReminderDelivery = 'notification' | 'alarm'
export type TriggerMode = 'absolute' | 'relative'
/** 用户自己的提醒。enabled 默认 false，避免旧数据升级后突然响铃。 */
export interface ReminderRule {
  id: string
  targetType: ReminderTargetType
  targetId: string
  delivery: ReminderDelivery
  triggerMode: TriggerMode
  triggerAt?: string
  offsetMinutes?: number
  timezone: string
  enabled: boolean
  snoozeMinutes?: number
  vibrationEnabled?: boolean
  createdAt: number
  updatedAt: number
  revision: number
}
export interface HolidaySettings { showCn: boolean; showUs: boolean; showPublic: boolean; showTraditional: boolean; showAdjusted: boolean; updatedAt: number }
export interface HolidayFavorite { id: string; stableKey: string; region: 'CN' | 'US'; createdAt: number }
export const COURSE_COLORS = ['#2563eb','#3b82f6','#60a5fa','#38bdf8','#06b6d4','#14b8a6','#10b981','#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#fb7185','#f43f5e','#e11d48','#ec4899','#d946ef','#a855f7','#8b5cf6','#7c3aed','#6366f1','#0f766e','#0891b2','#0369a1','#1d4ed8','#be123c','#c2410c','#a16207','#4d7c0f','#475569','#64748b','#334155'] as const
export const SELF_SCHEDULE_COLORS = ['#2563eb','#16a34a','#f97316','#e11d48','#7c3aed','#0891b2','#ca8a04'] as const
export const CALENDAR_EVENT_COLORS = ['#2563eb','#16a34a','#f97316','#e11d48','#7c3aed','#0891b2','#ca8a04'] as const
export const defaultReminderSettings = (): ReminderSettings => ({ enabled: true, classDefaultMinutes: 15, examDefaultMinutes: 1440, eventDefaultMinutes: 15, todoDefaultMinutes: 15, selfScheduleDefaultMinutes: 10, examAlsoHourBefore: true })
export const EXAM_KIND_LABEL: Record<ExamKind,string> = { midterm:'期中', final:'期末', makeup:'补考', other:'其他' }
export interface Todo { id:string; title:string; done:boolean; dueDate?:string; dueTime?:string; dueEndTime?:string; priority:Priority; remindMinutes:number; createdAt:number }
export interface Countdown { id:string; title:string; date:string; color:string; emoji:string; repeatYearly:boolean; createdAt:number }
export interface Note { id:string; title:string; body:string; color:string; pinned:boolean; date?:string; updatedAt:number }
export interface Tombstone { id: string; deletedAt: number }
export interface AppData { todos:Todo[]; countdowns:Countdown[]; notes:Note[]; courses:Course[]; exams:Exam[]; selfSchedules:SelfScheduleItem[]; calendarEvents:CalendarEvent[]; recurringReminders:RecurringReminder[]; reminderRules:ReminderRule[]; holidaySettings:HolidaySettings; holidayFavorites:HolidayFavorite[]; reminderSettings:ReminderSettings; terms:Term[]; currentTermId?:string; timetableView:TimetableViewSettings; termStart?:string; tombstones:Tombstone[] }
export const NOTE_COLORS = ['#fef08a','#fecdd3','#bbf7d0','#bae6fd','#ddd6fe','#fed7aa'] as const
export const COUNTDOWN_COLORS = ['#2563eb','#ff6b35','#e11d48','#fb7185','#38bdf8','#ffb703'] as const
export const COUNTDOWN_EMOJIS = ['🎯','🎂','✈️','📚','💍','🎓','🏠','🎉'] as const
export const STORAGE_KEY = 'kemiao-days-v1'
