export type View = 'today' | 'calendar' | 'todos' | 'schedule' | 'days' | 'notes'

export type ExamKind = 'midterm' | 'final' | 'makeup' | 'other'
export type TermKind = 'fall' | 'spring' | 'summer' | 'winter' | 'practice' | 'intern'
export interface Term { id: string; yearStart: number; kind: TermKind; title?: string; startDate: string; weekCount: number }
export interface ClassPeriod { start: string; end: string }
export interface TimetableViewSettings { weekStartsOn: 1 | 7; showOffWeekCourses: boolean; hiddenHours: number[]; hiddenWeekdays: number[]; classPeriods: ClassPeriod[] }
export interface Course {
  id: string; name: string; weekday: number; startTime: string; endTime: string; location?: string; teacher?: string; weeks?: string; color: string; remindMinutes: number; createdAt: number; termId?: string; note?: string
}
export interface Exam { id: string; name: string; kind: ExamKind; date: string; startTime: string; endTime?: string; location?: string; seat?: string; remindMinutes: number; createdAt: number }
export interface ReminderSettings { enabled: boolean; classDefaultMinutes: number; examDefaultMinutes: number; examAlsoHourBefore: boolean }
export const COURSE_COLORS = ['#2563eb','#fb7185','#ff6b35','#ffb703','#e11d48','#38bdf8','#f472b6','#1d4ed8'] as const
export const defaultReminderSettings = (): ReminderSettings => ({ enabled: true, classDefaultMinutes: 15, examDefaultMinutes: 1440, examAlsoHourBefore: true })
export const EXAM_KIND_LABEL: Record<ExamKind,string> = { midterm:'期中', final:'期末', makeup:'补考', other:'其他' }
export type Priority = 'high' | 'medium' | 'low'
export interface Todo { id:string; title:string; done:boolean; dueDate?:string; priority:Priority; createdAt:number }
export interface Countdown { id:string; title:string; date:string; color:string; emoji:string; repeatYearly:boolean; createdAt:number }
export interface Note { id:string; title:string; body:string; color:string; pinned:boolean; date?:string; updatedAt:number }
export interface AppData { todos:Todo[]; countdowns:Countdown[]; notes:Note[]; courses:Course[]; exams:Exam[]; reminderSettings:ReminderSettings; terms:Term[]; currentTermId?:string; timetableView:TimetableViewSettings; termStart?:string }
export const NOTE_COLORS = ['#fef08a','#fecdd3','#bbf7d0','#bae6fd','#ddd6fe','#fed7aa'] as const
export const COUNTDOWN_COLORS = ['#2563eb','#ff6b35','#e11d48','#fb7185','#38bdf8','#ffb703'] as const
export const COUNTDOWN_EMOJIS = ['🎯','🎂','✈️','📚','💍','🎓','🏠','🎉'] as const
export const STORAGE_KEY = 'kemiao-days-v1'
