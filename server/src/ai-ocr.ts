import type { PlatformClient } from '@yydsxwh/shared/platform-client/index'
import { extractDocx, isDocx, isLegacyDoc } from './docx'

export type OcrKind = 'courses' | 'exams' | 'self' | 'auto'

/**
 * OCR 失败必须能分清是谁的问题，用户看到的提示才不会永远是「识别失败」。
 * code 给客户端做分支，message 直接展示给用户。
 */
export class OcrError extends Error {
  constructor(
    readonly code: OcrErrorCode,
    message: string,
    readonly status = 502,
  ) {
    super(message)
    this.name = 'OcrError'
  }
}

export type OcrErrorCode =
  | 'ai_unconfigured'
  | 'platform_unreachable'
  | 'service_token_invalid'
  | 'login_required'
  | 'no_vision_model'
  | 'file_too_large'
  | 'unsupported_format'
  | 'legacy_doc'
  | 'upstream_timeout'
  | 'no_result'
  | 'bad_model_output'

/** 客户端、BFF、nginx 统一用这个上限，不要再出现 8MB / 20MB 两套 */
export const MAX_OCR_FILE_BYTES = 20 * 1024 * 1024

const TIMETABLE_PROMPT = `你是课表 / 考试表 / 自律时间表识别器。只输出一个 JSON 对象，不要 markdown。
字段：
- courses: [{name, weekday, weekdayLabel, startTime, endTime, location, teacher, weeks}]
- exams: [{name, kind, date, startTime, endTime, location, seat}]
- selfSchedules: [{title, weekday, weekdayLabel, startTime, endTime, note}]
- warnings: string[]
weekday 用 1-7（周一=1）。时间用 HH:MM 24 小时制，结束时间必须晚于开始时间。日期用 YYYY-MM-DD。
第一列通常是节次或钟点，不是星期一，不要把它当成 weekday=1。
认不出的字段省略。不要编造没印在原件上的课程或考试。`

const KIND_HINT: Record<OcrKind, string> = {
  courses: '这是周课表，只返回 courses。',
  exams: '这是考试安排表，只返回 exams，每条必须有日期。',
  self: '这是自律 / 假期时间表，只返回 selfSchedules。',
  auto: '判断这是课表、考试表还是自律表，返回对应字段。',
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced?.[1] || trimmed
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end < start) throw new OcrError('bad_model_output', '模型没有返回可解析的表格数据，请换一张更清晰的原件。')
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    throw new OcrError('bad_model_output', '模型返回的数据格式不合法，请重试一次。')
  }
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === 'object') as Record<string, unknown>[])
    : []
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

