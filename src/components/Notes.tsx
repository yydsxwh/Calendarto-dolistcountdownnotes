import { useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface Note {
  id: string
  text: string
  updatedAt: number
}

export default function Notes() {
  const [notes, setNotes] = useLocalStorage<Note[]>('notes', [])
  const [draft, setDraft] = useState('')

  const add = () => {
    const value = draft.trim()
    if (!value) return
    setNotes([
      { id: crypto.randomUUID(), text: value, updatedAt: Date.now() },
      ...notes,
    ])
    setDraft('')
  }

  const update = (id: string, text: string) =>
    setNotes(
      notes.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n)),
    )

  const remove = (id: string) => setNotes(notes.filter((n) => n.id !== id))

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>笔记</h2>
        <span className="pill">{notes.length} 条</span>
      </header>

      <div className="col">
        <textarea
          className="textarea"
          placeholder="记录点什么…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="新笔记"
          rows={3}
        />
        <button className="btn primary" onClick={add}>
          保存笔记
        </button>
      </div>

      <ul className="notes-list">
        {notes.length === 0 && <li className="empty">还没有笔记</li>}
        {notes.map((n) => (
          <li key={n.id} className="note-card">
            <textarea
              className="note-text"
              value={n.text}
              onChange={(e) => update(n.id, e.target.value)}
              rows={3}
            />
            <div className="note-foot">
              <span className="note-time">
                {new Date(n.updatedAt).toLocaleString('zh-CN')}
              </span>
              <button
                className="icon-btn"
                onClick={() => remove(n.id)}
                aria-label="删除"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
