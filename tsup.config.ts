import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['yblocker.ts'],
  noExternal: ['mockttp', '@cliqz/adblocker', 'extract-domain', 'picocolors'],
  minify: 'terser',
  clean: true,

  async onSuccess() {
    fs.copyFileSync(
      path.resolve(__dirname, 'node_modules/vm2/lib/bridge.js'),
      path.resolve(__dirname, 'dist/bridge.js')
    )
    fs.copyFileSync(
      path.resolve(__dirname, 'node_modules/vm2/lib/setup-sandbox.js'),
      path.resolve(__dirname, 'dist/setup-sandbox.js')
    )
  },
})
