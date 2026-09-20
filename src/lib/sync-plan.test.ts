/**
 * Reconcile rules. This logic has been wrong twice — once silently
 * overwriting local edits, once asking "overwrite local or cloud?" on every
 * reload of a device that had just synced — so each branch is pinned here.
 */
import { describe, expect, test } from 'vitest'
import { planReconcile } from './sync-plan'
import type { SyncCheckpoint } from './cloud-sync'

const ACCOUNT = 'usr_VJQ4V0D7H5W0JYKEGSR7VQ670V'
const LOCAL = '{"todos":[{"id":"a","title":"期末复习"}]}'
const OTHER = '{"todos":[{"id":"b","title":"买书"}]}'

function checkpoint(overrides: Partial<SyncCheckpoint> = {}): SyncCheckpoint {
  return { accountUserId: ACCOUNT, version: 4, snapshot: LOCAL, ...overrides }
}

function plan(overrides: Partial<Parameters<typeof planReconcile>[0]> = {}) {
  return planReconcile({
    accountUserId: ACCOUNT,
    remoteVersion: 4,
    localSnapshot: LOCAL,
    localIsEmpty: false,
    checkpoint: null,
    ...overrides,
  })
}

describe('empty account', () => {
  test('uploads the local document as the first version', () => {
    expect(plan({ remoteVersion: 0, checkpoint: null })).toEqual({ action: 'upload', baseVersion: 0 })
  })

  test('uploads even when a stale checkpoint matches the local snapshot', () => {
    // The bug: a checkpoint left over from an earlier server state made the
    // first upload look unnecessary, so nothing was ever sent.
    expect(
      plan({ remoteVersion: 0, checkpoint: checkpoint({ version: 9, snapshot: LOCAL }) }),
    ).toEqual({ action: 'upload', baseVersion: 0 })
  })
})

describe('empty device', () => {
  test('takes the cloud document without asking', () => {
    expect(plan({ localIsEmpty: true })).toEqual({ action: 'adopt' })
  })

  test('takes the cloud document even with no checkpoint', () => {
    expect(plan({ localIsEmpty: true, checkpoint: null })).toEqual({ action: 'adopt' })
  })
})

describe('device already in step with the cloud', () => {
  test('does nothing when neither side moved', () => {
    expect(plan({ checkpoint: checkpoint() })).toEqual({ action: 'noop' })
  })

  test('uploads local edits made since the last sync', () => {
    expect(plan({ localSnapshot: OTHER, checkpoint: checkpoint() })).toEqual({
      action: 'upload',
      baseVersion: 4,
    })
  })

  test('a reload right after syncing never prompts', () => {
    // The regression this pins: same device, same data, nothing changed.
    expect(plan({ checkpoint: checkpoint() }).action).not.toBe('ask')
  })
})

describe('another device moved the cloud forward', () => {
  test('accepts the cloud when this device made no edits', () => {
    expect(plan({ remoteVersion: 7, checkpoint: checkpoint({ version: 4, snapshot: LOCAL }) })).toEqual({
      action: 'adopt',
    })
  })

  test('asks when both sides changed', () => {
    expect(
      plan({ remoteVersion: 7, localSnapshot: OTHER, checkpoint: checkpoint({ version: 4 }) }),
    ).toEqual({ action: 'ask', reason: 'diverged' })
  })
})

describe('first time this device links to a populated account', () => {
  test('asks rather than silently picking a winner', () => {
    expect(plan({ checkpoint: null })).toEqual({ action: 'ask', reason: 'first-link' })
  })

  test("another account's checkpoint does not count as having linked", () => {
    expect(plan({ checkpoint: checkpoint({ accountUserId: 'usr_SOMEONE_ELSE' }) })).toEqual({
      action: 'ask',
      reason: 'first-link',
    })
  })

  test("another account's checkpoint never authorises a silent adopt", () => {
    expect(
      plan({ checkpoint: checkpoint({ accountUserId: 'usr_SOMEONE_ELSE', snapshot: LOCAL }) }).action,
    ).toBe('ask')
  })
})
