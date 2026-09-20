import {
  COURSE_COLORS,
  EXAM_KIND_LABEL,
  SELF_SCHEDULE_COLORS,
  type Course,
  type Exam,
  type ExamKind,
  type SelfScheduleItem,
} from '../types'
import { classifyTimetableFile } from './file-kinds'
import { explainOcrHttpError, prepareTimetableImage } from './image-prep'
import {
  flattenTimetableOcrPayload,
  resolveOcrWeekday,
  splitPackedCourse,
  text,
} from './ocr-flatten'
import {
  durationMinutes,
  normalizeClockInput,
  parsePeriodHint,
  parseTimeRange,
} from './periods'
import type { TimetableImportResult } from './timetable-import'
import { daysFetch } from './days-api'
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
  courses?: unknown
  exams?: OcrExamDraft[] | unknown
  warnings?: string[]
  model?: string
  error?: string
  dayHeaders?: unknown
  slots?: unknown
  grid?: unknown
  schedule?: unknown
  [key: string]: unknown
}

function ocrEndpoint(): string {
  return '/api/days/timetable-ocr'
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
  const startRaw = text(item.startTime)
  const endRaw = text(item.endTime)
  const periodRaw = text(item.period) || text(item.time) || text(item.slot)
  const ranged =
    parseTimeRange(`${startRaw}-${endRaw}`) ||
    parseTimeRange(periodRaw) ||
    parsePeriodHint(periodRaw) ||
    parsePeriodHint(startRaw) ||
    parsePeriodHint(`${startRaw}${endRaw ? `-${endRaw}` : ''}`)
  if (ranged) return ranged
  const start = normalizeClockInput(startRaw)
  const end = normalizeClockInput(endRaw)
  if (start && end) return { start, end }
  return null
}

/** Models sometimes emit 0–6 (Monday=0) instead of 1–7 (Monday=1). */
export function remapZeroBasedWeekdays<T extends { weekday?: unknown }>(items: T[]): T[] {
  const nums = items
    .map((item) => Number((item as { weekday?: unknown }).weekday))
    .filter((n) => Number.isFinite(n))
  if (
    nums.length > 0 &&
    nums.every((n) => n >= 0 && n <= 6) &&
    nums.some((n) => n === 0) &&
    !nums.some((n) => n === 7)
  ) {
    return items.map((item) => {
      const n = Number((item as { weekday?: unknown }).weekday)
      if (!Number.isFinite(n)) return item
      return { ...item, weekday: n + 1 }
    })
  }
  return items
}

export function hydrateTimetableOcr(
  raw: TimetableOcrPayload,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
): TimetableImportResult {
  const flat = flattenTimetableOcrPayload(raw)
  const warnings = [...flat.warnings]
  const courses: Course[] = []
  const exams: Exam[] = []
  const datedExamDrafts: Record<string, unknown>[] = []
  const courseDrafts: Record<string, unknown>[] = []
  for (const item of flat.courses) {
    const rec = item as Record<string, unknown>
    if (parseDate(text(rec.date) || text(rec.examDate) || text(rec['日期']))) {
      datedExamDrafts.push(rec)
    } else {
      courseDrafts.push(rec)
    }
  }
  const drafts = remapZeroBasedWeekdays(courseDrafts)

  for (const item of drafts) {
    const rec = item as unknown as Record<string, unknown>
    const meta = splitPackedCourse(rec)
    const weekday = resolveOcrWeekday({ ...rec, ...meta })
    const slot = resolveSlot(rec)
    if (!meta.name || !weekday || !slot) {
      warnings.push(`已跳过无法核对的课程：${meta.name || '（无课名）'}`)
      continue
    }
    if (durationMinutes(slot.start, slot.end) <= 0) {
      warnings.push(`「${meta.name}」结束时间不晚于开始时间，已跳过`)
      continue
    }
    courses.push({
      id: uid(),
      name: meta.name,
      weekday,
      startTime: slot.start,
      endTime: slot.end,
      location: meta.location,
      teacher: meta.teacher,
      weeks: meta.weeks,
      color: COURSE_COLORS[courses.length % COURSE_COLORS.length],
      remindMinutes: defaults.classRemindMinutes,
      createdAt: Date.now(),
    })
  }

  const examItems = [...flat.exams, ...datedExamDrafts]
  for (const item of examItems) {
    const rec = item as unknown as Record<string, unknown>
    const name = text(rec.name) || text(rec.course) || text(rec.subject) || text(rec.title)
    const date = parseDate(text(rec.date) || text(rec.examDate) || text(rec['日期']))
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

  const selfSchedules: SelfScheduleItem[] = []
  const selfDrafts = remapZeroBasedWeekdays(asArray((raw as { selfSchedules?: unknown }).selfSchedules))
  for (const item of selfDrafts) {
    const rec = item as Record<string, unknown>
    const title = text(rec.title) || text(rec.name)
    const weekday = resolveOcrWeekday(rec)
    const slot = resolveSlot(rec)
    if (!title || !weekday || !slot) continue
    selfSchedules.push({
      id: uid(),
      title,
      weekday,
      startTime: slot.start,
      endTime: slot.end,
      color: SELF_SCHEDULE_COLORS[selfSchedules.length % SELF_SCHEDULE_COLORS.length],
      note: text(rec.note) || undefined,
      remindMinutes: 10,
      priority: 'medium',
      createdAt: Date.now(),
    })
  }

  const kind =
    selfSchedules.length && !courses.length && !exams.length
      ? 'self'
      : courses.length && exams.length
        ? 'mixed'
        : exams.length
          ? 'exams'
          : 'courses'
  return { courses, exams, selfSchedules, warnings, sheets: flat.model ? [flat.model] : ['ai'], kind }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : []
}

export async function recognizeTimetableFile(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
  userHint = '',
): Promise<TimetableImportResult> {
  const upload =
    classifyTimetableFile(file.name, file.type) === 'image' ? await prepareTimetableImage(file) : file
  const form = new FormData()
  form.append('file', upload, upload.name)
  if (userHint.trim()) form.append('userHint', userHint.trim())

  const res = await daysFetch(ocrEndpoint(), { method: 'POST', body: form })
  let payload: TimetableOcrPayload = {}
  try {
    payload = (await res.json()) as TimetableOcrPayload
  } catch {
    throw new Error(
      res.ok ? '识别接口没有返回 JSON' : explainOcrHttpError(res.status, `识别失败（${res.status}）`),
    )
  }
  if (!res.ok || payload.error) {
    throw new Error(payload.error || explainOcrHttpError(res.status, `识别失败（${res.status}）`))
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
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
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
      selfSchedules: [],
      warnings: [],
      sheets: [],
      kind: 'courses',
    }
    for (const page of pages) {
      const part = await recognizeTimetableFile(page, defaults, userHint)
      merged.courses.push(...part.courses)
      merged.exams.push(...part.exams)
      merged.selfSchedules?.push(...(part.selfSchedules ?? []))
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
