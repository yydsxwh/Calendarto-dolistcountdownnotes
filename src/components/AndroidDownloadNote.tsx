import { useEffect, useState } from 'react'

type ReleaseMeta = {
  versionName: string
  versionCode: number
  size: number
  sha256: string
  publishedAt: string
  file?: string
}

const ORIGIN = 'https://www.yydsxwh.com'

export function AndroidDownloadNote() {
  const [meta, setMeta] = useState<ReleaseMeta | null>(null)
  const [missing, setMissing] = useState(false)
  const [copied, setCopied] = useState(false)
  const agent = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const wechat = /MicroMessenger/i.test(agent)
  const sogou = /Sogou|MetaSr|SogouMSE/i.test(agent)
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}kemiao-days-release.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('missing'))))
      .then((body: ReleaseMeta) => setMeta(body))
      .catch(() => setMissing(true))
  }, [])
  const file = meta?.file && /^kemiao-days-\d+\.\d+\.\d+\.apk$/.test(meta.file) ? meta.file : 'kemiao-days.apk'
  const href = `${ORIGIN}/products/days/${file}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <aside className="android-note">
      <strong>Android 正式版</strong>
      {wechat ? <p>微信内置浏览器通常无法下载安装包。请点右上角，用系统浏览器打开本页。</p> : null}
      {sogou ? <p>搜狗浏览器如果第一次下载失败，请改用 Chrome、Samsung Internet 或系统浏览器。下面的「重新下载」只会再打开同一次地址，不会自动重试。</p> : null}
      {meta ? (
        <p>
          版本 {meta.versionName}（{meta.versionCode}） · {Math.round(meta.size / 1024)} KB · {meta.publishedAt}
          <br />
          SHA-256 <code>{meta.sha256}</code>
        </p>
      ) : missing ? (
        <p>Android 新版迁移中。请先同步或导出，再安装正式版。</p>
      ) : (
        <p>正在读取版本信息…</p>
      )}
      <p>
        早期测试版需要先确认同步或导出备份，再卸载，然后安装正式签名版并登录同一账号核对。之后的正式版可以直接覆盖升级。
        若系统询问，请允许浏览器安装未知应用。
      </p>
      <p>
        <a href={href}>下载 Android 安装包</a>
        {' · '}
        <a href={href}>重新下载</a>
        {' · '}
        <button className="btn tiny" type="button" onClick={copy}>{copied ? '已复制下载地址' : '复制下载地址'}</button>
        {' · '}
        <a href={`${import.meta.env.BASE_URL || '/'}android.html`}>安装说明</a>
      </p>
    </aside>
  )
}
