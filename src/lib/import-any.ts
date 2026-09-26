import { classifyTimetableFile } from './file-kinds'
import { importViaAi } from './timetable-ocr'
import { importTimetableFile, type TimetableImportResult } from './timetable-import'

export type ImportSource = 'sheet' | 'ai'
export type ImportFocus = 'auto' | 'courses' | 'exams' | 'self'

function applyFocus(
  result: TimetableImportResult,
  focus: ImportFocus,
): TimetableImportResult {
  if (focus === 'courses') {
    return {
      ...result,
      exams: [],
      kind: result.courses.length ? 'courses' : result.kind,
    }
  }
  if (focus === 'exams') {
    return {
      ...result,
      courses: [],
      kind: result.exams.length ? 'exams' : result.kind,
    }
  }
  if (focus === 'self') {
    return {
      ...result,
      courses: [],
      exams: [],
      kind: (result.selfSchedules?.length ?? 0) ? 'self' : result.kind,
    }
  }
  return result
}

export async function importTimetableAny(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
  userHint = '',
  focus: ImportFocus = 'auto',
): Promise<TimetableImportResult & { source: ImportSource }> {
  const kind = classifyTimetableFile(file.name, file.type)
  let result: TimetableImportResult
  let source: ImportSource = 'sheet'
  if (kind === 'sheet') {
    // 表格有确定性解析，先本地跑完；本地能解决就不花 AI 的钱
    try {
      result = await importTimetableFile(file, defaults)
    } catch (error) {
      if (file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.tsv')) throw error
      result = await importViaAi(file, defaults, userHint, focus)
      source = 'ai'
    }
  } else if (kind === 'image' || kind === 'pdf' || kind === 'document') {
    result = await importViaAi(file, defaults, userHint, focus)
    source = 'ai'
  } else {
    try {
      result = await importTimetableFile(file, defaults)
    } catch {
      result = await importViaAi(file, defaults, userHint, focus)
      source = 'ai'
    }
  }
  const focused = applyFocus(result, focus)
  if (focus === 'exams' && focused.exams.length === 0) {
    throw new Error('没有识别到考试。请拍教务处的考试安排表，或导入带日期的考试表格。')
  }
  if (focus === 'courses' && focused.courses.length === 0) {
    throw new Error('没有识别到课程。请拍教务处的周课表，或导入带星期和节次的表格。')
  }
  if (focus === 'self' && !(focused.selfSchedules?.length)) {
    throw new Error('没有识别到自律安排。请拍假期时间表，或导入带星期和时段的表格。')
  }
  return { ...focused, source }
}
