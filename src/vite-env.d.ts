/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DAYS_API_ORIGIN?: string
  readonly VITE_ACCOUNT_URL?: string
  readonly VITE_SITE_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    getLunar(): { getJieQi(): string; getMonthInChinese(): string; getDayInChinese(): string }
    toYmd(): string
  }
  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar
    getSolar(): { toYmd(): string }
  }
}
