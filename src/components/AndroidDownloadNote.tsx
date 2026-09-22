import { useEffect, useState } from 'react'

type ReleaseMeta = {
  versionName: string
  versionCode: number
  size: number
  sha256: string
  publishedAt: string
}

export function AndroidDownloadNote() {
  const [meta, setMeta] = useState<ReleaseMeta | null>(null)
  const [missing, setMissing] = useState(false)
  const wechat = typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent)
  useEffect(() => {
    const base = import.meta.env.BASE_URL || '/'
    fetch(`${base}kemiao-days-release.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('missing'))))
      .then((body: ReleaseMeta) => setMeta(body))
      .catch(() => setMissing(true))
  }, [])
  return (
    <aside className="android-note">
      <strong>Android 正式版</strong>
      {wechat ? <p>微信内置浏览器通常无法下载安装包。请用系统浏览器打开本页。</p> : null}
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
        <a href={`${import.meta.env.BASE_URL || '/'}kemiao-days.apk`}>下载 Android 安装包</a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL || '/'}android.html`}>安装说明</a>
      </p>
    </aside>
  )
}
