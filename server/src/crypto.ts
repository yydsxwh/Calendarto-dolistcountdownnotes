import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input
  return buf.toString('base64url')
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes))
}

export function signPayload(payload: unknown, secret: string): string {
  const body = base64url(JSON.stringify(payload))
  const mac = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyPayload<T>(token: string | undefined, secret: string): T | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [body, mac] = parts
  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const left = Buffer.from(mac)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T
  } catch {
    return null
  }
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48)
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function encryptionKeyBytes(secret: string): Buffer {
  const trimmed = secret.trim()
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, 'hex')
  return createHash('sha256').update(trimmed).digest()
}

export function encryptJson(value: unknown, secret: string): string {
  const key = encryptionKeyBytes(secret)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`
}

export function decryptJson<T>(payload: string, secret: string): T {
  const [ivPart, tagPart, dataPart] = payload.split('.')
  if (!ivPart || !tagPart || !dataPart) throw new Error('BAD_CIPHER')
  const key = encryptionKeyBytes(secret)
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'))
  const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}

export function secretHint(value: string | undefined): { configured: boolean; hint: string } {
  const raw = (value || '').trim()
  if (!raw) return { configured: false, hint: '' }
  return { configured: true, hint: raw.length <= 4 ? '••••' : `••••${raw.slice(-4)}` }
}
