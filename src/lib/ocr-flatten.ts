import {
  normalizeClockInput,
  parsePeriodHint,
  parseTimeRange,
  parseWeekday,
} from './periods'

const WEEKDAY_FULL = ['', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

const RESERVED_KEYS = new Set([
  'courses',
  'exams',
  'warnings',
  'model',
  'error',
  'dayHeaders',
  'headers',
  'columns',
  'slots',
  'rows',
  'grid',
  'schedule',
  'timetable',
  'kind',
  'sheets',
])

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function text(value: unknown): string {
  return value == null ? '' : String(value).trim()
}

export function warningList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : text(asRecord(item).message)))
    .filter(Boolean)
}

export function parseWeekdayLoose(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw >= 1 && raw <= 7) return raw
    return null
  }
  const value = text(raw)
  if (!value) return null
  const named = parseWeekday(value)
  if (named) return named
  const n = Number(value)
  return n >= 1 && n <= 7 ? n : null
}

/** Prefer 星期一 / weekdayLabel over a column-index weekday number. */
export function resolveOcrWeekday(item: Record<string, unknown>): number | null {
  const labelKeys = ['weekdayLabel', 'dayLabel', '星期', '星期几', '周几', 'weekDay', 'dayName']
  for (const key of labelKeys) {
    const raw = item[key]
    if (raw == null || text(raw) === '') continue
    if (typeof raw === 'number' || /^\d+$/.test(text(raw))) continue
    const parsed = parseWeekdayLoose(raw)
    if (parsed) return parsed
  }
  const day = item.day
  if (day != null && typeof day !== 'number' && !/^\d+$/.test(text(day))) {
    const parsed = parseWeekdayLoose(day)
    if (parsed) return parsed
  }
  return parseWeekdayLoose(item.weekday)
}