/** HH:mm，允许 8:5 这种半成品，拒绝 25:70 */
export function normalizeClock(value: unknown): string | undefined {
  const raw = text(value).replace(/[：.]/g, ':')
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(raw)
  if (!match) return undefined
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return undefined
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function normalizeIsoDate(value: unknown): string | undefined {
  const raw = text(value).replace(/[/.年月]/g, '-').replace(/日/g, '')
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeWeekday(value: unknown): number | undefined {
  const n = Number(text(value))
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : undefined
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * 模型给什么就存什么会把脏数据写进用户课表，所以这里逐条校验：
 * 星期 1–7、时间 HH:mm、结束晚于开始、日期真实存在。不合格的丢掉并记 warning。
 */
export function normalizeOcrPayload(raw: unknown, kind: OcrKind = 'auto'): Record<string, unknown> {
  const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const warnings = Array.isArray(record.warnings) ? record.warnings.map((item) => String(item)) : []

  const courses: Record<string, unknown>[] = []
  for (const item of asArray(record.courses)) {
    const name = text(item.name) || text(item.course) || text(item.title)
    if (!name) continue
    const startTime = normalizeClock(item.startTime ?? item.start)
    const endTime = normalizeClock(item.endTime ?? item.end)
    // weekday / 节次的还原在客户端 hydrate 里做，这里只挡明显越界的值
    const weekday = normalizeWeekday(item.weekday)
    if (startTime && endTime && minutes(endTime) <= minutes(startTime)) {
      warnings.push(`「${name}」结束时间不晚于开始时间，已跳过`)
      continue
    }
    courses.push({
      name,
      weekday,
      weekdayLabel: text(item.weekdayLabel) || text(item.day),
      startTime: startTime ?? text(item.startTime),
      endTime: endTime ?? text(item.endTime),
      location: text(item.location) || undefined,
      teacher: text(item.teacher) || undefined,
      weeks: text(item.weeks) || undefined,
    })
  }

  const exams: Record<string, unknown>[] = []
  for (const item of asArray(record.exams)) {
    const name = text(item.name) || text(item.course) || text(item.subject)
    const date = normalizeIsoDate(item.date ?? item.examDate)
    if (!name) continue
    if (!date) {
      warnings.push(`考试「${name}」没有合法日期，已跳过`)
      continue
    }
    const startTime = normalizeClock(item.startTime ?? item.time)
    const endTime = normalizeClock(item.endTime)
    if (startTime && endTime && minutes(endTime) <= minutes(startTime)) {
      warnings.push(`考试「${name}」结束时间不晚于开始时间，已跳过`)
      continue
    }
    exams.push({
      name,
      kind: text(item.kind) || undefined,
      date,
      startTime: startTime ?? '09:00',
      endTime,
      location: text(item.location) || undefined,
      seat: text(item.seat) || undefined,
    })
  }

  const selfSchedules: Record<string, unknown>[] = []
  for (const item of asArray(record.selfSchedules ?? record.self)) {
    const title = text(item.title) || text(item.name)
    if (!title) continue
    const startTime = normalizeClock(item.startTime ?? item.start)
    const endTime = normalizeClock(item.endTime ?? item.end)
    if (startTime && endTime && minutes(endTime) <= minutes(startTime)) {
      warnings.push(`「${title}」结束时间不晚于开始时间，已跳过`)
      continue
    }
    selfSchedules.push({
      title,
      weekday: normalizeWeekday(item.weekday),
      weekdayLabel: text(item.weekdayLabel),
      startTime: startTime ?? text(item.startTime),
      endTime: endTime ?? text(item.endTime),
      note: text(item.note) || undefined,
    })
  }

  return {
    courses: kind === 'exams' || kind === 'self' ? [] : courses,
    exams: kind === 'courses' || kind === 'self' ? [] : exams,
    selfSchedules: kind === 'courses' || kind === 'exams' ? [] : selfSchedules,
    warnings,
    model: text(record.model) || undefined,
  }
}

export type OcrInput = {
  fileName: string
  mimeType: string
  bytes: Buffer
  userHint: string
  kind: OcrKind
  actorId: string
}

const IMAGE_MIME = /^image\/(png|jpe?g|webp|gif|bmp)$/i
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i

/**
 * 把上传的文件拆成「给模型看的图」和「给模型读的文本」。
 * PDF 已经在客户端逐页转成 PNG 再上传，这里只会看到图片、DOCX 或纯文本。
 */
export function buildParts(input: OcrInput): {
  images: { mimeType: string; base64: string }[]
  text: string
} {
  const { fileName, mimeType, bytes } = input
  if (IMAGE_MIME.test(mimeType) || IMAGE_EXT.test(fileName)) {
    return { images: [{ mimeType: normalizeImageMime(mimeType, fileName), base64: bytes.toString('base64') }], text: '' }
  }
  if (isLegacyDoc(fileName, mimeType)) {
    throw new OcrError(
      'legacy_doc',
      '旧版 .doc / .wps 读不了。请在 Word 或 WPS 里「另存为 .docx」，或直接截图课表再导入。',
      415,
    )
  }
  if (isDocx(fileName, mimeType)) {
    let content
    try {
      content = extractDocx(bytes)
    } catch {
      throw new OcrError('unsupported_format', '这个 Word 文档打不开，请另存为 .docx 或改用截图导入。', 415)
    }
    if (!content.text.trim() && content.images.length === 0) {
      throw new OcrError('no_result', 'Word 文档里没有找到文字或课表图片。', 422)
    }
    return {
      images: content.images.map((image) => ({
        mimeType: image.mimeType,
        base64: image.bytes.toString('base64'),
      })),
      text: content.text,
    }
  }
  if (/^text\//i.test(mimeType) || /\.(txt|md|csv|tsv)$/i.test(fileName)) {
    return { images: [], text: bytes.toString('utf8').slice(0, 20_000) }
  }
  if (mimeType === 'application/pdf' || /\.pdf$/i.test(fileName)) {
    throw new OcrError(
      'unsupported_format',
      'PDF 需要先转成图片。请在日事里重新选择这份 PDF，客户端会自动逐页转图。',
      415,
    )
  }
  throw new OcrError('unsupported_format', '暂不支持这种文件。可用 JPG / PNG / WebP / PDF / DOCX / Excel / CSV。', 415)
}

function normalizeImageMime(mimeType: string, fileName: string): string {
  if (IMAGE_MIME.test(mimeType)) return mimeType.toLowerCase()
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase()
  return ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
}

export async function recognizeWithPlatform(
  platform: PlatformClient,
  input: OcrInput,
): Promise<Record<string, unknown>> {
  const { images, text: documentText } = buildParts(input)
  const hint = input.userHint.trim()
  const asUser = platform.withActor(input.actorId)

  const content: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [
    {
      type: 'text',
      text: [KIND_HINT[input.kind], hint ? `用户补充：${hint}` : '', documentText ? `文档内容：\n${documentText}` : '']
        .filter(Boolean)
        .join('\n'),
    },
  ]
  for (const image of images) {
    content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } })
  }

  let result
  try {
    result = await asUser.ai.chat({
      purpose: 'vision-ocr',
      temperature: 0.1,
      maxTokens: 4000,
      metadata: { product: 'rishi', kind: input.kind },
      messages: [
        { role: 'system', content: TIMETABLE_PROMPT },
        { role: 'user', content },
      ],
    })
  } catch (error) {
    throw translatePlatformError(error)
  }

  const payload = normalizeOcrPayload(extractJson(result.content), input.kind)
  const found =
    (payload.courses as unknown[]).length +
    (payload.exams as unknown[]).length +
    (payload.selfSchedules as unknown[]).length
  if (found === 0) {
    throw new OcrError('no_result', '没有从这份文件里认出课程或考试。请换一张更清晰的原件，或改用表格导入。', 422)
  }
  return { ...payload, model: result.model }
}

