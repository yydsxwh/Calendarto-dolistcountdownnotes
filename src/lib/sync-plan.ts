import type { SyncCheckpoint } from './cloud-sync'

/**
 * 决定一次对账该做什么。
 *
 * 抽成纯函数是有原因的：这段判断出过两次错——一次是把本机改动直接覆盖，
 * 一次是每次刷新都弹冲突确认框。规则本身值得被单独测试。
 */
export type SyncPlan =
  /** 本机就是第一份数据，直接上传。 */
  | { action: 'upload'; baseVersion: number }
  /** 采用云端数据覆盖本机。 */
  | { action: 'adopt' }
  /** 两边一致，什么都不用做。 */
  | { action: 'noop' }
  /** 真的分叉了，必须问用户。 */
  | { action: 'ask'; reason: 'first-link' | 'diverged' }

export interface ReconcileInput {
  accountUserId: string
  /** 服务端当前版本；0 表示这个账号还没有任何数据。 */
  remoteVersion: number
  /** 本机当前数据的快照。 */
  localSnapshot: string
  /** 本机是否为空（全部集合都没有条目）。 */
  localIsEmpty: boolean
  /** 本机记录的上一次同步位置，可能属于别的账号或已经过期。 */
  checkpoint: SyncCheckpoint | null
}

export function planReconcile(input: ReconcileInput): SyncPlan {
  const { accountUserId, remoteVersion, localSnapshot, localIsEmpty, checkpoint } = input

  const linkedBefore = checkpoint?.accountUserId === accountUserId
  // 只有当 checkpoint 描述的正是服务端当前版本时，它才代表「服务端有什么」。
  // 旧的 checkpoint 对服务端一无所知，不能用来跳过上传。
  const trusted = linkedBefore && checkpoint?.version === remoteVersion ? checkpoint : null

  if (remoteVersion === 0) return { action: 'upload', baseVersion: 0 }
  if (localIsEmpty) return { action: 'adopt' }

  if (trusted !== null) {
    // 云端还停在本机上次同步的位置，本机的改动才是新的。
    return trusted.snapshot === localSnapshot
      ? { action: 'noop' }
      : { action: 'upload', baseVersion: remoteVersion }
  }

  if (linkedBefore && checkpoint?.snapshot === localSnapshot) {
    // 别的设备写过，而本机自上次同步后没动过——直接接受云端。
    return { action: 'adopt' }
  }

  return { action: 'ask', reason: linkedBefore ? 'diverged' : 'first-link' }
}
