import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => {
  if (!['board', 'item', 'review'].includes(mode)) throw new Error(`Unknown MCP App entry '${mode}'.`)
  return {
    root: __dirname,
    base: './',
    plugins: [viteSingleFile()],
    build: {
      outDir: resolve(__dirname, '../../server/UiResources'),
      emptyOutDir: mode === 'board',
      rollupOptions: { input: resolve(__dirname, `${mode}.html`) }
    }
  }
})
