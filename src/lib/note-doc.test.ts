import { describe, expect, it } from 'vitest'
import { noteTitle, noteToDocsDocument } from './note-doc'

describe('noteTitle', () => {
  it('uses the explicit title when there is one', () => {
    expect(noteTitle({ title: '会议纪要', body: '正文' })).toBe('会议纪要')
  })

  it('falls back to the first non-empty line', () => {
    expect(noteTitle({ title: '  ', body: '\n\n买菜清单\n西红柿' })).toBe('买菜清单')
  })

  it('never produces an empty document name', () => {
    expect(noteTitle({ title: '', body: '   \n  ' })).toBe('未命名便签')
  })
})

describe('noteToDocsDocument', () => {
  it('builds a doc the 网页文档 editor accepts', () => {
    const doc = noteToDocsDocument({ title: '周报', body: '第一行\n第二行' })
    expect(doc.title).toBe('周报')
    expect(doc.content.type).toBe('doc')
    const [heading, ...paragraphs] = doc.content.content ?? []
    expect(heading.type).toBe('heading')
    expect(heading.content?.[0].text).toBe('周报')
    expect(paragraphs.map((p) => p.content?.[0]?.text)).toEqual(['第一行', '第二行'])
  })

  it('keeps blank lines as empty paragraphs, never empty text nodes', () => {
    const doc = noteToDocsDocument({ title: 't', body: 'a\n\nb' })
    const paragraphs = (doc.content.content ?? []).slice(1)
    expect(paragraphs).toHaveLength(3)
    expect(paragraphs[1].content).toBeUndefined()
    // 空 text 节点会被文档接口拒绝，这条断言就是防它回来的。
    const texts = JSON.stringify(doc)
    expect(texts).not.toContain('"text":""')
  })

  it('only uses node types the editor allows', () => {
    const allowed = new Set(['doc', 'heading', 'paragraph', 'text'])
    const doc = noteToDocsDocument({ title: '标题', body: '内容' })
    const walk = (node: { type: string; content?: { type: string }[] }): void => {
      expect(allowed.has(node.type)).toBe(true)
      node.content?.forEach((child) => walk(child as typeof node))
    }
    walk(doc.content)
  })
})
