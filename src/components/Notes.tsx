import { useState } from 'react'
import { NOTE_COLORS } from '../types'
import { NoteDocError, downloadNoteAsWord, openNoteInDocs } from '../lib/note-doc'
import type { AppStore } from '../hooks/useAppStore'
import type { Note } from '../types'

export default function Notes({ store }: { store: AppStore }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [color, setColor] = useState<string>(NOTE_COLORS[0])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const add = () => {
    if (!title.trim() && !body.trim()) return
    store.addNote(title, body, { color })
    setTitle('')
    setBody('')
  }

  const run = async (note: Note, job: 'word' | 'docs') => {
    setBusyId(note.id)
    setNotice(null)
    try {
      if (job === 'word') {
        await downloadNoteAsWord(note)
        setNotice('已另存为 Word 文档，可用 WPS 或 Word 打开。')
      } else {
        const url = await openNoteInDocs(note)
        window.open(url, '_blank', 'noopener')
        setNotice('已存进网页文档，已在新标签页打开。')
      }
    } catch (error) {
      setNotice(error instanceof NoteDocError ? error.message : '操作失败，请稍后再试。')
    } finally {
      setBusyId(null)
    }
  }

  const notes = [...store.data.notes].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
  )

  return (
    <section className="view">
      <header className="view-head">
        <h2>便签 · 笔记</h2>
        <p className="muted">
          彩色便利贴式速记，钉住的会出现在「今日」。要写长文就把它送进网页文档，
          也可以直接另存成 Word 给 WPS 打开。
        </p>
      </header>

      <div className="card">
        <div className="col">
          <input
            className="input"
            placeholder="标题"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="便签标题"
          />
          <textarea
            className="textarea"
            placeholder="随手记一笔…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            aria-label="便签正文"
          />
          <div className="row wrap">
            <div className="swatches">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${color === c ? 'on' : ''}`}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
            <button className="btn primary" onClick={add}>
              贴上便签
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <div className="note-grid">
        {notes.length === 0 && (
          <p className="empty">还没有便签。灵感、购物清单、会议纪要都可以先贴在这里。</p>
        )}
        {notes.map((n) => (
          <article key={n.id} className="sticky" style={{ background: n.color }}>
            <div className="sticky-top">
              <button
                className={`pin ${n.pinned ? 'on' : ''}`}
                onClick={() => store.updateNote(n.id, { pinned: !n.pinned })}
                aria-label={n.pinned ? '取消钉住' : '钉住'}
              >
                {n.pinned ? '已钉住' : '钉住'}
              </button>
              <button className="icon-btn" onClick={() => store.removeNote(n.id)} aria-label="删除">
                ✕
              </button>
            </div>
            <input
              className="sticky-title"
              value={n.title}
              placeholder="标题"
              onChange={(e) => store.updateNote(n.id, { title: e.target.value })}
            />
            <textarea
              className="sticky-body"
              value={n.body}
              placeholder="内容"
              rows={5}
              onChange={(e) => store.updateNote(n.id, { body: e.target.value })}
            />
            <div className="sticky-foot">
              <button
                className="link-btn"
                disabled={busyId === n.id}
                onClick={() => void run(n, 'docs')}
              >
                用网页文档打开
              </button>
              <button
                className="link-btn"
                disabled={busyId === n.id}
                onClick={() => void run(n, 'word')}
              >
                另存 Word
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
