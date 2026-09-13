import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { importTimetableFile } from './timetable-import'
import { collectDueReminders } from './reminders'
import { defaultReminderSettings } from '../types'

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
const finalExam = exams.exams.find((e) => e.name.includes('高等数学'))
if (!finalExam || finalExam.kind !== 'final' || finalExam.startTime !== '08:00') {
  throw new Error(`final exam parse failed ${JSON.stringify(finalExam)}`)
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

console.log(
  'timetable selftest ok',
  `${grid.courses.length} courses`,
  `${exams.exams.length} exams`,
  `math ${math.startTime}-${math.endTime} (${math.weekday})`,
)
