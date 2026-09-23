import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import test from 'node:test'

import { documentText, extractDocx, isDocx, isLegacyDoc } from './docx'
import {
  MAX_OCR_FILE_BYTES,
  OcrError,
  buildParts,
  extractJson,
  normalizeIsoDate,
  normalizeOcrPayload,
  normalizeClock,
  translatePlatformError,
} from './ai-ocr'
import { PLATFORM_CALL_TIMEOUT_MS } from './platform'

/** 手搓一个最小 DOCX（ZIP），避免测试依赖二进制样例文件 */
function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8')
    const compressed = deflateRawSync(file.data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(0, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(file.data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    locals.push(local, nameBuf, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(file.data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)
    offset += local.length + nameBuf.length + compressed.length
  }
  const body = Buffer.concat(locals)
  const directory = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(files.length, 8)
  eocd.writeUInt16LE(files.length, 10)
  eocd.writeUInt32LE(directory.length, 12)
  eocd.writeUInt32LE(body.length, 16)
  return Buffer.concat([body, directory, eocd])
}

const DOCUMENT_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
<w:p><w:r><w:t>2026 秋季学期课表</w:t></w:r></w:p>
<w:tbl>
<w:tr><w:tc><w:p><w:r><w:t>节次</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>星期一</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>星期二</w:t></w:r></w:p></w:tc></w:tr>
<w:tr><w:tc><w:p><w:r><w:t>08:00-09:40</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>高等数学</w:t></w:r><w:r><w:t> 教一1506</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>大学英语</w:t></w:r></w:p></w:tc></w:tr>
</w:tbl>
</w:body></w:document>`

test('DOCX 正文和表格被提取成结构化文本，而不是塞给视觉模型', () => {
  const docx = makeZip([
    { name: 'word/document.xml', data: Buffer.from(DOCUMENT_XML, 'utf8') },
    { name: 'word/media/image1.png', data: Buffer.alloc(40_000, 7) },
    { name: 'word/media/icon.png', data: Buffer.alloc(300, 1) },
  ])
  assert.equal(isDocx('课表.docx', 'application/octet-stream'), true)

  const content = extractDocx(docx)
  assert.match(content.text, /节次 \| 星期一 \| 星期二/)
  assert.match(content.text, /08:00-09:40 \| 高等数学 教一1506 \| 大学英语/)
  assert.match(content.text, /2026 秋季学期课表/)
  // 大图当插图送去识别，小图标忽略
  assert.equal(content.images.length, 1)
  assert.equal(content.images[0]?.fileName, 'image1.png')

  const parts = buildParts({
    fileName: '课表.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: docx,
    userHint: '',
    kind: 'courses',
    actorId: 'usr_test',
  })
  assert.match(parts.text, /高等数学/)
  assert.equal(parts.images.length, 1)
})

test('旧版 .doc 给出转换提示，而不是笼统的识别失败', () => {
  assert.equal(isLegacyDoc('课表.doc', ''), true)
  assert.throws(
    () =>
      buildParts({
        fileName: '课表.doc',
        mimeType: 'application/msword',
        bytes: Buffer.from('x'),
        userHint: '',
        kind: 'auto',
        actorId: 'usr_test',
      }),
    (error: unknown) => error instanceof OcrError && error.code === 'legacy_doc',
  )
})

test('图片走视觉输入，未知格式明确拒绝', () => {
  const image = buildParts({
    fileName: 'a.jpg',
    mimeType: 'image/jpeg',
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    userHint: '',
    kind: 'courses',
    actorId: 'usr_test',
  })
  assert.equal(image.images.length, 1)
  assert.equal(image.images[0]?.mimeType, 'image/jpeg')

  assert.throws(
    () =>
      buildParts({
        fileName: 'a.exe',
        mimeType: 'application/x-msdownload',
        bytes: Buffer.from('x'),
        userHint: '',
        kind: 'auto',
        actorId: 'usr_test',
      }),
    (error: unknown) => error instanceof OcrError && error.code === 'unsupported_format',
  )
})

test('模型输出要过 schema：星期 1-7、时间 HH:mm、结束晚于开始、日期合法', () => {
  assert.equal(normalizeClock('8:5'), '08:05')
  assert.equal(normalizeClock('25:00'), undefined)
  assert.equal(normalizeIsoDate('2026/2/30'), undefined)
  assert.equal(normalizeIsoDate('2026年1月5日'), '2026-01-05')

  const payload = normalizeOcrPayload(
    {
      courses: [
        { name: '高等数学', weekday: 1, startTime: '08:00', endTime: '09:40' },
        { name: '倒挂课', weekday: 2, startTime: '10:00', endTime: '09:00' },
        { name: '越界星期', weekday: 9, startTime: '08:00', endTime: '09:00' },
      ],
      exams: [
        { name: '大学英语', date: '2026-06-18', startTime: '14:00' },
        { name: '没有日期的考试', startTime: '09:00' },
        { name: '假日期', date: '2026-02-31', startTime: '09:00' },
      ],
    },
    'auto',
  )
  const courses = payload.courses as Record<string, unknown>[]
  const exams = payload.exams as Record<string, unknown>[]
  assert.deepEqual(
    courses.map((c) => c.name),
    ['高等数学', '越界星期'],
  )
  // 越界星期数被丢掉，交给客户端按 weekdayLabel 还原，而不是硬写成周一
  assert.equal(courses[1]?.weekday, undefined)
  assert.deepEqual(
    exams.map((e) => e.name),
    ['大学英语'],
  )
  assert.ok((payload.warnings as string[]).length >= 3)
})

test('kind 会真的收窄结果，不是永远 auto', () => {
  const raw = {
    courses: [{ name: '高等数学', weekday: 1, startTime: '08:00', endTime: '09:40' }],
    exams: [{ name: '大学英语', date: '2026-06-18', startTime: '14:00' }],
    selfSchedules: [{ title: '晨跑', weekday: 1, startTime: '06:30', endTime: '07:00' }],
  }
  assert.equal((normalizeOcrPayload(raw, 'courses').exams as unknown[]).length, 0)
  assert.equal((normalizeOcrPayload(raw, 'exams').courses as unknown[]).length, 0)
  assert.equal((normalizeOcrPayload(raw, 'self').courses as unknown[]).length, 0)
  assert.equal((normalizeOcrPayload(raw, 'auto').courses as unknown[]).length, 1)
})

test('上传上限只有一个数，客户端与服务端共用', () => {
  assert.equal(MAX_OCR_FILE_BYTES, 20 * 1024 * 1024)
})

test('空表格行不会污染文档文本', () => {
  assert.equal(documentText('<w:body><w:tbl><w:tr><w:tc></w:tc></w:tr></w:tbl></w:body>'), '')
})

test('模型把 JSON 包在说明和围栏里、或带尾逗号时仍能取出课表', () => {
  const fenced = '识别结果如下：\n```json\n{"courses":[{"name":"高等数学","weekday":1,"startTime":"08:00","endTime":"09:40",}]}\n```\n请核对。'
  const parsed = extractJson(fenced) as { courses: { name: string }[] }
  assert.equal(parsed.courses[0]?.name, '高等数学')

  const quoted = '说明 {"note":"先看节次"} 然后 {"courses":[{"name":"大学英语","weekday":2,"startTime":"10:00","endTime":"11:40"}]} 完'
  assert.equal((extractJson(quoted) as { courses: { name: string }[] }).courses[0]?.name, '大学英语')
  const rows = extractJson('[{"name":"线性代数","weekday":3,"startTime":"14:00","endTime":"15:40"}]') as {
    courses: { name: string }[]
  }
  assert.equal(rows.courses[0]?.name, '线性代数')
})

test('平台在 15 秒中断时不能再报成返回格式不合法', () => {
  const aborted = translatePlatformError(new Error('platform 请求失败：This operation was aborted'))
  assert.equal(aborted.code, 'upstream_timeout')
  const http = translatePlatformError(new Error('模型返回 400：invalid image'))
  assert.equal(http.code, 'recognition_failed')
  assert.ok(PLATFORM_CALL_TIMEOUT_MS >= 60_000)
  assert.ok(PLATFORM_CALL_TIMEOUT_MS < 120_000)
})
