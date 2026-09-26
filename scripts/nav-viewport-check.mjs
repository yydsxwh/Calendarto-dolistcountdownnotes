/**
 * 课表星期标题遮挡底部导航的端到端回归。
 *
 * 单元测试只能守住 CSS 里的层级令牌，真正会不会盖住要在浏览器里量。
 * 这里在几个真实手机尺寸下滚动课表，读出 sticky 星期行和底栏的实际
 * 位置，断言两者不重叠、最后一行内容没有被挡、五个入口仍是单行。
 *
 *   node scripts/nav-viewport-check.mjs [baseUrl]
 *
 * 默认打线上 https://www.yydsxwh.com/products/days/，本地调试可传 http://127.0.0.1:5173/
 */

import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = (process.argv[2] || 'https://www.yydsxwh.com/products/days/').replace(/\/$/, '') + '/'
const SHOT_DIR = process.env.NAV_SHOT_DIR || '/tmp/nav-shots'
const CHROME = process.env.CHROME_PATH || '/usr/local/bin/google-chrome'

/** 覆盖常见小屏、主流大屏、三星 S25 Ultra 竖屏 WebView，以及放大字体与横屏 */
const VIEWPORTS = [
  { name: '360x780', width: 360, height: 780, dsf: 3, fontScale: 1 },
  { name: '412x915', width: 412, height: 915, dsf: 2.625, fontScale: 1 },
  { name: 's25-ultra-480x1067', width: 480, height: 1067, dsf: 3, fontScale: 1 },
  { name: '412x915-font130', width: 412, height: 915, dsf: 2.625, fontScale: 1.3 },
  { name: 'landscape-915x412', width: 915, height: 412, dsf: 2.625, fontScale: 1 },
]

const failures = []
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures.push(`${name} ${detail || ''}`.trim())
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
})
mkdirSync(SHOT_DIR, { recursive: true })

