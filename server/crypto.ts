/**
 * Credential helpers for the 日事 BFF.
 *
 * Session tokens leave the process only inside a cookie or bearer header; the
 * database keeps their SHA-256 digest so a database leak cannot be replayed as
 * a live session. Account refresh tokens, when persisted at all, are sealed
 * with AES-256-GCM under a key derived from `RISHI_SESSION_SECRET`.
 */
import { createHash, createHmac, hkdfSync, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createCipheriv, createDecipheriv } from 'node:crypto'

const TOKEN_BYTES = 32
const KEY_BYTES = 32
const GCM_IV_BYTES = 12

export function newId(): string {
  return randomUUID()
}

/** URL-safe opaque secret used for session tokens and one-time handoff codes. */
export function randomToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

/** Lookup key for an opaque token. Never store the token itself. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Non-reversible fingerprint, used for coarse session-binding signals. */
export function fingerprint(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex').slice(0, 32)
}

export function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function deriveKey(secret: string, info: string): Buffer {
  const salt = createHash('sha256').update(`rishi:salt:${info}`, 'utf8').digest()
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), salt, Buffer.from(info, 'utf8'), KEY_BYTES))
}

export interface SealedSecret {
  ciphertext: string
  iv: string
  tag: string
}

/**
 * AES-256-GCM with a key derived from the session secret under a distinct HKDF
 * `info` label, so the encryption key is not the session secret itself.
 */
export function sealSecret(plaintext: string, secret: string): SealedSecret {
  const key = deriveKey(secret, 'rishi:token-encryption:v1')
  const iv = randomBytes(GCM_IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  }
}

/** Returns null when the payload was tampered with or the key rotated. */
export function openSecret(sealed: SealedSecret, secret: string): string | null {
  try {
    const key = deriveKey(secret, 'rishi:token-encryption:v1')
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, 'base64')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    return null
  }
}
