import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    host: '127.0.0.1',
  },
  define: {
    'import.meta.env.VITE_ORATORIO_API_URL': JSON.stringify('http://127.0.0.1:5780/api/v1'),
    'import.meta.env.VITE_ORATORIO_SERVER_URL': JSON.stringify('http://127.0.0.1:5780'),
  },
})
