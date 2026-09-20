import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { DaysConfig } from './config'
import { randomToken, sha256Hex } from './crypto'
import { publicUser, type RishiSession } from './session'

export type HandoffRecord = {
  token: string
  user: ReturnType<typeof publicUser>
  exp: number
}

export async function issueHandoff(config: DaysConfig, session: RishiSession, token: string): Promise<string> {
  const code = randomToken(24)
  await mkdir(join(config.dataDir, 'handoff'), { recursive: true })
  const record: HandoffRecord = {
    token,
    user: publicUser(session),
    exp: Date.now() + 5 * 60 * 1000,
  }
  await writeFile(join(config.dataDir, 'handoff', `${sha256Hex(code)}.json`), JSON.stringify(record))
  return code
}

export async function consumeHandoff(config: DaysConfig, code: string): Promise<HandoffRecord | null> {
  if (!code) return null
  const file = join(config.dataDir, 'handoff', `${sha256Hex(code)}.json`)
  try {
    const record = JSON.parse(await readFile(file, 'utf8')) as HandoffRecord
    await rm(file, { force: true })
    if (!record.token || record.exp <= Date.now()) return null
    return record
  } catch {
    return null
  }
}
