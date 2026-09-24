/// <reference types="vite/client" />

declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar
    getLunar(): { getJieQi(): string }
    toYmd(): string
  }
  export class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar
    getSolar(): { toYmd(): string }
  }
}
