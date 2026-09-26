import type { Note } from '../types'
import { browserHttpOrigin, configuredSiteOrigin } from './public-env'

/**
 * 便签和笔记是同一个东西。这里把一条便签翻译成主站「网页文档」认识的 JSON。
 * 网页文档是可选能力：失败、超时或主站不可用都不能拖住日事本身。
 */

const DOCS_REQUEST_TIMEOUT_MS = 20_000

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
 * Web 使用当前页面 origin；原生壳必须通过构建变量提供站点 origin。
 * 不再把某一台服务器或旧域名写死进客户端源码。
 */
export function siteApiUrl(path: string): string {
  const web = browserHttpOrigin()
  if (web) return `${web}${path}`
  const site = configuredSiteOrigin()
  if (!site) throw new NoteDocError('网页文档地址未配置，便签仍保存在日事里')
  return `${site}${path}`
}

export class NoteDocError extends Error {}

async function postDocs(path: string, body: unknown, credentials: RequestCredentials): Promise<Response> {
  try {
    return await fetch(siteApiUrl(path), {
      method: 'POST',
      credentials,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(DOCS_REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof NoteDocError) throw error
    throw new NoteDocError('网页文档暂时不可用，便签仍保存在日事里')
  }
}

export async function downloadNoteAsWord(note: Pick<Note, 'title' | 'body'>): Promise<void> {
  const payload = noteToDocsDocument(note)
  const response = await postDocs('/api/docs/export', payload, 'same-origin')
  if (!response.ok) throw new NoteDocError('导出 Word 失败，请稍后再试')

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${payload.title}.docx`
  link.click()
  URL.revokeObjectURL(url)
}

export async function openNoteInDocs(note: Pick<Note, 'title' | 'body'>): Promise<string> {
  const response = await postDocs('/api/docs', noteToDocsDocument(note), 'include')
  if (response.status === 401) throw new NoteDocError('请先登录统一账号，才能存进网页文档')
  if (!response.ok) throw new NoteDocError('创建网页文档失败，请稍后再试')

  const doc = (await response.json()) as { id?: string }
  if (!doc.id) throw new NoteDocError('创建网页文档失败，请稍后再试')
  return siteApiUrl(`/products/docs/${doc.id}`)
}
