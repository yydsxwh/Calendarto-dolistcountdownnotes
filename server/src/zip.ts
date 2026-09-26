import { inflateRawSync } from 'node:zlib'

/**
 * 只读 ZIP 解包，够用来拆 DOCX / XLSX。
 *
 * BFF 一直只依赖 Node 内置模块（systemd 上没有 node_modules），
 * 为了读 Word 正文再引一个 npm 包不划算，所以自己读中央目录。
 * 只支持 store(0) 与 deflate(8)，DOCX 不会用别的压缩方法。
 */

export type ZipEntry = { name: string; data: Buffer }

const EOCD_SIG = 0x06054b50
const CD_SIG = 0x02014b50
const LFH_SIG = 0x04034b50

export function readZip(buffer: Buffer, maxEntries = 512): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  const eocd = findEocd(buffer)
  if (eocd < 0) throw new Error('NOT_A_ZIP')
  const entryCount = Math.min(buffer.readUInt16LE(eocd + 10), maxEntries)
  let offset = buffer.readUInt32LE(eocd + 16)

  for (let i = 0; i < entryCount; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CD_SIG) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)
    offset += 46 + nameLength + extraLength + commentLength

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LFH_SIG) continue
    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(start, start + compressedSize)
    try {
      out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw))
    } catch {
      // 单个条目坏掉不该让整份文档读不出来
      continue
    }
  }
  return out
}

function findEocd(buffer: Buffer): number {
  const min = Math.max(0, buffer.length - 66_000)
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}
