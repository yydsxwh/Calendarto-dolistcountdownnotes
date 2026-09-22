import * as XLSX from 'xlsx'

const WEEKDAYS: Record<string, number> = {
  周一: 1,
  星期一: 1,
  周二: 2,
  星期二: 2,
  周三: 3,
  星期三: 3,
  周四: 4,
  星期四: 4,
  周五: 5,
  星期五: 5,
  周六: 6,
  星期六: 6,
  周日: 7,
  星期日: 7,
  周天: 7,
}

export type SheetCourse = {
  name: string
  weekday?: number
  weekdayLabel?: string
  startTime?: string
  endTime?: string
  location?: string
  teacher?: string
}

export type SheetExam = {
  name: string
  date?: string
  startTime?: string
  endTime?: string
  location?: string
}

export type SheetParse = {
  courses: SheetCourse[]
  exams: SheetExam[]
  warnings: string[]
}

export function isSpreadsheetName(fileName: string, mimeType: string): boolean {
  return /\.(csv|tsv|xls|xlsx)$/i.test(fileName) || /spreadsheet|excel|csv/i.test(mimeType)
}

/** 表格能确定读出课程或考试时，不再把二进制送给视觉模型。 */
export function parseSpreadsheet(bytes: Buffer, fileName: string): SheetParse | null {
  let workbook: XLSX.WorkBook
  try {
    if (/\.(csv|tsv|txt)$/i.test(fileName)) {
      workbook = XLSX.read(bytes.toString('utf8'), {
        type: 'string',
        raw: true,
        cellDates: false,
        FS: /\.tsv$/i.test(fileName) ? '\t' : ',',
      })
    } else {
      workbook = XLSX.read(bytes, { type: 'buffer', cellDates: true })
    }
  } catch {
    return null
  }
  const courses: SheetCourse[] = []
  const exams: SheetExam[] = []
  const warnings: string[] = []
  for (const name of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[name], {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    }).map((row) => (Array.isArray(row) ? row.map((cell) => cellText(cell)) : []))
    if (rows.length < 2) continue
    const header = rows[0].map((cell) => cell.replace(/\s/g, ''))
    if (header.some((cell) => cell in WEEKDAYS || /周[一二三四五六日天]/.test(cell))) {
      courses.push(...parseGrid(rows))
      continue
    }
    const dateCol = header.findIndex((cell) => /日期|date/i.test(cell))
    const nameCol = header.findIndex((cell) => /课程|科目|考试|名称|name|subject/i.test(cell))
    const weekdayCol = header.findIndex((cell) => /星期|周几|weekday/i.test(cell))
    const startCol = header.findIndex((cell) => /开始|start/i.test(cell))
    const endCol = header.findIndex((cell) => /结束|end/i.test(cell))
    const timeCol = header.findIndex((cell) => /时间|time/i.test(cell))
    const locCol = header.findIndex((cell) => /教室|地点|location|room/i.test(cell))
    if (nameCol < 0) {
      warnings.push(`工作表「${name}」没有课程列`)
      continue
    }
    for (const row of rows.slice(1)) {
      const title = row[nameCol]
      if (!title) continue
      const range = timeCol >= 0 ? splitRange(row[timeCol]) : null
      const startTime = (startCol >= 0 ? normalize(row[startCol]) : undefined) || range?.[0]
      const endTime = (endCol >= 0 ? normalize(row[endCol]) : undefined) || range?.[1]
      if (dateCol >= 0 && row[dateCol]) {
        exams.push({ name: title, date: row[dateCol], startTime, endTime, location: locCol >= 0 ? row[locCol] : undefined })
      } else {
        const weekday = weekdayCol >= 0 ? WEEKDAYS[row[weekdayCol].replace(/\s/g, '')] : undefined
        courses.push({
          name: title,
          weekday,
          weekdayLabel: weekdayCol >= 0 ? row[weekdayCol] : undefined,
          startTime,
          endTime,
          location: locCol >= 0 ? row[locCol] : undefined,
        })
      }
    }
  }
  if (courses.length === 0 && exams.length === 0) return null
  return { courses, exams, warnings }
}

export function spreadsheetAsText(bytes: Buffer, fileName: string): string {
  try {
    const workbook = /\.(csv|tsv|txt)$/i.test(fileName)
      ? XLSX.read(bytes.toString('utf8'), { type: 'string' })
      : XLSX.read(bytes, { type: 'buffer' })
    return workbook.SheetNames.map((name) => XLSX.utils.sheet_to_csv(workbook.Sheets[name])).join('\n').slice(0, 20_000)
  } catch {
    return ''
  }
}

function parseGrid(rows: string[][]): SheetCourse[] {
  const header = rows[0]
  const columns = header.map((cell, index) => ({ index, weekday: WEEKDAYS[cell.replace(/\s/g, '')] })).filter((col) => col.weekday)
  const courses: SheetCourse[] = []
  for (const row of rows.slice(1)) {
    const range = splitRange(row[0] || '')
    for (const column of columns) {
      const name = (row[column.index] || '').replace(/\s+/g, ' ').trim()
      if (!name || name === '—' || name === '-') continue
      courses.push({
        name: name.split(/[\s/]/)[0] || name,
        weekday: column.weekday,
        weekdayLabel: header[column.index],
        startTime: range?.[0],
        endTime: range?.[1],
        location: name.includes(' ') ? name.split(/\s+/).slice(1).join(' ') : undefined,
      })
    }
  }
  return courses
}

function splitRange(value: string): [string, string] | null {
  const match = /(\d{1,2}:\d{2})\s*[-~到至]\s*(\d{1,2}:\d{2})/.exec(value)
  if (!match) return null
  return [normalize(match[1]) || match[1], normalize(match[2]) || match[2]]
}

function cellText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value ?? '').trim()
}

function normalize(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return undefined
  return `${match[1].padStart(2, '0')}:${match[2]}`
}