try {
  for (const vp of VIEWPORTS) {
    const page = await browser.newPage()
    await page.setViewport({
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    })
    if (vp.fontScale !== 1) {
      await page.evaluateOnNewDocument((scale) => {
        document.addEventListener('DOMContentLoaded', () => {
          document.documentElement.style.fontSize = `${16 * scale}px`
        })
      }, vp.fontScale)
    }

    // 先落在时间表的课表页，并塞一份课程，保证 sticky 星期行一定出现
    await page.goto(`${BASE}#timetable/week`, { waitUntil: 'networkidle2', timeout: 60_000 })
    await page.evaluate(() => {
      const key = 'kemiao-days-v1'
      const raw = localStorage.getItem(key)
      const data = raw ? JSON.parse(raw) : {}
      const now = Date.now()
      data.courses = Array.from({ length: 7 }, (_, i) => ({
        id: `probe-${i}`,
        name: `回归课程 ${i + 1}`,
        weekday: (i % 7) + 1,
        startTime: `${String(8 + i).padStart(2, '0')}:00`,
        endTime: `${String(9 + i).padStart(2, '0')}:40`,
        location: `教${i + 1}-${100 + i}`,
        color: '#2563eb',
        remindMinutes: 15,
        createdAt: now,
      }))
      localStorage.setItem(key, JSON.stringify(data))
    })
    await page.reload({ waitUntil: 'networkidle2', timeout: 60_000 })
    await page.waitForSelector('.bottom-nav', { timeout: 20_000 })

    // 滚到底，sticky 行和底栏最容易打架的位置
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await new Promise((r) => setTimeout(r, 400))

    const metrics = await page.evaluate(() => {
      const nav = document.querySelector('.bottom-nav')
      const head = document.querySelector('.week-tt-head')
      const main = document.querySelector('.main')
      const buttons = [...(nav?.querySelectorAll('button') ?? [])]
      const rect = (el) => {
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }
      }
      // .main 自己带底部留白，量它的盒子会把留白也算成「被挡」，
      // 真正要看的是最后一块实际内容有没有钻到底栏下面
      const lastContent = main?.querySelector(':scope > * > *:last-child') ?? main?.lastElementChild
      const desktopNav = document.querySelector('.tabs.desktop-nav')
      const navHidden = nav ? getComputedStyle(nav).display === 'none' : true
      return {
        nav: rect(nav),
        head: rect(head),
        main: rect(main),
        lastContent: rect(lastContent),
        navHidden,
        desktopNavVisible: desktopNav ? getComputedStyle(desktopNav).display !== 'none' : false,
        desktopNavTops: [...(desktopNav?.querySelectorAll('button') ?? [])].map((b) =>
          Math.round(b.getBoundingClientRect().top),
        ),
        mainPaddingBottom: main ? parseFloat(getComputedStyle(main).paddingBottom) : 0,
        navTops: buttons.map((b) => Math.round(b.getBoundingClientRect().top)),
        navSizes: buttons.map((b) => {
          const r = b.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        }),
        labels: buttons.map((b) => b.textContent?.replace(/\s+/g, '') ?? ''),
        navColumns: nav ? getComputedStyle(nav).gridTemplateColumns.split(' ').length : 0,
        bodyOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })

    const label = `[${vp.name}]`
    check(`${label} 标签是五项产品名`,
      metrics.labels.join('|').includes('我的一天') && metrics.labels.length === 5,
      metrics.labels.join('|'))
    check(`${label} 页面无横向滚动`, metrics.bodyOverflowX <= 1, `溢出=${metrics.bodyOverflowX}px`)

    if (metrics.navHidden) {
      // 宽屏（含手机横屏被判为宽屏时）走桌面标签栏，底栏按设计隐藏
      check(`${label} 宽屏改用桌面标签栏`, metrics.desktopNavVisible)
      check(`${label} 桌面标签栏单行`, new Set(metrics.desktopNavTops).size === 1,
        JSON.stringify(metrics.desktopNavTops))
      check(`${label} 星期标题不盖顶栏`, !metrics.head || metrics.head.top >= -0.5,
        `head.top=${metrics.head?.top?.toFixed(1)}`)
    } else {
      check(`${label} 五个入口单行`, metrics.navColumns === 5 && new Set(metrics.navTops).size === 1,
        `列数=${metrics.navColumns} 顶边=${JSON.stringify(metrics.navTops)}`)
      check(`${label} 触控面积 >= 44px`,
        metrics.navSizes.every((s) => s.h >= 44 && s.w >= 44),
        JSON.stringify(metrics.navSizes))

      if (metrics.head && metrics.nav) {
        // 核心断言：星期吸顶行的下边界不得进入底栏区域
        check(`${label} 星期标题不进入底栏`, metrics.head.bottom <= metrics.nav.top + 0.5,
          `head.bottom=${metrics.head.bottom.toFixed(1)} nav.top=${metrics.nav.top.toFixed(1)}`)
        // 整张表滚出屏幕时 head.bottom <= 0，那是被带走了，不算盖住顶栏
        check(`${label} 星期标题不盖顶栏`, metrics.head.bottom <= 0 || metrics.head.top >= -0.5,
          `head.top=${metrics.head.top.toFixed(1)} head.bottom=${metrics.head.bottom.toFixed(1)}`)
      } else {
        check(`${label} 课表星期行可见`, false, '没有渲染 .week-tt-head')
      }

      if (metrics.lastContent && metrics.nav) {
        check(`${label} 最后一块内容没被底栏挡`,
          metrics.lastContent.bottom <= metrics.nav.top + 0.5,
          `last.bottom=${metrics.lastContent.bottom.toFixed(1)} nav.top=${metrics.nav.top.toFixed(1)}`)
      }
      check(`${label} 底部留白不小于底栏高度`,
        metrics.mainPaddingBottom >= (metrics.nav?.height ?? 0),
        `padding=${metrics.mainPaddingBottom} navH=${metrics.nav?.height?.toFixed(1)}`)
    }

    await page.screenshot({ path: `${SHOT_DIR}/${vp.name}.png` })
    await page.close()
  }

  // 旧链接必须仍然落到合并后的新页面
  const legacy = [
    ['#todos', '我的一天'],
    ['#schedule', '时间表'],
    ['#exams', '时间表'],
    ['#selfschedule', '时间表'],
    ['#days', '日子'],
  ]
  const page = await browser.newPage()
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true })
  for (const [hash, expected] of legacy) {
    await page.goto(`${BASE}${hash}`, { waitUntil: 'networkidle2', timeout: 60_000 })
    await page.waitForSelector('.bottom-nav button.active', { timeout: 20_000 })
    const active = await page.$eval('.bottom-nav button.active', (el) => el.textContent?.replace(/\s+/g, '') ?? '')
    check(`旧链接 ${hash} → ${expected}`, active.includes(expected), `实际高亮=${active}`)
  }
  await page.close()
} finally {
  await browser.close()
}

console.log(failures.length ? `\n${failures.length} 项未通过` : '\n全部通过')
process.exit(failures.length ? 1 : 0)
