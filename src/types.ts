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
export interface ReminderSettings { enabled: boolean; classDefaultMinutes: number; examDefaultMinutes: number; eventDefaultMinutes: number; todoDefaultMinutes: number; selfScheduleDefaultMinutes: number; examAlsoHourBefore: boolean }
export const COURSE_COLORS = ['#2563eb','#3b82f6','#60a5fa','#38bdf8','#06b6d4','#14b8a6','#10b981','#22c55e','#84cc16','#eab308','#f59e0b','#f97316','#fb7185','#f43f5e','#e11d48','#ec4899','#d946ef','#a855f7','#8b5cf6','#7c3aed','#6366f1','#0f766e','#0891b2','#0369a1','#1d4ed8','#be123c','#c2410c','#a16207','#4d7c0f','#475569','#64748b','#334155'] as const
export const SELF_SCHEDULE_COLORS = ['#2563eb','#16a34a','#f97316','#e11d48','#7c3aed','#0891b2','#ca8a04'] as const
export const CALENDAR_EVENT_COLORS = ['#2563eb','#16a34a','#f97316','#e11d48','#7c3aed','#0891b2','#ca8a04'] as const
export const defaultReminderSettings = (): ReminderSettings => ({ enabled: true, classDefaultMinutes: 15, examDefaultMinutes: 1440, eventDefaultMinutes: 15, todoDefaultMinutes: 15, selfScheduleDefaultMinutes: 10, examAlsoHourBefore: true })
export const EXAM_KIND_LABEL: Record<ExamKind,string> = { midterm:'期中', final:'期末', makeup:'补考', other:'其他' }
export interface Todo { id:string; title:string; done:boolean; dueDate?:string; dueTime?:string; priority:Priority; remindMinutes:number; createdAt:number }
export interface Countdown { id:string; title:string; date:string; color:string; emoji:string; repeatYearly:boolean; createdAt:number }
export interface Note { id:string; title:string; body:string; color:string; pinned:boolean; date?:string; updatedAt:number }
export interface AppData { todos:Todo[]; countdowns:Countdown[]; notes:Note[]; courses:Course[]; exams:Exam[]; selfSchedules:SelfScheduleItem[]; calendarEvents:CalendarEvent[]; reminderSettings:ReminderSettings; terms:Term[]; currentTermId?:string; timetableView:TimetableViewSettings; termStart?:string }
export const NOTE_COLORS = ['#fef08a','#fecdd3','#bbf7d0','#bae6fd','#ddd6fe','#fed7aa'] as const
export const COUNTDOWN_COLORS = ['#2563eb','#ff6b35','#e11d48','#fb7185','#38bdf8','#ffb703'] as const
export const COUNTDOWN_EMOJIS = ['🎯','🎂','✈️','📚','💍','🎓','🏠','🎉'] as const
export const STORAGE_KEY = 'kemiao-days-v1'
