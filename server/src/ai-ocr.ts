import type { PlatformClient } from '@yydsxwh/shared/platform-client/index'
import type { DaysConfig } from './config'

export type OcrKind = 'courses' | 'exams' | 'self' | 'auto'

const TIMETABLE_PROMPT = `你是课表 / 考试表 / 自律时间表识别器。只输出一个 JSON 对象，不要 markdown。
字段：
- courses: [{name, weekday, weekdayLabel, startTime, endTime, location, teacher, weeks}]
- exams: [{name, kind, date, startTime, endTime, location, seat}]
- selfSchedules: [{title, weekday, weekdayLabel, startTime, endTime, note}]
- warnings: string[]
weekday 用 1-7（周一=1）。时间用 HH:MM。日期用 YYYY-MM-DD。
认不出的字段省略。不要编造没印在图上的课。`

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced?.[1] || trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('NO_JSON')
  return JSON.parse(raw.slice(start, end + 1))
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[] : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeOcrPayload(raw: unknown, kind: OcrKind = 'auto'): Record<string, unknown> {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const courses = asArray(record.courses).map((item) => ({
    name: text(item.name) || text(item.course) || text(item.title),
    weekday: item.weekday,
    weekdayLabel: text(item.weekdayLabel) || text(item.day),
    startTime: text(item.startTime) || text(item.start),
    endTime: text(item.endTime) || text(item.end),
    location: text(item.location) || undefined,
    teacher: text(item.teacher) || undefined,
    weeks: text(item.weeks) || undefined,
  })).filter((item) => item.name)
  const exams = asArray(record.exams).map((item) => ({
    name: text(item.name) || text(item.course) || text(item.subject),
    kind: text(item.kind) || undefined,
    date: text(item.date) || text(item.examDate),
    startTime: text(item.startTime) || text(item.time),
    endTime: text(item.endTime) || undefined,
    location: text(item.location) || undefined,
    seat: text(item.seat) || undefined,
  })).filter((item) => item.name && item.date)
  const selfSchedules = asArray(record.selfSchedules || record.self).map((item) => ({
    title: text(item.title) || text(item.name),
    weekday: item.weekday,
    weekdayLabel: text(item.weekdayLabel),
    startTime: text(item.startTime) || text(item.start),
    endTime: text(item.endTime) || text(item.end),
    note: text(item.note) || undefined,
  })).filter((item) => item.title)
  const warnings = Array.isArray(record.warnings) ? record.warnings.map((item) => String(item)) : []
  const focused = {
    courses: kind === 'exams' || kind === 'self' ? [] : courses,
    exams: kind === 'courses' || kind === 'self' ? [] : exams,
    selfSchedules: kind === 'courses' || kind === 'exams' ? [] : selfSchedules,
    warnings,
    model: text(record.model) || undefined,
  }
  return focused
}

export async function recognizeWithPlatform(
  platform: PlatformClient,
  input: { imageBase64: string; mimeType: string; userHint: string; kind: OcrKind; actorId: string },
): Promise<Record<string, unknown>> {
  const hint = input.userHint.trim()
  const asUser = platform.withActor(input.actorId)
  const result = await asUser.ai.chat({
    purpose: 'vision-ocr',
    temperature: 0.1,
    maxTokens: 4000,
    metadata: { product: 'rishi', kind: input.kind },
    messages: [
      { role: 'system', content: TIMETABLE_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: hint ? `用户补充：${hint}` : '请识别这张表。' },
          { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
        ],
      },
    ],
  })
  const parsed = extractJson(result.content)
  return { ...normalizeOcrPayload(parsed, input.kind), model: result.model }
}

export async function recognizeWithWwwFallback(
  config: DaysConfig,
  input: { fileName: string; bytes: Buffer; mimeType: string; userHint: string },
): Promise<Record<string, unknown>> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(input.bytes)], { type: input.mimeType }), input.fileName)
  if (input.userHint.trim()) form.append('userHint', input.userHint.trim())
  const response = await fetch(config.wwwOcrUrl, { method: 'POST', body: form, signal: AbortSignal.timeout(45000) })
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok || payload.error) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `OCR_${response.status}`)
  }
  return { ...normalizeOcrPayload(payload), ...payload }
}
