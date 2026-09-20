/**
 * Minimal cookie reading/writing.
 *
 * Express 5 does not parse cookies, and every cookie 日事 sets is an opaque
 * server-side handle, so a signing/serialisation dependency would add nothing.
 */
import type { Request, Response } from 'express'

export interface CookieAttributes {
  httpOnly?: boolean
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  path?: string
  domain?: string | null
  maxAgeSeconds?: number
}

export function readCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {}
  if (!header) return jar
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const name = part.slice(0, index).trim()
    if (name.length === 0 || name in jar) continue
    try {
      jar[name] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      // A malformed cookie is simply not readable; ignore it.
    }
  }
  return jar
}

export function getCookie(req: Request, name: string): string | undefined {
  return readCookies(req.headers.cookie)[name]
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`]
  parts.push(`Path=${attributes.path ?? '/'}`)
  if (attributes.domain) parts.push(`Domain=${attributes.domain}`)
  if (attributes.maxAgeSeconds !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(attributes.maxAgeSeconds))}`)
    const expires = new Date(Date.now() + Math.max(0, attributes.maxAgeSeconds) * 1000)
    parts.push(`Expires=${expires.toUTCString()}`)
  }
  if (attributes.httpOnly !== false) parts.push('HttpOnly')
  if (attributes.secure) parts.push('Secure')
  parts.push(`SameSite=${capitalise(attributes.sameSite ?? 'lax')}`)
  return parts.join('; ')
}

export function setCookie(res: Response, name: string, value: string, attributes: CookieAttributes = {}): void {
  appendSetCookie(res, serializeCookie(name, value, attributes))
}

export function clearCookie(res: Response, name: string, attributes: CookieAttributes = {}): void {
  appendSetCookie(res, serializeCookie(name, '', { ...attributes, maxAgeSeconds: 0 }))
}

function appendSetCookie(res: Response, cookie: string): void {
  const existing = res.getHeader('Set-Cookie')
  if (existing === undefined) {
    res.setHeader('Set-Cookie', [cookie])
    return
  }
  const list = Array.isArray(existing) ? existing.map(String) : [String(existing)]
  res.setHeader('Set-Cookie', [...list, cookie])
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
