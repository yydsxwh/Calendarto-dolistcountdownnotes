import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // 开发/预览用根路径；生产构建挂到主站 /products/days/ 子路径，
  // 否则 index.html 会把 JS/CSS 指到 /assets/...（主站根路径）导致 404 白屏。
  // Android/iOS 壳用 --base=./ 覆盖，Electron 用相对路径，均不受影响。
  base: command === 'build' ? '/products/days/' : '/',
  server: {
    host: true,
    port: 5173,
    proxy: {
      // 本地开发把课表识图转到主站 MathCode 同一套视觉接口
      '/api/days': {
        target: 'https://www.yydsxwh.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
}))
