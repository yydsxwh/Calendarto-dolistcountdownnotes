import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadConfig } from './config'

test('production requires the public origin instead of embedding one', () => {
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', DAYS_SYNC_DATA_DIR: '/data', RISHI_SESSION_SECRET: 'x'.repeat(24) }),
    /RISHI_PUBLIC_ORIGIN/,
  )
  const config = loadConfig({
    NODE_ENV: 'production',
    DAYS_SYNC_DATA_DIR: '/data',
    RISHI_PUBLIC_ORIGIN: 'https://days.example',
    RISHI_SESSION_SECRET: 'x'.repeat(24),
  })
  assert.equal(config.wwwSessionUrl, 'https://days.example/api/auth/session')
  assert.equal(config.wwwOcrUrl, 'https://days.example/api/days/timetable-ocr')
  assert.equal(config.accountRedirectUri, 'https://days.example/api/days/auth/callback')
})
