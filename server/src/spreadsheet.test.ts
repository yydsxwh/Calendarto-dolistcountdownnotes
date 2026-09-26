import assert from 'node:assert/strict'
import test from 'node:test'

import { parseSpreadsheet } from './spreadsheet'

test('周课表 CSV 按表头确定星期，不把节次列当成周一', () => {
  const csv = '节次,周一,周二\n08:00-09:40,高等数学 教一1506,大学英语\n'
  const parsed = parseSpreadsheet(Buffer.from(csv), '课表.csv')
  assert.ok(parsed)
  assert.equal(parsed.courses.length, 2)
  assert.equal(parsed.courses[0]?.name, '高等数学')
  assert.equal(parsed.courses[0]?.weekday, 1)
  assert.equal(parsed.courses[0]?.startTime, '08:00')
  assert.equal(parsed.courses[0]?.endTime, '09:40')
  assert.equal(parsed.courses[1]?.weekday, 2)
  assert.equal(parsed.courses[1]?.name, '大学英语')
})

test('列表表格读出考试日期', () => {
  const csv = '科目,日期,开始\n线性代数,2026-06-20,09:00\n'
  const parsed = parseSpreadsheet(Buffer.from(csv), '考试.csv')
  assert.equal(parsed?.exams[0]?.name, '线性代数')
  assert.equal(parsed?.exams[0]?.date, '2026-06-20')
  assert.equal(parsed?.exams[0]?.startTime, '09:00')
})
