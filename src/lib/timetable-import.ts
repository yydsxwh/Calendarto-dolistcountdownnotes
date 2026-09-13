import * as XLSX from 'xlsx'
import {
  COURSE_COLORS,
  type Course,
  type Exam,
  type ExamKind,
} from '../types'
import { parseClock, parsePeriodHint, parseTimeRange, parseWeekday, WEEKDAY_LABELS } from './periods'
import { uid } from './store'

const UNSUPPORTED = new Set(['pdf', 'parquet'])

export type ImportKind = 'courses' | 'exams' | 'mixed'

export interface TimetableImportResult {
  courses: Course[]
  exams: Exam[]
  warnings: string[]
  sheets: string[]
  kind: ImportKind
}

const COURSE_NAME_KEYS = ['课程', '科目', '课名', '名称', 'course', 'subject', 'name']
const WEEKDAY_KEYS = ['星期', '周几', '星期几', 'weekday', 'day']
const START_KEYS = ['开始', '上课时间', 'start', 'from']
const END_KEYS = ['结束', '下课', 'end', 'to']
const TIME_KEYS = ['时间', '上课', '时段', 'time']
const PERIOD_KEYS = ['节次', '第几节', '节', 'period']
const LOC_KEYS = ['教室', '地点', '上课地点', 'location', 'room']
const TEACHER_KEYS = ['教师', '老师', '讲师', 'teacher']
const WEEK_KEYS = ['周次', '周', 'weeks']
const EXAM_NAME_KEYS = ['考试', '科目', '课程', '名称', 'exam']
const DATE_KEYS = ['日期', '考试日期', 'date']
const EXAM_TIME_KEYS = ['时间', '开考', '考试时间', 'time']
const KIND_KEYS = ['类型', '种类', '期中期末', 'kind']
const SEAT_KEYS = ['座位', '座号', 'seat']

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function cell(value: unknown): string {
  if (value == null) return ''
  return String(value).replace(/\r/g, '').trim()
}

function normalizeHeader(raw: string): string {
  return raw.replace(/\s+/g, '').toLowerCase()
}

function findCol(headers: string[], keys: string[]): number {
  const normalized = headers.map(normalizeHeader)
  for (const key of keys) {
    const k = normalizeHeader(key)
    const idx = normalized.findIndex((h) => h === k || h.includes(k))
    if (idx >= 0) return idx
  }
  return -1
}

function pickColor(index: number): string {
  return COURSE_COLORS[index % COURSE_COLORS.length]
}

function parseExamKind(raw: string): ExamKind {
  if (/补/.test(raw)) return 'makeup'
  if (/期末|final/i.test(raw)) return 'final'
  if (/期中|mid/i.test(raw)) return 'midterm'
  return 'other'
}

function parseDateCell(raw: string): string | null {
  const text = raw.trim()
  const iso = text.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
  if (iso) {
    const y = iso[1]
    const m = String(Number(iso[2])).padStart(2, '0')
    const d = String(Number(iso[3])).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const md = text.match(/^(\d{1,2})[-/.月](\d{1,2})/)
  if (md) {
    const now = new Date()
    const m = String(Number(md[1])).padStart(2, '0')
    const d = String(Number(md[2])).padStart(2, '0')
    return `${now.getFullYear()}-${m}-${d}`
  }
  return null
}

function parseCellCourse(
  raw: string,
  weekday: number,
  slot: { start: string; end: string },
  colorIndex: number,
  remindMinutes: number,
): Course | null {
  const lines = raw
    .split(/[\n/;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (lines.length === 0) return null
  if (lines.every((l) => /^(空|无|休息)$/.test(l))) return null

  let weeks: string | undefined
  let location: string | undefined
  let teacher: string | undefined
  const nameParts: string[] = []

  for (const line of lines) {
    if ((/单周|双周/.test(line) || (/周/.test(line) && /\d/.test(line))) && line.length <= 24) {
      weeks = weeks ? `${weeks} ${line}` : line
      continue
    }
    if (/教室|教学楼|号楼|实验|机房|[A-Za-z]?\d{2,4}/.test(line) && line.length <= 24) {
      location = line
      continue
    }
    if (/老师|教授|讲师|助教$/.test(line) || (line.length <= 6 && nameParts.length > 0)) {
      teacher = line
      continue
    }
    nameParts.push(line)
  }

  const name = nameParts.join(' ') || lines[0]
  if (!name) return null
  return {
    id: uid(),
    name,
    weekday,
    startTime: slot.start,
    endTime: slot.end,
    location,
    teacher,
    weeks,
    color: pickColor(colorIndex),
    remindMinutes,
    createdAt: Date.now(),
  }
}

function parseGrid(rows: string[][], remindMinutes: number, warnings: string[]): Course[] {
  let headerRow = -1
  let weekdayCols: { col: number; weekday: number }[] = []

  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    const found: { col: number; weekday: number }[] = []
    rows[r].forEach((value, col) => {
      const wd = parseWeekday(value)
      if (wd) found.push({ col, weekday: wd })
    })
    if (found.length >= 2) {
      headerRow = r
      weekdayCols = found
      break
    }
  }
  if (headerRow < 0) return []

  const courses: Course[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c) => !c.trim())) continue
    const hintCell = row[0] || ''
    const second = row[1] || ''
    const slot = parsePeriodHint(hintCell) ?? parsePeriodHint(`${hintCell} ${second}`)
    if (!slot) {
      if (row.some((c, i) => i > 0 && c.trim())) {
        warnings.push(`第 ${r + 1} 行无法识别节次/时间（${hintCell || '空'}），已跳过`)
      }
      continue
    }
    for (const { col, weekday } of weekdayCols) {
      const text = cell(row[col])
      if (!text) continue
      const course = parseCellCourse(text, weekday, slot, courses.length, remindMinutes)
      if (course) courses.push(course)
    }
  }
  return courses
}

