import {
  COURSE_COLORS,
  EXAM_KIND_LABEL,
  type Course,
  type Exam,
  type ExamKind,
} from '../types'
import { classifyTimetableFile } from './file-kinds'
import {
  durationMinutes,
  normalizeClockInput,
  parsePeriodHint,
  parseTimeRange,
  parseWeekday,
} from './periods'
import type { TimetableImportResult } from './timetable-import'
import { uid } from './store'

export type OcrCourseDraft = {
  name: string
  weekday: number
  startTime: string
  endTime: string
  location?: string
  teacher?: string
  weeks?: string
}

export type OcrExamDraft = {
  name: string
  kind?: string
  date: string
  startTime: string
  endTime?: string
  location?: string
  seat?: string
}

export type TimetableOcrPayload = {
  courses?: OcrCourseDraft[]
  exams?: OcrExamDraft[]
  warnings?: string[]
  model?: string
  error?: string
}

const OCR_PATH = '/api/days/timetable-ocr'

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

function warningList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : text(asRecord(item).message)))
    .filter(Boolean)
}

function parseExamKind(raw: string): ExamKind {
  if (/补/.test(raw)) return 'makeup'
  if (/期末|final/i.test(raw)) return 'final'
  if (/期中|mid/i.test(raw)) return 'midterm'
  if (raw in EXAM_KIND_LABEL) return raw as ExamKind
  return 'other'
}

function parseDate(raw: string): string | null {
  const textValue = raw.trim()
  const iso = textValue.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (iso) {
    return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`
  }
  const md = textValue.match(/^(\d{1,2})[-/.月](\d{1,2})/)
  if (md) {
    const now = new Date()
    return `${now.getFullYear()}-${String(Number(md[1])).padStart(2, '0')}-${String(Number(md[2])).padStart(2, '0')}`
  }
  return null
}

function resolveSlot(item: Record<string, unknown>): { start: string; end: string } | null {
  const ranged =
    parseTimeRange(`${text(item.startTime)}-${text(item.endTime)}`) ||
    parseTimeRange(text(item.time) || text(item.period) || '') ||
    parsePeriodHint(text(item.period) || text(item.time) || '')
  if (ranged) return ranged
  const start = normalizeClockInput(text(item.startTime))
  const end = normalizeClockInput(text(item.endTime))
  if (start && end) return { start, end }
  return null
}

function resolveWeekday(value: unknown): number | null {
  if (typeof value === 'number' && value >= 1 && value <= 7) return value
  const fromText = parseWeekday(text(value))
  if (fromText) return fromText
  const n = Number(value)
  return n >= 1 && n <= 7 ? n : null
}

export function hydrateTimetableOcr(
  raw: TimetableOcrPayload,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
): TimetableImportResult {
  const warnings = warningList(raw.warnings)
  const courses: Course[] = []
  const exams: Exam[] = []

  for (const item of raw.courses || []) {
    const rec = item as unknown as Record<string, unknown>
    const name = text(rec.name)
    const weekday = resolveWeekday(rec.weekday)
    const slot = resolveSlot(rec)
    if (!name || !weekday || !slot) {
      warnings.push(`已跳过无法核对的课程：${name || '（无课名）'}`)
      continue
    }
    if (durationMinutes(slot.start, slot.end) <= 0) {
      warnings.push(`「${name}」结束时间不晚于开始时间，已跳过`)
      continue
    }
    courses.push({
      id: uid(),
      name,
      weekday,
      startTime: slot.start,
      endTime: slot.end,
      location: text(rec.location) || undefined,
      teacher: text(rec.teacher) || undefined,
      weeks: text(rec.weeks) || undefined,
      color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
      remindMinutes: defaults.classRemindMinutes,
      createdAt: Date.now(),
    })
  }

  for (const item of raw.exams || []) {
    const rec = item as unknown as Record<string, unknown>
    const name = text(rec.name)
    const date = parseDate(text(rec.date))
    const start = normalizeClockInput(text(rec.startTime) || text(rec.time)) || '09:00'
    const end = text(rec.endTime) ? normalizeClockInput(text(rec.endTime)) || undefined : undefined
    if (!name || !date) {
      warnings.push(`已跳过无法核对的考试：${name || '（无科目）'}`)
      continue
    }
    exams.push({
      id: uid(),
      name,
      kind: parseExamKind(text(rec.kind) || name),
      date,
      startTime: start,
      endTime: end,
      location: text(rec.location) || undefined,
      seat: text(rec.seat) || undefined,
      remindMinutes: defaults.examRemindMinutes,
      createdAt: Date.now(),
    })
  }

  const kind =
    courses.length && exams.length ? 'mixed' : exams.length ? 'exams' : 'courses'
  return { courses, exams, warnings, sheets: raw.model ? [raw.model] : ['ai'], kind }
}

export async function recognizeTimetableFile(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
  userHint = '',
): Promise<TimetableImportResult> {
  const form = new FormData()
  form.append('file', file, file.name)
  if (userHint.trim()) form.append('userHint', userHint.trim())

  const res = await fetch(OCR_PATH, { method: 'POST', body: form })
  let payload: TimetableOcrPayload = {}
  try {
    payload = (await res.json()) as TimetableOcrPayload
  } catch {
    throw new Error(res.ok ? '识别接口没有返回 JSON' : `识别失败（${res.status}）`)
  }
  if (!res.ok || payload.error) {
    throw new Error(payload.error || `识别失败（${res.status}）`)
  }
  const result = hydrateTimetableOcr(payload, defaults)
  if (result.courses.length === 0 && result.exams.length === 0) {
    throw new Error(
      payload.warnings?.length
        ? `没有识别到课程或考试。${payload.warnings.slice(0, 2).join('；')}`
        : '没有识别到课程或考试。请换更清晰的课表照片，或改用表格导入。',
    )
  }
  return result
}

export async function renderPdfPages(file: File, maxPages = 2): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const count = Math.min(doc.numPages, maxPages)
  const pages: File[] = []
  for (let i = 1; i <= count; i++) {
    const page = await doc.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法把 PDF 转成图片')
    await page.render({ canvasContext: ctx, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    page.cleanup()
    if (!blob) throw new Error(`PDF 第 ${i} 页渲染失败`)
    pages.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')}-p${i}.png`, { type: 'image/png' }))
  }
  return pages
}

export async function importViaAi(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
  userHint = '',
): Promise<TimetableImportResult> {
  const kind = classifyTimetableFile(file.name, file.type)
  if (kind === 'pdf') {
    const pages = await renderPdfPages(file)
    const merged: TimetableImportResult = {
      courses: [],
      exams: [],
      warnings: [],
      sheets: [],
      kind: 'courses',
    }
    for (const page of pages) {
      const part = await recognizeTimetableFile(page, defaults, userHint)
      merged.courses.push(...part.courses)
      merged.exams.push(...part.exams)
      merged.warnings.push(...part.warnings)
      merged.sheets.push(...part.sheets)
    }
    merged.kind =
      merged.courses.length && merged.exams.length
        ? 'mixed'
        : merged.exams.length
          ? 'exams'
          : 'courses'
    return merged
  }
  return recognizeTimetableFile(file, defaults, userHint)
}
