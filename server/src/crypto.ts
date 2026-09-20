import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

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
