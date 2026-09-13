import Calendar from './components/Calendar'
import Todos from './components/Todos'
import Countdowns from './components/Countdowns'
import Notes from './components/Notes'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>
          <span className="logo">📅</span> 日历 · 待办 · 倒数日 · 笔记
        </h1>
        <p className="subtitle">
          Calendar · To-do · Countdown · Notes — 数据保存在本地浏览器中
        </p>
      </header>

      <main className="grid">
        <Calendar />
        <Todos />
        <Countdowns />
        <Notes />
      </main>

      <footer className="app-footer">
        本地优先 · 无需登录 · 数据存储于 localStorage
      </footer>
    </div>
  )
}