function parseCourseList(rows: string[][], remindMinutes: number, warnings: string[]): Course[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(cell)
  if (/考试|期中|期末|exam/i.test(headers.join(' ')) && findCol(headers, DATE_KEYS) >= 0) {
    return []
  }
  const nameCol = findCol(headers, COURSE_NAME_KEYS)
  const dayCol = findCol(headers, WEEKDAY_KEYS)
  const startCol = findCol(headers, START_KEYS)
  const endCol = findCol(headers, END_KEYS)
  const timeCol = findCol(headers, TIME_KEYS)
  const periodCol = findCol(headers, PERIOD_KEYS)
  const locCol = findCol(headers, LOC_KEYS)
  const teacherCol = findCol(headers, TEACHER_KEYS)
  const weekCol = findCol(headers, WEEK_KEYS)
  if (nameCol < 0 || (dayCol < 0 && timeCol < 0 && periodCol < 0)) return []

  const courses: Course[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = cell(row[nameCol])
    if (!name) continue
    const weekday = dayCol >= 0 ? parseWeekday(cell(row[dayCol])) : null
    const period = periodCol >= 0 ? parsePeriodHint(cell(row[periodCol])) : null
    const startCell = startCol >= 0 ? parseClock(cell(row[startCol])) || parsePeriodHint(cell(row[startCol]))?.start : undefined
    const endCell = endCol >= 0 ? parseClock(cell(row[endCol])) || parsePeriodHint(cell(row[endCol]))?.end : undefined
    const fromTime = timeCol >= 0 ? parseTimeRange(cell(row[timeCol])) ?? parsePeriodHint(cell(row[timeCol])) : null
    const start = startCell || fromTime?.start || period?.start
    const end = endCell || fromTime?.end || period?.end
    if (!weekday || !start || !end) {
      warnings.push(`课表第 ${r + 1} 行缺少星期或时间：${name}`)
      continue
    }
    courses.push({
      id: uid(),
      name,
      weekday,
      startTime: start,
      endTime: end,
      location: locCol >= 0 ? cell(row[locCol]) || undefined : undefined,
      teacher: teacherCol >= 0 ? cell(row[teacherCol]) || undefined : undefined,
      weeks: weekCol >= 0 ? cell(row[weekCol]) || undefined : undefined,
      color: pickColor(courses.length),
      remindMinutes,
      createdAt: Date.now(),
    })
  }
  return courses
}

