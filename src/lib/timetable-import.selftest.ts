import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { importTimetableFile, sortExams } from './timetable-import'
import { hiddenHoursAroundCourses, inferClassPeriods } from './period-infer'
import {
  flattenTimetableOcrPayload,
  parseOcrCellText,
  resolveOcrWeekday,
  splitPackedLocation,
} from './ocr-flatten'
import { hydrateTimetableOcr, remapZeroBasedWeekdays } from './timetable-ocr'
import { collectDueReminders, upcomingReminderSlots } from './reminders'
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
const plainExamCsv = ['科目,日期,开始,结束,考场', '线性代数,2026-11-02,09:00,11:00,教三201'].join('\n')
const plainExams = await importTimetableFile(
  new File([plainExamCsv], 'plain-exams.csv', { type: 'text/csv' }),
  defaults,
)
if (plainExams.exams.length !== 1 || plainExams.exams[0].name !== '线性代数' || plainExams.exams[0].date !== '2026-11-02') {
  throw new Error(`plain exam table failed ${JSON.stringify(plainExams.exams)}`)
}
if (plainExams.courses.length !== 0) throw new Error('plain exam table should not parse as courses')
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

const ocrPeriod = hydrateTimetableOcr(
  {
    courses: [
      { name: '线性代数', weekday: '周一', startTime: '第1-2节', location: 'B201' },
      { name: '大学物理', weekday: '三', startTime: '5-6节', teacher: '李老师' },
    ],
    exams: [],
    warnings: [],
  },
  defaults,
)
const linear = ocrPeriod.courses.find((c) => c.name === '线性代数')
const physics = ocrPeriod.courses.find((c) => c.name === '大学物理')
if (!linear || linear.weekday !== 1 || linear.startTime !== '08:00' || linear.endTime !== '09:40') {
  throw new Error(`period-in-startTime hydrate failed ${JSON.stringify(linear)}`)
}
if (!physics || physics.weekday !== 3 || physics.startTime !== '14:00' || physics.endTime !== '15:40') {
  throw new Error(`weekday 三 / 5-6节 hydrate failed ${JSON.stringify(physics)}`)
}

const remapped = remapZeroBasedWeekdays([
  { name: 'A', weekday: 0, startTime: '08:30', endTime: '10:00' },
  { name: 'B', weekday: 2, startTime: '08:30', endTime: '10:00' },
])
if (remapped[0].weekday !== 1 || remapped[1].weekday !== 3) {
  throw new Error(`0-based weekday remap failed ${JSON.stringify(remapped)}`)
}
const zeroHydrate = hydrateTimetableOcr(
  {
    courses: [
      { name: '早课', weekday: 0, startTime: '08:30', endTime: '10:05' },
      { name: '午课', weekday: 1, startTime: '10:25', endTime: '12:00' },
    ],
    exams: [],
  },
  defaults,
)
if (zeroHydrate.courses[0]?.weekday !== 1 || zeroHydrate.courses[1]?.weekday !== 2) {
  throw new Error(`0-based hydrate weekday failed ${JSON.stringify(zeroHydrate.courses)}`)
}
const inferred = inferClassPeriods(zeroHydrate.courses)
if (inferred[0]?.start !== '08:30') {
  throw new Error(`infer periods should follow 08:30, got ${JSON.stringify(inferred)}`)
}
const hidden = hiddenHoursAroundCourses(zeroHydrate.courses)
if (hidden.includes(9) || !hidden.includes(0) || !hidden.includes(23)) {
  throw new Error(`hidden hours around classes failed ${JSON.stringify(hidden)}`)
}

const nativeSlots = upcomingReminderSlots(
  [
    {
      id: 'c1',
      name: '高等数学',
      weekday: 1,
      startTime: '08:00',
      endTime: '09:40',
      remindMinutes: 15,
      color: '#2563eb',
      createdAt: 1,
    },
  ],
  [
    {
      ...finalExam,
      date: '2099-06-01',
      startTime: '10:00',
      remindMinutes: 1440,
    },
  ],
  { ...settings, enabled: true, examAlsoHourBefore: true },
  Date.parse('2099-01-01T00:00:00'),
)
if (!nativeSlots.some((s) => s.kind === 'exam' && s.title.includes('高等数学'))) {
  throw new Error(`android reminder slots missing exam ${JSON.stringify(nativeSlots)}`)
}

const labelWins = resolveOcrWeekday({ weekday: 2, weekdayLabel: '星期一' })
if (labelWins !== 1) throw new Error(`weekdayLabel should beat column index, got ${labelWins}`)
const packed = splitPackedLocation('教一1506/1-2节/1-16周/单周')
if (packed.location !== '教一1506' || packed.weeks !== '1-16周 单周') {
  throw new Error(`packed location split failed ${JSON.stringify(packed)}`)
}

const shifted = hydrateTimetableOcr(
  {
    courses: [
      {
        name: '微积分C II',
        weekday: 2,
        weekdayLabel: '星期一',
        startTime: '08:00',
        endTime: '09:30',
        location: '教一1506/1-2节/1-16周',
        teacher: '贾鲁军 讲师',
      },
      {
        name: '英语国家社会与文化 LAUGGALIS ALEXANDER VICTOR',
        weekday: 3,
        weekdayLabel: '星期二',
        startTime: '10:00',
        endTime: '11:30',
        location: '教二2311/3-4节/1-16周/单周',
      },
    ],
  },
  defaults,
)
const calc = shifted.courses.find((c) => c.name.includes('微积分'))
const english = shifted.courses.find((c) => c.name.includes('英语'))
if (!calc || calc.weekday !== 1 || calc.location !== '教一1506' || calc.weeks !== '1-16周') {
  throw new Error(`label+packed hydrate failed ${JSON.stringify(calc)}`)
}
if (
  !english ||
  english.weekday !== 2 ||
  english.teacher !== 'LAUGGALIS ALEXANDER VICTOR' ||
  !english.weeks?.includes('单周')
) {
  throw new Error(`english teacher/weeks hydrate failed ${JSON.stringify(english)}`)
}

