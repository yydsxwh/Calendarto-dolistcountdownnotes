import type { Note } from '../types'

/**
 * 便签和笔记是同一个东西。这里把一条便签翻译成主站「网页文档」认识的 JSON，
 * 于是同一条内容既能在日事里速记，也能在文档里继续写、另存成 Word 给 WPS 打开。
 *
 * 两个接口都由主站提供，且与 /products/days/ 同源：
 *   POST /api/docs/export  →  .docx（不需要登录）
 *   POST /api/docs         →  新建文档，返回 { id }（需要登录）
 */

const SITE_ORIGIN = 'https://www.yydsxwh.com'

/** 只用文档编辑器允许的节点类型：doc / heading / paragraph / text。 */
type DocsNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: DocsNode[]
  text?: string
}

export type DocsDocument = { title: string; content: DocsNode }

export function noteTitle(note: Pick<Note, 'title' | 'body'>): string {
  const explicit = note.title.trim()
  if (explicit) return explicit
  const firstLine = note.body.split('\n').map((line) => line.trim()).find(Boolean)
  return firstLine ? firstLine.slice(0, 40) : '未命名便签'
}

export function noteToDocsDocument(note: Pick<Note, 'title' | 'body'>): DocsDocument {
  const title = noteTitle(note)
  const paragraphs = note.body.split('\n').map<DocsNode>((line) => {
    const text = line.trim()
    // 文档的 text 节点不允许空字符串，空行就给一个没有 content 的段落。
    return text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }
  })
  return {
    title,
    content: {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: title }] },
        ...paragraphs,
      ],
    },
  }
}

/**
 * 原生壳（Capacitor / Electron）里页面不是从 www.yydsxwh.com 提供的，
 * 相对路径会落到 file:// 上，所以那种情况下必须补全主站域名。
 */
export function siteApiUrl(path: string): string {
  if (typeof window === 'undefined') return `${SITE_ORIGIN}${path}`
  const { protocol, origin } = window.location
  const isWeb = protocol === 'http:' || protocol === 'https:'
  return isWeb ? `${origin}${path}` : `${SITE_ORIGIN}${path}`
}

export class NoteDocError extends Error {}

/** 另存为 .docx。主站直接返回 Word 2007+ 文件，WPS / Word / Pages 都能打开。 */
export async function downloadNoteAsWord(note: Pick<Note, 'title' | 'body'>): Promise<void> {
  const payload = noteToDocsDocument(note)
  const response = await fetch(siteApiUrl('/api/docs/export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) throw new NoteDocError('导出 Word 失败，请稍后再试')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${payload.title}.docx`
  link.click()
  URL.revokeObjectURL(url)
}

/** 把便签送进网页文档继续编辑；需要主站登录态。返回新文档地址。 */
export async function openNoteInDocs(note: Pick<Note, 'title' | 'body'>): Promise<string> {
  const response = await fetch(siteApiUrl('/api/docs'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(noteToDocsDocument(note)),
  })
  if (response.status === 401) throw new NoteDocError('请先登录统一账号，才能存进网页文档')
  if (!response.ok) throw new NoteDocError('创建网页文档失败，请稍后再试')

  const doc = (await response.json()) as { id?: string }
  if (!doc.id) throw new NoteDocError('创建网页文档失败，请稍后再试')
  return siteApiUrl(`/products/docs/${doc.id}`)
}
