import { classifyTimetableFile } from './file-kinds'
import { importViaAi } from './timetable-ocr'
import { importTimetableFile, type TimetableImportResult } from './timetable-import'

export type ImportSource = 'sheet' | 'ai'

export async function importTimetableAny(
  file: File,
  defaults: { classRemindMinutes: number; examRemindMinutes: number },
  userHint = '',
): Promise<TimetableImportResult & { source: ImportSource }> {
  const kind = classifyTimetableFile(file.name, file.type)
  if (kind === 'sheet') {
    return { ...(await importTimetableFile(file, defaults)), source: 'sheet' }
  }
  if (kind === 'image' || kind === 'pdf' || kind === 'document') {
    return { ...(await importViaAi(file, defaults, userHint)), source: 'ai' }
  }
  try {
    return { ...(await importTimetableFile(file, defaults)), source: 'sheet' }
  } catch {
    return { ...(await importViaAi(file, defaults, userHint)), source: 'ai' }
  }
}
