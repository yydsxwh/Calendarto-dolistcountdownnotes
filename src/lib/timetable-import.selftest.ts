import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { importTimetableFile } from './timetable-import'
import { hydrateTimetableOcr } from './timetable-ocr'
import { collectDueReminders } from './reminders'
import { defaultReminderSettings } from '../types'
import { normalizeClockInput } from './periods'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

function asFile(name: string, path: string, type: string): File {
  const buf = readFileSync(path)
  return new File([buf], name, { type })
}

const defaults = { classRemindMinutes: 15, examRemindMinutes: 1440 }

const grid = await importTimetableFile(
  asFile('course-grid.csv', join(root, 'public/samples/course-grid.csv'), 'text/csv'),
  defaults,
)
if (grid.courses.length < 4) {
  throw new Error(`grid expected >=4 courses, got ${grid.courses.length}`)
}
const math = grid.courses.find((c) => c.name.includes('高等数学'))
if (!math || math.startTime !== '08:00' || math.endTime !== '09:40' || math.weekday !== 1) {
  throw new Error(`math course parse failed ${JSON.stringify(math)}`)
}
if (math.endTime <= math.startTime) throw new Error('duration not recognized')

const exams = await importTimetableFile(
  asFile('exams.csv', join(root, 'public/samples/exams.csv'), 'text/csv'),
  defaults,
)
if (exams.exams.length !== 2) throw new Error(`exams expected 2 got ${exams.exams.length}`)
if (exams.courses.length !== 0) throw new Error(`exam sheet should not also parse as courses`)
if (exams.warnings.some((w) => w.includes('缺少星期'))) {
  throw new Error(`exam sheet should not warn as course list: ${exams.warnings.join('; ')}`)
}
const finalExam = exams.exams.find((e) => e.name.includes('高等数学'))
if (!finalExam || finalExam.kind !== 'final' || finalExam.startTime !== '08:00') {
  throw new Error(`final exam parse failed ${JSON.stringify(finalExam)}`)
}

if (normalizeClockInput('8:00') !== '08:00' || normalizeClockInput('1400') !== '14:00') {
  throw new Error('24h clock normalize failed')
}

const settings = defaultReminderSettings()
const fireAt = Date.now()
const due = collectDueReminders(
  [],
  [
    {
      ...finalExam,
      date: '2099-01-01',
      startTime: '10:00',
      remindMinutes: 0,
    },
  ],
  { ...settings, examAlsoHourBefore: true },
  fireAt,
)
if (due.length !== 0) throw new Error('should not fire far-future exam')

const examFireNow = Date.parse('2099-01-01T08:45:00')
const examDue = collectDueReminders(
  [],
  [
    {
      ...finalExam,
      date: '2099-01-01',
      startTime: '10:00',
      remindMinutes: 75,
    },
  ],
  { ...settings, enabled: true, examAlsoHourBefore: false },
  examFireNow,
)
if (examDue.length !== 1 || examDue[0].kind !== 'exam') {
  throw new Error(`exam reminder window failed ${JSON.stringify(examDue)}`)
}

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['节次/时间', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    ['第1-2节 08:00-09:40', '高等数学\n1-16周\nA101', '', '大学英语', '', '', '', ''],
  ]),
  '课表',
)
const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
const xlsx = await importTimetableFile(
  new File([xlsxBuf], 'course-grid.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }),
  defaults,
)
if (xlsx.courses.length < 2) {
  throw new Error(`xlsx expected >=2 courses, got ${xlsx.courses.length}`)
}

const ocr = hydrateTimetableOcr(
  {
    courses: [
      {
        name: '高等数学',
        weekday: 1,
        startTime: '08:00',
        endTime: '09:40',
        location: '教学楼A101',
        teacher: '王老师',
      },
      { name: '空课', weekday: 9, startTime: '10:00', endTime: '09:00' },
    ],
    exams: [{ name: '大学英语', kind: '期中', date: '2026-09-18', startTime: '14:00', endTime: '16:00' }],
    warnings: [],
  },
  defaults,
)
const ocrMath = ocr.courses.find((c) => c.name === '高等数学')
if (!ocrMath || ocrMath.teacher !== '王老师' || ocrMath.location !== '教学楼A101') {
  throw new Error(`ocr hydrate course failed ${JSON.stringify(ocrMath)}`)
}
if (ocr.courses.some((c) => c.name === '空课')) throw new Error('invalid weekday/time should be dropped')
if (ocr.exams[0]?.kind !== 'midterm' || ocr.exams[0].startTime !== '14:00') {
  throw new Error(`ocr hydrate exam failed ${JSON.stringify(ocr.exams[0])}`)
}

console.log(
  'timetable selftest ok',
  `${grid.courses.length} courses`,
  `${exams.exams.length} exams`,
  `math ${math.startTime}-${math.endTime} (${math.weekday})`,
  `xlsx ${xlsx.courses.length}`,
  `ocr ${ocr.courses.length}/${ocr.exams.length}`,
)
