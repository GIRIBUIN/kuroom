import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  publicDir: fileURLToPath(
    new URL('../data/releases', import.meta.url),
  ),
})