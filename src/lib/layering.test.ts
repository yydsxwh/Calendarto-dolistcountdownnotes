import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 课表星期标题遮挡底部导航是线上复现过的问题，靠人眼回归不住。
 * 这里把层级规则钉成断言：任何人再改 CSS，层级一旦倒挂就红。
 */
const root = path.resolve(__dirname, '..')
const indexCss = readFileSync(path.join(root, 'index.css'), 'utf8')
const timetablesCss = readFileSync(path.join(root, 'components/timetables.css'), 'utf8')

function tokenValue(name: string): number {
  const match = new RegExp(`--${name}:\\s*(\\d+)`).exec(indexCss)
  if (!match) throw new Error(`index.css 缺少层级令牌 --${name}`)
  return Number(match[1])
}

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)
  if (!match) throw new Error(`找不到 ${selector} 规则`)
  return match[1]
}

describe('层级规则', () => {
  it('四层顺序固定：内容 < 表格吸顶 < 顶栏底栏 < 弹层', () => {
    const content = tokenValue('z-content')
    const sticky = tokenValue('z-sticky-table')
    const appbar = tokenValue('z-appbar')
    const nav = tokenValue('z-bottom-nav')
    const overlay = tokenValue('z-overlay')
    expect(content).toBeLessThan(sticky)
    expect(sticky).toBeLessThan(appbar)
    expect(appbar).toBeLessThan(nav)
    expect(nav).toBeLessThan(overlay)
  })

  it('底部导航拿到底栏层级，并且是五列等宽单行', () => {
    const nav = block(indexCss, '.bottom-nav')
    expect(nav).toContain('z-index: var(--z-bottom-nav)')
    expect(nav).toContain('grid-template-columns: repeat(5, 1fr)')
    expect(nav).toContain('env(safe-area-inset-bottom)')
  })

  it('底部导航按钮触控面积不小于 44px 且不换行', () => {
    const button = block(indexCss, '.bottom-nav button')
    const minHeight = Number(/min-height:\s*(\d+)px/.exec(button)?.[1])
    const minWidth = Number(/min-width:\s*(\d+)px/.exec(button)?.[1])
    expect(minHeight).toBeGreaterThanOrEqual(44)
    expect(minWidth).toBeGreaterThanOrEqual(44)
    expect(button).toContain('white-space: nowrap')
  })

  it('星期吸顶标题只用表格层级，绝不越过底栏', () => {
    const head = block(indexCss, '.week-tt-head')
    expect(head).toContain('z-index: var(--z-sticky-table)')
    expect(tokenValue('z-sticky-table')).toBeLessThan(tokenValue('z-bottom-nav'))
    expect(timetablesCss).toContain('z-index:var(--z-sticky-table)')
    expect(timetablesCss).not.toMatch(/position:sticky;top:0;z-index:\d/)
  })

  it('课表滚动容器自成层叠上下文，内部 z-index 翻不出去', () => {
    const wrap = block(indexCss, '.tt-wrap')
    expect(wrap).toContain('isolation: isolate')
    expect(wrap).toContain('position: relative')
    expect(wrap).toContain('z-index: var(--z-content)')
  })

  it('页面底部留白至少等于底栏高度加安全区，最后一行不被挡', () => {
    const main = block(indexCss, '.main')
    expect(main).toContain('var(--bottom-nav-height)')
    expect(main).toContain('env(safe-area-inset-bottom)')
  })

  it('抽屉这类真模态允许高于底栏', () => {
    expect(block(indexCss, '.tt-drawer-root')).toContain('z-index: var(--z-overlay)')
  })
})
