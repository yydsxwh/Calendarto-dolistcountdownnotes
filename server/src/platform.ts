import { createPlatformClient, type PlatformClient } from '@yydsxwh/shared/platform-client/index'
import type { DaysConfig } from './config'
import { platformConfigured } from './config'

/**
 * 视觉识别经常要 20–60 秒。平台客户端默认 15 秒会先断开，
 * 模型稍后仍返回 200，BFF 却已经把中断误报成「返回格式不合法」。
 * 必须长于平台 AI 超时（默认 60 秒），并短于 nginx OCR 的 120 秒。
 */
export const PLATFORM_CALL_TIMEOUT_MS = 100_000

export function createRishiPlatform(config: DaysConfig): PlatformClient | null {
  if (!platformConfigured(config)) return null
  return createPlatformClient({
    baseUrl: config.platformBaseUrl,
    serviceToken: config.platformServiceToken,
    clientId: config.platformClientId,
    timeoutMs: PLATFORM_CALL_TIMEOUT_MS,
  })
}

const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export function assertUploadAllowed(input: { mimeType: string; size: number; fileName: string }) {
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > MAX_UPLOAD_BYTES) {
    throw new Error('BAD_SIZE')
  }
  if (!ALLOWED_UPLOAD_MIME.has(input.mimeType)) {
    throw new Error('BAD_MIME')
  }
  if (!input.fileName.trim()) throw new Error('BAD_NAME')
}

export { createPlatformClient }
