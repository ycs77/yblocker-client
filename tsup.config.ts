import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'tsup'
import dotenv from 'dotenv'
import { replace as EsbuildReplace } from 'esbuild-plugin-replace'
import { codeBlock } from 'common-tags'
import dayjs from 'dayjs'

function replaceEnvVars(envFilename: string) {
  const fullEnvFilename = path.resolve(__dirname, envFilename)

  if (!fs.existsSync(fullEnvFilename)) {
    throw new Error(`Missing ${envFilename}`)
  }

  const envContent = fs.readFileSync(fullEnvFilename, { encoding: 'utf-8' })
  const config = dotenv.parse(envContent)
  const output = {}

  for (const key of Object.keys(config)) {
    output[`process.env.${key}`] = JSON.stringify(config[key])
  }

  return output
}

export default defineConfig({
  entry: ['yblocker.ts'],
  minify: 'terser',
  clean: true,
  noExternal: ['axios', 'mockttp', '@cliqz/adblocker', 'extract-domain', 'psl', 'picocolors', 'dayjs'],
  esbuildPlugins: [
    EsbuildReplace(replaceEnvVars('.env.production')),
  ],

  banner: {
    js: codeBlock`
      /*!
       * yBlocker Client
       *
       * (build ${dayjs().format('YYYY-MM-DD')})
       */
    `,
  },

  async onSuccess() {
    fs.copyFileSync(
      path.resolve(__dirname, 'yblocker.ps1'),
      path.resolve(__dirname, 'dist/yblocker.ps1')
    )
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
