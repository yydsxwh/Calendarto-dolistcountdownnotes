import { useMemo, useState } from 'react'
import { useLocalStorage } from '../hooks/useLocalStorage'

interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
}

export default function Todos() {
  const [todos, setTodos] = useLocalStorage<Todo[]>('todos', [])
  const [text, setText] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'done'>('all')

  const addTodo = () => {
    const value = text.trim()
    if (!value) return
    setTodos([
      { id: crypto.randomUUID(), text: value, done: false, createdAt: Date.now() },
      ...todos,
    ])
    setText('')
  }

  const toggle = (id: string) =>
    setTodos(todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)))

  const remove = (id: string) => setTodos(todos.filter((t) => t.id !== id))

  const clearDone = () => setTodos(todos.filter((t) => !t.done))

  const visible = useMemo(() => {
    if (filter === 'active') return todos.filter((t) => !t.done)
    if (filter === 'done') return todos.filter((t) => t.done)
    return todos
  }, [todos, filter])

  const remaining = todos.filter((t) => !t.done).length

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>待办清单</h2>
        <span className="pill">{remaining} 项未完成</span>
      </header>

      <div className="row">
        <input
          className="input"
          placeholder="添加一个待办事项…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTodo()}
          aria-label="新待办事项"
        />
        <button className="btn primary" onClick={addTodo}>
          添加
        </button>
      </div>

      <div className="tabs">
        {(['all', 'active', 'done'] as const).map((f) => (
          <button
            key={f}
            className={`tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? '全部' : f === 'active' ? '未完成' : '已完成'}
          </button>
        ))}
      </div>

      <ul className="list">
        {visible.length === 0 && <li className="empty">暂无待办事项</li>}
        {visible.map((t) => (
          <li key={t.id} className={`list-item ${t.done ? 'done' : ''}`}>
            <label className="check">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => toggle(t.id)}
              />
              <span>{t.text}</span>
            </label>
            <button
              className="icon-btn"
              onClick={() => remove(t.id)}
              aria-label="删除"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {todos.some((t) => t.done) && (
        <button className="btn ghost" onClick={clearDone}>
          清除已完成
        </button>
      )}
    </section>
  )
}
