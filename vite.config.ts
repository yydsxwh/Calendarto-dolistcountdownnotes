import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  test: {
    exclude: ['node_modules', 'dist', 'server/**', 'android/**'],
  },
  resolve: {
    alias: {
      '@yydsxwh/shared': path.resolve(__dirname, 'node_modules/@yydsxwh/shared/src'),
    },
  },
  // 开发/预览用根路径；生产构建挂到主站 /products/days/ 子路径，
  // 否则 index.html 会把 JS/CSS 指到 /assets/...（主站根路径）导致 404 白屏。
  // Android/iOS 壳用 --base=./ 覆盖，Electron 用相对路径，均不受影响。
  base: command === 'build' ? '/products/days/' : '/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 本地联调打日事 BFF。OCR 在 BFF 未接 platform 时会回落到主站识图。
      '/api/days': {
        target: process.env.DAYS_BFF_ORIGIN || 'http://127.0.0.1:3120',
        changeOrigin: true,
      },
    },
  },
}))