const gridOcr = hydrateTimetableOcr(
  {
    dayHeaders: ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'],
    slots: [
      {
        label: '第一大节',
        startTime: '08:00',
        endTime: '09:30',
        cells: [
          '微积分C II\n贾鲁军 讲师\n教一1506/1-2节/1-16周',
          '',
          '瑜伽\n秦迪 讲师\n世纪馆南203/1-2节/1-16周',
          '',
          '',
          '',
          '',
        ],
      },
    ],
    courses: [
      { name: '微积分C II', weekday: 2, startTime: '08:00', endTime: '09:30' },
    ],
  },
  defaults,
)
const gridCalc = gridOcr.courses.find((c) => c.name.includes('微积分'))
const yoga = gridOcr.courses.find((c) => c.name.includes('瑜伽'))
if (!gridCalc || gridCalc.weekday !== 1 || gridCalc.teacher !== '贾鲁军') {
  throw new Error(`grid flatten Monday failed ${JSON.stringify(gridCalc)}`)
}
if (!yoga || yoga.weekday !== 3 || yoga.location !== '世纪馆南203') {
  throw new Error(`grid flatten Wednesday failed ${JSON.stringify(yoga)}`)
}

const eightCells = flattenTimetableOcrPayload({
  slots: [
    {
      startTime: '10:00',
      endTime: '11:30',
      cells: ['第二大节', '中国管理智慧', '英语国家社会与文化', '', '微积分C II', '职业生涯教育', '', ''],
    },
  ],
})
if (
  eightCells.courses[0]?.weekday !== 1 ||
  eightCells.courses[0]?.name !== '中国管理智慧' ||
  eightCells.courses[1]?.weekday !== 2
) {
  throw new Error(`8-cell 节次 skip failed ${JSON.stringify(eightCells.courses)}`)
}

const teachers = parseOcrCellText(
  '数据分析应用案例\n靳永爱 教授,杨凡 教授,郭晓明 教授\n教二702/5-6节/1-16周',
)
if (
  !teachers ||
  teachers.name !== '数据分析应用案例' ||
  !teachers.teacher?.includes('靳永爱') ||
  teachers.location !== '教二702'
) {
  throw new Error(`multi-teacher cell parse failed ${JSON.stringify(teachers)}`)
}
const psych = parseOcrCellText('大学生心理健康\n张宏宇\n理论学时:32\n教一1304/7-8节/1-16周')
if (!psych || psych.name !== '大学生心理健康' || psych.teacher !== '张宏宇') {
  throw new Error(`short teacher parse failed ${JSON.stringify(psych)}`)
}
const sticky = hydrateTimetableOcr(
  {
    courses: [
      {
        name: '大学生心理健康 张宏宇',
        weekday: 2,
        startTime: '14:00',
        endTime: '15:30',
        location: '教一1304',
        weeks: '1-16周',
      },
    ],
  },
  defaults,
)
if (sticky.courses[0]?.name !== '大学生心理健康' || sticky.courses[0]?.teacher !== '张宏宇') {
  throw new Error(`sticky teacher hydrate failed ${JSON.stringify(sticky.courses[0])}`)
}

const datedAsExam = hydrateTimetableOcr(
  {
    courses: [
      { name: '大学英语', date: '2026-10-08', startTime: '14:00', endTime: '16:00', location: '外语楼101' },
    ],
    exams: [{ name: '高等数学', date: '2026-10-20', startTime: '08:00', endTime: '10:00', kind: '期末' }],
  },
  defaults,
)
if (datedAsExam.courses.length !== 0) throw new Error('dated OCR course should become exam')
if (datedAsExam.exams.length !== 2 || !datedAsExam.exams.some((e) => e.name === '大学英语')) {
  throw new Error(`dated OCR exam flatten failed ${JSON.stringify(datedAsExam.exams)}`)
}
const sorted = sortExams(datedAsExam.exams)
if (sorted[0].name !== '大学英语' || sorted[1].name !== '高等数学') {
  throw new Error(`exam date sort failed ${sorted.map((e) => e.name).join(',')}`)
}

const keyed = hydrateTimetableOcr(
  {
    星期一: [{ name: '社会科学研究方法', startTime: '14:00', endTime: '15:30', location: '教二702' }],
    星期二: [{ name: '大学生心理健康', startTime: '14:00', endTime: '15:30' }],
  },
  defaults,
)
if (
  keyed.courses.find((c) => c.name.includes('社会'))?.weekday !== 1 ||
  keyed.courses.find((c) => c.name.includes('心理'))?.weekday !== 2
) {
  throw new Error(`weekday-keyed object flatten failed ${JSON.stringify(keyed.courses)}`)
}

console.log(
  'timetable selftest ok',
  `${grid.courses.length} courses`,
  `${exams.exams.length} exams`,
  `math ${math.startTime}-${math.endTime} (${math.weekday})`,
  `xlsx ${xlsx.courses.length}`,
  `ocr ${ocr.courses.length}/${ocr.exams.length}`,
  `label ${calc.weekday} grid ${gridCalc.weekday}/${yoga.weekday}`,
)
