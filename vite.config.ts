import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // Web 生产构建仍挂在主站 /products/days/；Android/iOS 壳用 --base=./ 覆盖。
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
      // 统一账号登录与跨设备同步走本机日事 BFF（npm run dev:server）。
      ...Object.fromEntries(
        ['/api/auth', '/api/sync', '/api/todos', '/api/health'].map((path) => [
          path,
          { target: 'http://127.0.0.1:3100', changeOrigin: false, secure: false },
        ]),
      ),
    },
  },
}))
