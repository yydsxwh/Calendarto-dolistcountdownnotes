import { createPlatformClient, type PlatformClient } from '@yydsxwh/shared/platform-client/index'
import type { DaysConfig } from './config'
import { platformConfigured } from './config'

export function createRishiPlatform(config: DaysConfig): PlatformClient | null {
  if (!platformConfigured(config)) return null
  return createPlatformClient({
    baseUrl: config.platformBaseUrl,
    serviceToken: config.platformServiceToken,
    clientId: config.platformClientId,
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
