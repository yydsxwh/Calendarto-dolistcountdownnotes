import { readZip } from './zip'

/**
 * DOCX 拆包。
 *
 * 之前 BFF 把 .docx 的原始二进制拼成 `data:application/vnd...;base64,` 当
 * `image_url` 发给视觉模型——模型当然读不出来，用户只看到「识别失败」。
 * Word 其实就是个 ZIP：正文和表格在 `word/document.xml`，插图在 `word/media/`。
 * 正文走文本识别，插图走视觉识别，两条路分开。
 */

export type DocxContent = {
  /** 正文段落与表格，表格按「单元格 | 单元格」逐行铺开 */
  text: string
  /** 内嵌图片，按体积从大到小，只留可能是课表截图的那几张 */
  images: { fileName: string; mimeType: string; bytes: Buffer }[]
}

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
}

/** 太小的多半是图标、页眉 logo，送去识别只是浪费一次模型调用 */
const MIN_IMAGE_BYTES = 20_000
const MAX_IMAGES = 3

export function isDocx(fileName: string, mimeType: string): boolean {
  return (
    /\.docx$/i.test(fileName) ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

export function isLegacyDoc(fileName: string, mimeType: string): boolean {
  return /\.(doc|wps)$/i.test(fileName) || mimeType === 'application/msword'
}

export function extractDocx(buffer: Buffer): DocxContent {
  const entries = readZip(buffer)
  const documentXml = entries.get('word/document.xml')
  if (!documentXml) throw new Error('DOCX_NO_DOCUMENT')

  const images: DocxContent['images'] = []
  for (const [name, bytes] of entries) {
    if (!name.startsWith('word/media/')) continue
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    const mimeType = IMAGE_MIME[ext]
    if (!mimeType || bytes.length < MIN_IMAGE_BYTES) continue
    images.push({ fileName: name.slice('word/media/'.length), mimeType, bytes })
  }
  images.sort((a, b) => b.bytes.length - a.bytes.length)

  return { text: documentText(documentXml.toString('utf8')), images: images.slice(0, MAX_IMAGES) }
}

/**
 * 从 WordprocessingML 里取纯文本。
 * 表格是课表的主要载体，所以单元格之间用 ` | ` 分隔、行之间换行，
 * 这样模型仍能看出「第一列是节次，后面七列是星期」的结构。
 */
export function documentText(xml: string): string {
  const body = xml.replace(/\r/g, '')
  const lines: string[] = []

  for (const rowXml of matchAll(body, /<w:tr\b[\s\S]*?<\/w:tr>/g)) {
    const cells = matchAll(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/g).map((cell) => plainRun(cell))
    if (cells.some((cell) => cell)) lines.push(cells.join(' | '))
  }

  // 表格外的段落（学期说明、备注）也一并给模型
  const withoutTables = body.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '')
  for (const paragraph of matchAll(withoutTables, /<w:p\b[\s\S]*?<\/w:p>/g)) {
    const text = plainRun(paragraph)
    if (text) lines.push(text)
  }

  return lines.join('\n').slice(0, 20_000)
}

function plainRun(xml: string): string {
  const parts: string[] = []
  for (const chunk of matchAll(xml, /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)) {
    const inner = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(chunk)?.[1] ?? ''
    parts.push(decodeXml(inner))
  }
  const joined = parts.join('')
  // <w:br/> 在单元格里代表换行，压成空格，保持一行一条记录
  return joined.replace(/\s+/g, ' ').trim()
}

function matchAll(input: string, pattern: RegExp): string[] {
  const out: string[] = []
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  let match: RegExpExecArray | null
  while ((match = re.exec(input)) !== null) {
    out.push(match[0])
    if (match.index === re.lastIndex) re.lastIndex++
  }
  return out
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}
