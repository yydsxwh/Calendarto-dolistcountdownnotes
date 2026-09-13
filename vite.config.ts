import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 独立预览用根路径。挂到主站时改为 /products/days/，或迁入 Andyyyds 包。
  base: '/',
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
})
