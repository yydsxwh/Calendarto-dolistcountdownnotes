/**
 * Structured logger with credential redaction.
 *
 * Authorization codes, access/refresh/ID tokens, cookies, client secrets and
 * the session secret must never reach a log sink, so every value passes through
 * `sanitize()` before it is serialised.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Record<string, unknown>

const REDACTED = '[redacted]'

const SENSITIVE_KEY = new RegExp(
  [
    'token',
    'secret',
    'password',
    'passwd',
    'authorization',
    'auth_header',
    'code_verifier',
    'code_challenge',
    'client_secret',
    'assertion',
    'credential',
    'jwt',
    'session_id',
    'handoff',
    // Anchored so a raw `cookie` header is caught but `sessionCookieName`,
    // which holds a cookie's name rather than its value, is not.
    '(^|_)cookies?$',
    '(^|_)code$',
    '(^|_)nonce$',
    '(^|_)state$',
  ].join('|'),
  'i',
)

/** Three base64url-ish segments separated by dots: a JWS/JWT. */
const JWT_SHAPE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/

const MAX_STRING_LENGTH = 256
const MAX_DEPTH = 4

function sanitizeString(value: string): string {
  if (JWT_SHAPE.test(value)) return REDACTED
  if (value.length <= MAX_STRING_LENGTH) return value
  return `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return sanitizeString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return { name: value.name, message: sanitizeString(value.message) }
  }
  if (depth >= MAX_DEPTH) return '[depth-limit]'
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1))
  }
  if (typeof value === 'object') {
    return sanitize(value as LogFields, depth + 1)
  }
  return '[unloggable]'
}

export function sanitize(fields: LogFields, depth = 0): LogFields {
  const output: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    // A credential is always a string (or wrapped in one). Letting booleans
    // and numbers through keeps feature flags and counters readable in the
    // startup banner instead of turning them into `[redacted]` noise.
    const suspicious = typeof value !== 'boolean' && typeof value !== 'number'
    output[key] = suspicious && SENSITIVE_KEY.test(key) ? REDACTED : sanitizeValue(value, depth)
  }
  return output
}

export interface Logger {
  debug(event: string, fields?: LogFields): void
  info(event: string, fields?: LogFields): void
  warn(event: string, fields?: LogFields): void
  error(event: string, fields?: LogFields): void
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export interface LoggerOptions {
  level?: LogLevel
  sink?: (line: string) => void
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const level = options.level ?? (process.env.RISHI_LOG_LEVEL as LogLevel | undefined) ?? 'info'
  const threshold = LEVEL_WEIGHT[level] ?? LEVEL_WEIGHT.info
  const sink = options.sink ?? ((line: string) => process.stdout.write(`${line}\n`))

  const emit = (entryLevel: LogLevel, event: string, fields?: LogFields) => {
    if (LEVEL_WEIGHT[entryLevel] < threshold) return
    const payload = {
      ts: new Date().toISOString(),
      level: entryLevel,
      event,
      ...(fields ? sanitize(fields) : {}),
    }
    sink(JSON.stringify(payload))
  }

  return {
    debug: (event, fields) => emit('debug', event, fields),
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  }
}

export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}