function parseExamList(rows: string[][], remindMinutes: number, warnings: string[]): Exam[] {
  if (rows.length < 2) return []
  const headers = rows[0].map(cell)
  const joined = headers.join(' ')
  const examLike = /考试|期中|期末|exam/i.test(joined)
  const nameCol = findCol(headers, EXAM_NAME_KEYS)
  const dateCol = findCol(headers, DATE_KEYS)
  const timeCol = findCol(headers, EXAM_TIME_KEYS)
  const locCol = findCol(headers, LOC_KEYS)
  const kindCol = findCol(headers, KIND_KEYS)
  const seatCol = findCol(headers, SEAT_KEYS)
  if (nameCol < 0 || dateCol < 0) return []
  if (!examLike && !/考试日期|开考/.test(joined)) return []

  const exams: Exam[] = []
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    const name = cell(row[nameCol])
    const date = dateCol >= 0 ? parseDateCell(cell(row[dateCol])) : null
    if (!name || !date) {
      if (name) warnings.push(`考试第 ${r + 1} 行日期无法识别：${name}`)
      continue
    }
    const timeRaw = timeCol >= 0 ? cell(row[timeCol]) : ''
    const range = parseTimeRange(timeRaw)
    const start = range?.start || parsePeriodHint(timeRaw)?.start || '09:00'
    const end = range?.end || parsePeriodHint(timeRaw)?.end
    exams.push({
      id: uid(),
      name,
      kind: kindCol >= 0 ? parseExamKind(cell(row[kindCol]) || name) : parseExamKind(name),
      date,
      startTime: start,
      endTime: end,
      location: locCol >= 0 ? cell(row[locCol]) || undefined : undefined,
      seat: seatCol >= 0 ? cell(row[seatCol]) || undefined : undefined,
      remindMinutes,
      createdAt: Date.now(),
    })
  }
  return exams
}

function sheetToRows(sheet: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  })
  return rows.map((row) => (Array.isArray(row) ? row.map(cell) : []))
}

export async function importTimetableFile(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
): Promise<TimetableImportResult> {
  const ext = extOf(file.name)
  if (UNSUPPORTED.has(ext)) {
    throw new Error(
      ext === 'pdf'
        ? 'PDF 课表请先另存为 .xlsx 或 .csv 再导入，这样才能准确识别每节课时间和时长。'
        : 'Parquet 不适合课表，请导出为 .xlsx 或 .csv。',
    )
  }

  const buffer = await file.arrayBuffer()
  let workbook: XLSX.WorkBook
  try {
    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const text = new TextDecoder('utf-8').decode(buffer)
      workbook = XLSX.read(text, { type: 'string', raw: false, FS: ext === 'tsv' ? '\t' : ',' })
    } else {
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    }
  } catch {
    throw new Error(`无法读取 ${file.name}。请改用 .xlsx / .xls / .csv / .tsv / .ods。`)
  }

  const warnings: string[] = []
  const courses: Course[] = []
  const exams: Exam[] = []

  for (const name of workbook.SheetNames) {
    const rows = sheetToRows(workbook.Sheets[name])
    if (rows.length === 0) continue
    const examRows = parseExamList(rows, defaults.examRemindMinutes, warnings)
    const listRows = parseCourseList(rows, defaults.classRemindMinutes, warnings)
    const gridRows = parseGrid(rows, defaults.classRemindMinutes, warnings)
    exams.push(...examRows)
    if (listRows.length >= gridRows.length) courses.push(...listRows)
    else courses.push(...gridRows)
    if (examRows.length + listRows.length + gridRows.length === 0) {
      warnings.push(`工作表「${name}」没有识别到课程或考试行`)
    }
  }

  if (courses.length === 0 && exams.length === 0) {
    throw new Error(
      '没有识别到课程或考试。可用周课表（第一行列周一到周日，左侧写第几节或 08:00-08:45），或列表（课程/星期/节次或时间）。',
    )
  }

  const kind: ImportKind =
    courses.length && exams.length ? 'mixed' : exams.length ? 'exams' : 'courses'
  return { courses, exams, warnings, sheets: workbook.SheetNames, kind }
}

export function sampleGridCsv(): string {
  const header = ['节次/时间', ...WEEKDAY_LABELS]
  const row1 = [
    '第1-2节 08:00-09:40',
    '高等数学\n1-16周\n教学楼A101\n王老师',
    '',
    '大学英语\n1-16周\n外语楼203',
    '',
    '程序设计\n1-16周\n机房B2',
    '',
    '',
  ]
  const row2 = [
    '第3-4节 10:00-11:40',
    '',
    '线性代数\n1-16周\n理科楼305',
    '',
    '大学物理\n1-16周\n实验楼1-02',
    '',
    '',
    '',
  ]
  return [header, row1, row2]
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

export function sampleExamCsv(): string {
  return [
    '考试科目,类型,考试日期,考试时间,地点,座位',
    '高等数学,期末,2026-10-20,08:00-10:00,教一楼201,12',
    '大学英语,期中,2026-10-08,14:00-16:00,外语楼101,8',
  ].join('\n')
}
