import fs from 'fs'
import path from 'path'
import axios from 'axios'
import * as mockttp from 'mockttp'
import type { CompletedRequest } from 'mockttp'
import { FiltersEngine, Request, parseFilters } from '@cliqz/adblocker'
import extractDomain from 'extract-domain'
import c from 'picocolors'
import userConfig from './config'
import { Store, Config } from './utils'

const config = <Required<Config>>{
  filterLists: [],
  pollingStepTime: 60 * 10, // 10分鐘
  https: {
    keyPath: './certs/testCA.key',
    certPath: './certs/testCA.pem',
  },
  ...userConfig,
}

let store: Store = {
  histories: [],
  pendingSendHistories: [],
}

if (fs.existsSync(path.resolve(__dirname, 'store.json'))) {
  store = getStore()
} else {
  setStore(store)
}

(async () => {
  const server = mockttp.getLocal({
    https: config.https,
  })

  const engine = await FiltersEngine.fromLists(fetch, config.filterLists)

  if (fs.existsSync(path.resolve(__dirname, 'filter.txt'))) {
    const list = fs.readFileSync(path.resolve(__dirname, 'filter.txt'), { encoding: 'utf-8' })
    const { networkFilters, cosmeticFilters } = parseFilters(list)
    engine.update({
      newNetworkFilters: networkFilters,
      newCosmeticFilters: cosmeticFilters,
    })
  }

  const requests = new Map<string, CompletedRequest>()

  server.forAnyRequest()
    .thenPassThrough({
      beforeRequest(req) {
        const hostname = new URL(req.url).hostname

        const { match: blocked } = engine.match(Request.fromRawDetails({
          url: req.url,
          hostname: hostname,
          domain: extractDomain(hostname, { tld: true }),
        }))

        if (blocked) {
          console.log(`${c.bgRed(' BLOCK ')}\t${req.headers.host}`)
          return { response: 'close' }
        }

        requests.set(req.id, req)
      },
      async beforeResponse(res) {
        const req = requests.get(res.id)
        requests.delete(res.id)

        if (!req) return

        const hostname = new URL(req.url).hostname

        if (res.headers['content-type']?.startsWith('text/html')) {
          let body = await res.body.getText()

          if (!body) return
          if (!(/(<!DOCTYPE html>|<html ?>?)/i.test(body))) return

          const { styles, scripts } = engine.getCosmeticsFilters({
            url: req.url,
            hostname: hostname,
            domain: extractDomain(hostname, { tld: true }),
          })

          store.histories.push({
            url: req.url.slice(0, 255),
            hostname: hostname.slice(0, 255),
            created_at: new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, ''),
          })
          setStore(store)

          console.log(`${c.bgGreen(' PASS  ')}\t${req.headers.host}`)

          if (body && scripts)
            body = body.replace('</head>', `<script>${scripts}</script></head>`)
          if (body && styles)
            body = body.replace('</head>', `<style>${styles}</style></head>`)

          return { body }
        }
      },
    })

  await server.start(8080)

  console.log(c.green(`Server running on port ${server.port}`))

  pollingSendStoreData()
})()

function getStore() {
  const store: Store = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, 'store.json'), {
      encoding: 'utf-8',
    })
  )

  return store
}

function setStore(store: Store) {
  const data = process.env.NODE_ENV === 'development'
    ? JSON.stringify(store, null, 2)
    : JSON.stringify(store)

  fs.writeFileSync(path.resolve(__dirname, 'store.json'), data, {
    encoding: 'utf-8',
  })
}

function pollingSendStoreData() {
  const intervalTime = 1000 * config.pollingStepTime

  setInterval(() => {
    store.pendingSendHistories = [
      ...store.pendingSendHistories,
      ...store.histories,
    ]
    store.histories = []
    setStore(store)

    send()

    let i = 0
    let max = 3
    function send() {
      let endpoint = process.env.YBLOCKER_SERVER_URL
      if (endpoint && /^https?:\/\/localhost/.test(endpoint)) {
        endpoint = endpoint.replace('localhost', '127.0.0.1')
      }

      axios.post(`${endpoint}/api/histories`, {
        histories: store.pendingSendHistories,
      }, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.YBLOCKER_TOKEN}`,
        },
      }).then(({ data }) => {
        store.pendingSendHistories = []
        setStore(store)
        console.log(`${c.bgMagenta(' SEND  ')}\t${new Date().toLocaleString()}  |  ${data.message}`)
      }).catch(err => {
        i++
        if (i < max)
          send()

        if (err.response) {
          console.error(`fetch error: [${err.response.status}]`, err.response.data)
        } else if (err.request) {
          console.error(`fetch error:`, err.request)
        }
        console.error('fetch error:', err.message)
      })
    }
  }, intervalTime)
}
