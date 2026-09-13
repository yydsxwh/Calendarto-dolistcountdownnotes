export type TimetableFileKind = 'image' | 'pdf' | 'sheet' | 'document' | 'unknown'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'heif'])
const PDF_EXT = new Set(['pdf'])
const SHEET_EXT = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'xltx', 'ods', 'csv', 'tsv'])
const DOC_EXT = new Set(['docx', 'doc', 'wps', 'odt', 'pptx', 'ppt', 'txt', 'md', 'html', 'htm'])

export function fileExtension(name: string): string {
  const base = name.replace(/^.*[/\\]/, '')
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function classifyTimetableFile(name: string, mime = ''): TimetableFileKind {
  const ext = fileExtension(name)
  const m = mime.toLowerCase()
  if (IMAGE_EXT.has(ext) || m.startsWith('image/')) return 'image'
  if (PDF_EXT.has(ext) || m === 'application/pdf') return 'pdf'
  if (SHEET_EXT.has(ext) || m.includes('spreadsheet') || m === 'text/csv') return 'sheet'
  if (DOC_EXT.has(ext) || m.includes('word') || m.includes('msword') || m.includes('opendocument.text')) {
    return 'document'
  }
  return 'unknown'
}

export const TIMETABLE_ACCEPT = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  '.xlsx,.xls,.xlsm,.xlsb,.xltx,.ods,.csv,.tsv,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,.gif,.heic,.pdf',
].join(',')
