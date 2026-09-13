import { useMemo, useState } from 'react'
import type { AppStore } from '../hooks/useAppStore'
import type { DueReminder } from '../lib/reminders'
import { daysUntil, toISODate, startOfToday } from '../lib/dates'
import {
  WEEKDAY_LABELS,
  durationMinutes,
  formatDuration,
  jsWeekday,
  normalizeClockInput,
} from '../lib/periods'
import { TIMETABLE_ACCEPT } from '../lib/file-kinds'
import { importTimetableAny } from '../lib/import-any'
import { upcomingExams } from '../lib/reminders'
import { sampleExamCsv, sampleGridCsv, type TimetableImportResult } from '../lib/timetable-import'
import { EXAM_KIND_LABEL, type Course, type ExamKind } from '../types'

function TimeInput({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (next: string) => void
  label: string
}) {
  return (
    <input
      className="input slim"
      type="text"
      inputMode="numeric"
      placeholder="08:00"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        const parsed = normalizeClockInput(value)
        if (parsed) onChange(parsed)
      }}
    />
  )
}

type Tab = 'week' | 'import' | 'exams' | 'remind'

export default function Schedule({
  store,
  requestPermission,
  previewReminder,
}: {
  store: AppStore
  requestPermission: () => Promise<NotificationPermission | 'denied' | 'granted'>
  previewReminder: (item: DueReminder) => void
}) {
  const [tab, setTab] = useState<Tab>('week')
  const [name, setName] = useState('')
  const [weekday, setWeekday] = useState(1)
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('09:40')
  const [location, setLocation] = useState('')
  const [teacher, setTeacher] = useState('')
  const [status, setStatus] = useState('')
  const [importing, setImporting] = useState(false)
  const [review, setReview] = useState<TimetableImportResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [userHint, setUserHint] = useState('')

  const [examName, setExamName] = useState('')
  const [examKind, setExamKind] = useState<ExamKind>('final')
  const [examDate, setExamDate] = useState('')
  const [examStart, setExamStart] = useState('09:00')
  const [examEnd, setExamEnd] = useState('11:00')
  const [examLoc, setExamLoc] = useState('')

  const todayWd = jsWeekday()
  const todayISO = toISODate(startOfToday())
  const settings = store.data.reminderSettings

  const slots = useMemo(() => {
    const map = new Map<string, { start: string; end: string }>()
    store.data.courses.forEach((c) => map.set(`${c.startTime}-${c.endTime}`, { start: c.startTime, end: c.endTime }))
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start))
  }, [store.data.courses])

  const examsSoon = upcomingExams(store.data.exams, todayISO)

  const addManual = () => {
    if (!name.trim()) return
    const start = normalizeClockInput(startTime)
    const end = normalizeClockInput(endTime)
    if (!start || !end) {
      setStatus('请用 24 小时制填写时间，例如 08:00 和 09:40')
      return
    }
    setStartTime(start)
    setEndTime(end)
    store.addCourse(name, {
      weekday,
      startTime: start,
      endTime: end,
      location: location || undefined,
      teacher: teacher || undefined,
      remindMinutes: settings.classDefaultMinutes,
    })
    setName('')
    setTeacher('')
    setStatus(`已添加 ${name.trim()}（${formatDuration(start, end)}）`)
  }

  const addExam = () => {
    if (!examName.trim() || !examDate) return
    const start = normalizeClockInput(examStart)
    const end = examEnd.trim() ? normalizeClockInput(examEnd) : undefined
    if (!start || (examEnd.trim() && !end)) {
      setStatus('考试时间请用 24 小时制，例如 14:00-16:00，避免写成上午/下午')
      return
    }
    setExamStart(start)
    if (end) setExamEnd(end)
    store.addExam(examName, {
      kind: examKind,
      date: examDate,
      startTime: start,
      endTime: end ?? undefined,
      location: examLoc || undefined,
      remindMinutes: settings.examDefaultMinutes,
    })
    setExamName('')
    setStatus(`已登记考试 ${examName.trim()} ${examDate} ${start}${end ? `-${end}` : ''}`)
  }

  const tryClassReminder = () => {
    const course = store.data.courses[0]
    previewReminder({
      id: course?.id || 'preview-class',
      key: `preview-class:${Date.now()}`,
      title: `上课提醒 · ${course?.name || '高等数学'}`,
      body: `${course?.startTime || '08:00'}-${course?.endTime || '09:40'} ${course?.location || '教学楼A101'} · 还有 ${settings.classDefaultMinutes} 分钟，现在出发以免迟到`,
      kind: 'class',
      fireAt: Date.now(),
    })
    setStatus('已弹出上课提醒条。浏览器通知需先点「允许浏览器通知」。')
  }

  const tryExamReminder = () => {
    const exam = store.data.exams[0]
    previewReminder({
      id: exam?.id || 'preview-exam',
      key: `preview-exam:${Date.now()}`,
      title: `考试提醒 · ${exam?.name || '大学英语'}`,
      body: `${exam?.date || '今天'} ${exam?.startTime || '14:00'}${exam?.endTime ? `-${exam.endTime}` : ''} ${exam?.location || ''} · 请核对开考时间以免记错错过`,
      kind: 'exam',
      fireAt: Date.now(),
    })
    setStatus('已弹出考试提醒条。建议同时打开「考试再提前 60 分钟提醒一次」。')
  }

  const applyResult = (result: TimetableImportResult, label: string) => {
    store.addCourses(result.courses)
    store.addExams(result.exams)
    const bits = [
      result.courses.length ? `${result.courses.length} 门课` : '',
      result.exams.length ? `${result.exams.length} 场考试` : '',
    ].filter(Boolean)
    setStatus(
      `已从「${label}」导入 ${bits.join('、')}` +
        (result.warnings.length ? `。提示：${result.warnings.slice(0, 3).join('；')}` : ''),
    )
    setReview(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
    }
    setTab(result.kind === 'exams' ? 'exams' : 'week')
  }

  const onImport = async (file: File) => {
    setImporting(true)
    setStatus('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '')
    try {
      const result = await importTimetableAny(
        file,
        {
          classRemindMinutes: settings.classDefaultMinutes,
          examRemindMinutes: settings.examDefaultMinutes,
        },
        userHint,
      )
      if (result.source === 'ai') {
        setReview(result)
        setStatus(
          `AI 已识别 ${result.courses.length} 门课` +
            (result.exams.length ? `、${result.exams.length} 场考试` : '') +
            '。请核对课程、地点、时间、老师、时长后再写入课表。',
        )
        setTab('import')
      } else {
        applyResult(result, file.name)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const patchReviewCourse = (id: string, patch: Partial<Course>) => {
    setReview((prev) =>
      prev
        ? { ...prev, courses: prev.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) }
        : prev,
    )
  }


  const downloadSample = (kind: 'grid' | 'exam') => {
    const csv = kind === 'grid' ? sampleGridCsv() : sampleExamCsv()
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = kind === 'grid' ? '课表示例-周视图.csv' : '考试时间表示例.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="view">
      <header className="view-head">
        <h2>超级课程表</h2>
        <p className="muted">
          导入表格，或把课表照片/PDF 交给站内 AI（与 MathCode 同一套视觉接口）识别课程、地点、时间、老师和时长。
        </p>
      </header>

      <div className="tabs">
        {(
          [
            ['week', '周课表'],
            ['import', '导入'],
            ['exams', '考试时间表'],
            ['remind', '提醒'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {status && <p className="import-status">{status}</p>}

      {tab === 'week' && (
        <>
          <div className="card">
            <div className="row wrap">
              <input
                className="input"
                placeholder="课程名，例如「高等数学」"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="课程名"
              />
              <select className="input slim" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAY_LABELS.map((label, i) => (
                  <option key={label} value={i + 1}>
                    {label}
                  </option>
                ))}
              </select>
              <TimeInput value={startTime} onChange={setStartTime} label="开始时间" />
              <TimeInput value={endTime} onChange={setEndTime} label="结束时间" />
              <input
                className="input slim"
                placeholder="教室"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <input
                className="input slim"
                placeholder="老师"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
              />
              <button className="btn primary" onClick={addManual}>
                加到课表
              </button>
            </div>
            <p className="muted">
              当前这节时长 {formatDuration(startTime, endTime)}（{durationMinutes(startTime, endTime)} 分钟）
            </p>
          </div>

          <div className="tt-wrap card">
            {store.data.courses.length === 0 ? (
              <p className="empty">还没有课。先导入教务处表格，或手动加一节。</p>
            ) : (
              <div className="tt-grid" style={{ gridTemplateColumns: `88px repeat(7, minmax(92px, 1fr))` }}>
                <div className="tt-h">节次</div>
                {WEEKDAY_LABELS.map((label, i) => (
                  <div key={label} className={`tt-h ${i + 1 === todayWd ? 'is-today' : ''}`}>
                    {label}
                  </div>
                ))}
                {slots.map((slot) => (
                  <div key={`${slot.start}-${slot.end}`} className="tt-contents">
                    <div className="tt-time">
                      <strong>{slot.start}</strong>
                      <span>{slot.end}</span>
                      <em>{formatDuration(slot.start, slot.end)}</em>
                    </div>
                    {WEEKDAY_LABELS.map((_, i) => {
                      const wd = i + 1
                      const items = store.data.courses.filter(
                        (c) => c.weekday === wd && c.startTime === slot.start && c.endTime === slot.end,
                      )
                      return (
                        <div key={wd} className={`tt-cell ${wd === todayWd ? 'is-today' : ''}`}>
                          {items.map((c) => (
                            <article key={c.id} className="tt-course" style={{ background: c.color }}>
                              <strong>{c.name}</strong>
                              <span>
                                {[c.location, c.teacher].filter(Boolean).join(' · ')}
                              </span>
                              <span>{formatDuration(c.startTime, c.endTime)}</span>
                              <button
                                className="icon-btn light"
                                onClick={() => store.removeCourse(c.id)}
                                aria-label="删除课程"
                              >
                                ✕
                              </button>
                            </article>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'import' && (
        <div className="card">
          <h3>从表格或图片导入</h3>
          <p className="muted">
            表格（xlsx / xls / csv / ods）在浏览器里直接解析。照片、截图、PDF
            走主站 MathCode 同一套视觉模型，抽出课程、教室、时间、老师，并按开始/结束时间算时长。Word
            文档由后台抽文本后再识别。
          </p>
          <p className="muted">
            周课表：第一行列周一到周日，格子里写课程 / 周次 / 教室 / 老师。拍照请尽量端正、无反光。
          </p>
          <input
            className="input"
            placeholder="可选：给 AI 的提示，例如「这是大二上学期课表，第1-2节是 08:00-09:40」"
            value={userHint}
            onChange={(e) => setUserHint(e.target.value)}
            aria-label="识别提示"
          />
          <div className="row wrap" style={{ marginTop: 12 }}>
            <label className="btn primary file-btn">
              {importing ? '正在识别…' : '选择表格或图片'}
              <input
                type="file"
                hidden
                accept={TIMETABLE_ACCEPT}
                disabled={importing}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void onImport(file)
                  e.target.value = ''
                }}
              />
            </label>
            <button className="btn ghost" onClick={() => downloadSample('grid')}>
              下载课表示例 CSV
            </button>
            <button className="btn ghost" onClick={() => downloadSample('exam')}>
              下载考试表示例 CSV
            </button>
            {store.data.courses.length > 0 && (
              <button className="btn ghost" onClick={() => store.clearCourses()}>
                清空课表
              </button>
            )}
          </div>
          {previewUrl && (
            <img className="ocr-preview" src={previewUrl} alt="待识别的课表图片" />
          )}
          {review && (
            <div className="review-box">
              <h3>核对识别结果</h3>
              <p className="muted">改错格子后再写入。时长由开始、结束时间自动计算。</p>
              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>课程</th>
                      <th>星期</th>
                      <th>开始</th>
                      <th>结束</th>
                      <th>时长</th>
                      <th>地点</th>
                      <th>老师</th>
                    </tr>
                  </thead>
                  <tbody>
                    {review.courses.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <input
                            value={c.name}
                            onChange={(e) => patchReviewCourse(c.id, { name: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            value={c.weekday}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { weekday: Number(e.target.value) })
                            }
                          >
                            {WEEKDAY_LABELS.map((label, i) => (
                              <option key={label} value={i + 1}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            value={c.startTime}
                            onChange={(e) =>
                              patchReviewCourse(c.id, {
                                startTime: normalizeClockInput(e.target.value) || e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={c.endTime}
                            onChange={(e) =>
                              patchReviewCourse(c.id, {
                                endTime: normalizeClockInput(e.target.value) || e.target.value,
                              })
                            }
                          />
                        </td>
                        <td>{formatDuration(c.startTime, c.endTime)}</td>
                        <td>
                          <input
                            value={c.location || ''}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { location: e.target.value || undefined })
                            }
                          />
                        </td>
                        <td>
                          <input
                            value={c.teacher || ''}
                            onChange={(e) =>
                              patchReviewCourse(c.id, { teacher: e.target.value || undefined })
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {review.exams.length > 0 && (
                <ul className="mini-list">
                  {review.exams.map((exam) => (
                    <li key={exam.id}>
                      {EXAM_KIND_LABEL[exam.kind]} {exam.name} {exam.date} {exam.startTime}
                      {exam.endTime ? `-${exam.endTime}` : ''} {exam.location}
                      <button
                        className="icon-btn"
                        onClick={() =>
                          setReview((prev) =>
                            prev
                              ? { ...prev, exams: prev.exams.filter((e) => e.id !== exam.id) }
                              : prev,
                          )
                        }
                        aria-label="从核对列表去掉这场考试"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="row wrap">
                <button className="btn primary" onClick={() => applyResult(review, 'AI 识别')}>
                  核对无误，写入课表
                </button>
                <button
                  className="btn ghost"
                  onClick={() => {
                    setReview(null)
                    if (previewUrl) {
                      URL.revokeObjectURL(previewUrl)
                      setPreviewUrl('')
                    }
                    setStatus('已放弃这次识别结果')
                  }}
                >
                  放弃
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'exams' && (
        <>
          <div className="card">
            <h3>登记一场考试</h3>
            <div className="row wrap">
              <input
                className="input"
                placeholder="科目，例如「高等数学」"
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
              />
              <select className="input slim" value={examKind} onChange={(e) => setExamKind(e.target.value as ExamKind)}>
                {Object.entries(EXAM_KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
              <input className="input slim" type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} />
              <TimeInput value={examStart} onChange={setExamStart} label="开考时间" />
              <TimeInput value={examEnd} onChange={setExamEnd} label="结束时间" />
              <input
                className="input slim"
                placeholder="考场"
                value={examLoc}
                onChange={(e) => setExamLoc(e.target.value)}
              />
              <button className="btn primary" onClick={addExam}>
                登记考试
              </button>
            </div>
          </div>
          <ul className="exam-list">
            {examsSoon.length === 0 && store.data.exams.length === 0 && (
              <li className="empty">还没有考试。导入考试表或手动登记，系统会按日期和时间提醒。</li>
            )}
            {store.data.exams.map((exam) => {
              const left = daysUntil(exam.date)
              const tone = left < 0 ? 'past' : left === 0 ? 'today' : left <= 3 ? 'soon' : ''
              return (
                <li key={exam.id} className={`exam-card ${tone}`}>
                  <div>
                    <span className="pill">{EXAM_KIND_LABEL[exam.kind]}</span>
                    <h3>{exam.name}</h3>
                    <p>
                      {exam.date} {exam.startTime}
                      {exam.endTime ? `-${exam.endTime}` : ''} · {exam.location || '地点待定'}
                      {exam.seat ? ` · 座 ${exam.seat}` : ''}
                    </p>
                    <strong>
                      {left < 0 ? '已结束' : left === 0 ? '就是今天，请再核对开考时间' : `还有 ${left} 天`}
                    </strong>
                  </div>
                  <button className="icon-btn" onClick={() => store.removeExam(exam.id)} aria-label="删除考试">
                    ✕
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {tab === 'remind' && (
        <div className="card">
          <h3>上课与考试提醒</h3>
          <p className="muted">
            上课默认提前喊你出门，避免迟到；考试默认提前一天，并可再提前一小时，减少记错时间错过考试。
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => store.updateReminderSettings({ enabled: e.target.checked })}
            />
            <span>开启提醒</span>
          </label>
          <div className="row wrap">
            <label>
              上课提前（分钟）
              <input
                className="input slim"
                type="number"
                min={0}
                value={settings.classDefaultMinutes}
                onChange={(e) =>
                  store.updateReminderSettings({ classDefaultMinutes: Number(e.target.value) || 0 })
                }
              />
            </label>
            <label>
              考试提前（分钟）
              <input
                className="input slim"
                type="number"
                min={0}
                value={settings.examDefaultMinutes}
                onChange={(e) =>
                  store.updateReminderSettings({ examDefaultMinutes: Number(e.target.value) || 0 })
                }
              />
            </label>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.examAlsoHourBefore}
              onChange={(e) => store.updateReminderSettings({ examAlsoHourBefore: e.target.checked })}
            />
            <span>考试再提前 60 分钟提醒一次</span>
          </label>
          <div className="row wrap">
            <button
              className="btn primary"
              onClick={() => {
                void requestPermission().then((perm) => {
                  setStatus(
                    perm === 'granted'
                      ? '已允许浏览器通知。把这个页面开着或固定标签，到点会弹出。'
                      : '未获得通知权限。仍可在本页顶部看到提醒条。',
                  )
                })
              }}
            >
              允许浏览器通知
            </button>
            <button className="btn ghost" onClick={tryClassReminder}>
              试响上课提醒
            </button>
            <button className="btn ghost" onClick={tryExamReminder}>
              试响考试提醒
            </button>
          </div>
          <p className="muted">默认：上课提前 {settings.classDefaultMinutes} 分钟，考试提前 {settings.examDefaultMinutes} 分钟。</p>
        </div>
      )}
    </section>
  )
}