export function splitPackedLocation(raw: string): { location?: string; weeks?: string } {
  const cleaned = raw.replace(/\s+/g, '')
  const packed = cleaned.match(/^(.+?)\/(\d{1,2}[-~到至]\d{1,2}节)\/(.+)$/)
  if (packed) {
    return { location: packed[1], weeks: packed[3].replace(/\//g, ' ') }
  }
  return {}
}

function isSkipLine(line: string): boolean {
  return /^(空|无|休息)$/.test(line) || /学时|学分/.test(line) || /^\d{1,2}[-~到至]\d{1,2}节$/.test(line)
}

function isWeeksLine(line: string): boolean {
  if (/单周|双周/.test(line) && line.length <= 24) return true
  return /周/.test(line) && /\d/.test(line) && line.length <= 24
}

function isTeacherLine(line: string): boolean {
  if (/教授|讲师|副教授|助教/.test(line) && line.length <= 40) return true
  if (/^[A-Z][A-Z .'-]{2,}$/.test(line)) return true
  return false
}

function cleanTeacher(line: string): string {
  return line.replace(/\s*(教授|副教授|讲师|助教)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

export function parseOcrCellText(raw: string): {
  name: string
  teacher?: string
  location?: string
  weeks?: string
} | null {
  const lines = raw
    .split(/[\n/;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length === 0 || lines.every(isSkipLine)) return null

  let weeks: string | undefined
  let location: string | undefined
  const teacherParts: string[] = []
  const nameParts: string[] = []

  for (const line of lines) {
    if (isSkipLine(line)) continue
    if (isWeeksLine(line)) {
      weeks = weeks ? `${weeks} ${line}` : line
      continue
    }
    const packed = splitPackedLocation(line)
    if (packed.location) {
      location = packed.location
      if (packed.weeks) weeks = weeks ? `${weeks} ${packed.weeks}` : packed.weeks
      continue
    }
    if (
      (/教室|教学楼|号楼|实验|机房|世纪馆|教[一二三四五六七八]/.test(line) ||
        /[A-Za-z]?\d{3,4}/.test(line)) &&
      line.length <= 28
    ) {
      location = line
      continue
    }
    if (isTeacherLine(line)) {
      const t = cleanTeacher(line)
      if (t) teacherParts.push(t)
      continue
    }
    nameParts.push(line)
  }

  let name = nameParts.join(' ').trim()
  let teacher = teacherParts.join(' ') || undefined
  if (name) {
    const many = name.match(
      /^(.+?)\s+((?:[\u4e00-\u9fffA-Za-z·]{2,8}\s*(?:教授|副教授|讲师|助教)\s*[,，]?\s*){2,})(.*)$/,
    )
    if (many) {
      name = many[1].trim()
      teacher = cleanTeacher(many[2]).replace(/[,，]\s*$/g, '')
      const rest = many[3].trim()
      if (rest) {
        const packedRest = splitPackedLocation(rest)
        if (packedRest.location) {
          location = location || packedRest.location
          weeks = weeks || packedRest.weeks
        }
      }
    }
  }
  if (!teacher && name) {
    const en = name.match(/^([\u4e00-\u9fffA-Za-z0-9ⅡIVX（）()\-·]+?)\s+([A-Z][A-Z .'-]{3,})$/)
    if (en) {
      name = en[1].trim()
      teacher = en[2].replace(/\s+/g, ' ').trim()
    } else {
      const cn = name.match(/^(.+?)\s+([\u4e00-\u9fff]{2,4})$/)
      if (cn && !/方法|教育|原理|概论|研究|分析|文化|智慧|思辨|健康|场景|案例|积分/.test(cn[2])) {
        name = cn[1].trim()
        teacher = cn[2]
      }
    }
  }
  if (!name) name = lines.find((l) => !isSkipLine(l)) || ''
  if (!name) return null
  return { name, teacher, location, weeks }
}

export function splitPackedCourse(item: Record<string, unknown>): {
  name: string
  teacher?: string
  location?: string
  weeks?: string
} {
  const fromCell = parseOcrCellText(
    [text(item.name), text(item.teacher), text(item.location), text(item.weeks)]
      .filter(Boolean)
      .join('\n'),
  )
  let name = text(item.name) || fromCell?.name || ''
  let teacher = text(item.teacher) || fromCell?.teacher
  let location = text(item.location)
  let weeks = text(item.weeks)

  const packed = location ? splitPackedLocation(location) : {}
  if (packed.location) {
    location = packed.location
    if (!weeks && packed.weeks) weeks = packed.weeks
    else if (weeks && packed.weeks && !weeks.includes(packed.weeks)) {
      weeks = `${weeks} ${packed.weeks}`
    }
  }
  if (!weeks && fromCell?.weeks) weeks = fromCell.weeks
  if (!location && fromCell?.location) location = fromCell.location
  if (!teacher && fromCell?.teacher) teacher = fromCell.teacher

  if (fromCell?.name && fromCell.name.length < name.length && name.includes(fromCell.name)) {
    name = fromCell.name
    teacher = teacher || fromCell.teacher
  }

  if (!teacher && name) {
    const en = name.match(/^([\u4e00-\u9fffA-Za-z0-9ⅡIVX（）()\-·]+?)\s+([A-Z][A-Z .'-]{3,})$/)
    if (en) {
      name = en[1].trim()
      teacher = en[2].replace(/\s+/g, ' ').trim()
    }
  }

  return {
    name,
    teacher: teacher || undefined,
    location: location || undefined,
    weeks: weeks || undefined,
  }
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => text(item))
}

function resolveRowSlot(item: Record<string, unknown>): { start: string; end: string } | null {
  const startRaw = text(item.startTime) || text(item.start)
  const endRaw = text(item.endTime) || text(item.end)
  const label = [text(item.label), text(item.period), text(item.time), text(item.slot), startRaw, endRaw]
    .filter(Boolean)
    .join(' ')
  return (
    parseTimeRange(`${startRaw}-${endRaw}`) ||
    parseTimeRange(label) ||
    parsePeriodHint(label) ||
    (normalizeClockInput(startRaw) && normalizeClockInput(endRaw)
      ? { start: normalizeClockInput(startRaw)!, end: normalizeClockInput(endRaw)! }
      : null)
  )
}

function alignWeekdayCells(
  headers: string[],
  cells: unknown[],
): { weekday: number; cell: unknown }[] {
  const mapped: { weekday: number; cell: unknown }[] = []
  if (headers.length) {
    headers.forEach((header, index) => {
      const weekday = parseWeekdayLoose(header)
      if (weekday && index < cells.length) mapped.push({ weekday, cell: cells[index] })
    })
    if (mapped.length >= 2) return mapped
  }
  const start = cells.length >= 8 ? 1 : 0
  const count = Math.min(7, cells.length - start)
  const aligned: { weekday: number; cell: unknown }[] = []
  for (let i = 0; i < count; i++) {
    aligned.push({ weekday: i + 1, cell: cells[start + i] })
  }
  return aligned
}

function cellToDraft(
  cell: unknown,
  weekday: number,
  slot: { start: string; end: string },
): Record<string, unknown> | null {
  if (cell == null) return null
  if (typeof cell === 'string') {
    if (!cell.trim() || /^(空|无|休息)$/.test(cell.trim())) return null
    const parsed = parseOcrCellText(cell)
    if (!parsed) return null
    return {
      name: parsed.name,
      teacher: parsed.teacher,
      location: parsed.location,
      weeks: parsed.weeks,
      weekday,
      weekdayLabel: WEEKDAY_FULL[weekday],
      startTime: slot.start,
      endTime: slot.end,
    }
  }
  if (typeof cell !== 'object' || Array.isArray(cell)) return null
  const rec = cell as Record<string, unknown>
  const rawName =
    text(rec.name) ||
    text(rec.course) ||
    text(rec.title) ||
    text(rec.text) ||
    text(rec.content) ||
    text(rec.value)
  const parsed = parseOcrCellText(
    [rawName, text(rec.teacher), text(rec.location), text(rec.weeks)].filter(Boolean).join('\n') ||
      rawName,
  )
  const name = parsed?.name || rawName
  if (!name) return null
  return {
    name,
    teacher: text(rec.teacher) || parsed?.teacher,
    location: text(rec.location) || parsed?.location,
    weeks: text(rec.weeks) || parsed?.weeks,
    weekday,
    weekdayLabel: WEEKDAY_FULL[weekday],
    startTime: slot.start,
    endTime: slot.end,
  }
}

function flattenGrid(data: Record<string, unknown>): Record<string, unknown>[] {
  const grid = asRecord(data.grid)
  const headers = asStringList(
    data.dayHeaders || data.headers || data.columns || grid.dayHeaders || grid.headers || grid.columns,
  )
  const slotSource = data.slots || data.rows || grid.slots || grid.rows
  const courses: Record<string, unknown>[] = []

  if (Array.isArray(slotSource) && slotSource.length > 0 && Array.isArray(slotSource[0])) {
    const rows = slotSource as unknown[][]
    let headerRow = headers
    let body = rows
    if (!headerRow.length && rows[0]) {
      const first = rows[0].map((c) => text(c))
      if (first.filter((h) => parseWeekdayLoose(h)).length >= 2) {
        headerRow = first
        body = rows.slice(1)
      }
    }
    for (const row of body) {
      const cells = Array.isArray(row) ? row : []
      const hint = `${text(cells[0])} ${text(cells[1])}`
      const slot = parseTimeRange(hint) || parsePeriodHint(hint)
      if (!slot) continue
      const dayCells = headerRow.length ? cells : cells.slice(1)
      const aligned = alignWeekdayCells(
        headerRow.length ? headerRow : [],
        headerRow.length ? cells : dayCells,
      )
      for (const { weekday, cell } of aligned) {
        const draft = cellToDraft(cell, weekday, slot)
        if (draft) courses.push(draft)
      }
    }
    return courses
  }

  const slots = Array.isArray(slotSource)
    ? slotSource.filter((item) => item && typeof item === 'object' && !Array.isArray(item))
    : []
  for (const slotRaw of slots) {
    const rec = slotRaw as Record<string, unknown>
    const slot = resolveRowSlot(rec)
    if (!slot) continue
    const cells = rec.cells || rec.days || rec.courses
    if (!Array.isArray(cells)) continue
    for (const { weekday, cell } of alignWeekdayCells(headers, cells)) {
      const draft = cellToDraft(cell, weekday, slot)
      if (draft) courses.push(draft)
    }
  }
  return courses
}

function collectKeyedCourses(obj: Record<string, unknown>): Record<string, unknown>[] {
  const courses: Record<string, unknown>[] = []
  for (const [key, value] of Object.entries(obj)) {
    if (RESERVED_KEYS.has(key)) continue
    const weekday = parseWeekdayLoose(key)
    if (!weekday) continue
    const items = Array.isArray(value) ? value : [value]
    for (const item of items) {
      if (item == null || item === '') continue
      if (typeof item === 'string') {
        const parsed = parseOcrCellText(item)
        if (!parsed) continue
        courses.push({ ...parsed, weekday, weekdayLabel: WEEKDAY_FULL[weekday] })
        continue
      }
      if (typeof item === 'object' && !Array.isArray(item)) {
        courses.push({
          ...(item as Record<string, unknown>),
          weekday,
          weekdayLabel: WEEKDAY_FULL[weekday],
        })
      }
    }
  }
  return courses
}

function asCourseList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          const parsed = parseOcrCellText(item)
          return parsed ? (parsed as unknown as Record<string, unknown>) : null
        }
        if (item && typeof item === 'object' && !Array.isArray(item)) return item as Record<string, unknown>
        return null
      })
      .filter((item): item is Record<string, unknown> => item != null)
  }
  if (value && typeof value === 'object') return collectKeyedCourses(value as Record<string, unknown>)
  return []
}

export function flattenTimetableOcrPayload(raw: unknown): {
  courses: Record<string, unknown>[]
  exams: unknown
  warnings: string[]
  model?: string
  error?: string
} {
  const data = asRecord(raw)
  const warnings = warningList(data.warnings)
  const gridCourses = flattenGrid(data)
  const nested = flattenGrid(asRecord(data.schedule))
  const nestedTable = flattenGrid(asRecord(data.timetable))
  const fromGrid = gridCourses.length ? gridCourses : nested.length ? nested : nestedTable
  const fromList = asCourseList(data.courses)
  const fromKeys = [
    ...collectKeyedCourses(data),
    ...collectKeyedCourses(asRecord(data.schedule)),
    ...collectKeyedCourses(asRecord(data.timetable)),
  ]
  const courses = fromGrid.length > 0 ? fromGrid : fromList.length > 0 ? fromList : fromKeys
  return {
    courses,
    exams: data.exams,
    warnings,
    model: text(data.model) || undefined,
    error: text(data.error) || undefined,
  }
}