/** Platform 的错误原样抛给用户没有意义，翻成用户能照做的话。 */
function translatePlatformError(error: unknown): OcrError {
  const raw = error instanceof Error ? error.message : String(error)
  if (/未配置任何 AI Provider|没有可用的模型路由|候选模型都不可用/.test(raw)) {
    return new OcrError('ai_unconfigured', '站点还没有配置 AI 识别服务。请站长在主站后台「系统设置 → AI 接口」里完成配置。', 503)
  }
  if (/视觉|vision/i.test(raw)) {
    return new OcrError('no_vision_model', '当前 AI 路由用的是纯文本模型，认不了图片。请站长在后台把 vision-ocr 换成带视觉能力的模型。', 503)
  }
  if (/UNAUTHORIZED|FORBIDDEN|401|403/.test(raw)) {
    return new OcrError('service_token_invalid', '日事与公共平台之间的服务凭证无效，请站长检查 PLATFORM_SERVICE_TOKEN。', 503)
  }
  if (/超时|timeout|TIMEOUT/i.test(raw)) {
    return new OcrError('upstream_timeout', '识别服务响应超时。稍等一下再试，或换一张更小的图片。', 504)
  }
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(raw)) {
    return new OcrError('platform_unreachable', '连不上公共平台的 AI 服务，请稍后重试。', 503)
  }
  if (/RATE_LIMITED|过于频繁/.test(raw)) {
    return new OcrError('upstream_timeout', '识别请求过于频繁，请稍后再试。', 429)
  }
  return new OcrError('bad_model_output', '识别没有成功完成，请重试一次。', 502)
}
