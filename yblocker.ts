import fs from 'fs'
import path from 'path'
import axios from 'axios'
import * as mockttp from 'mockttp'
import type { CompletedRequest } from 'mockttp'
import { FiltersEngine, Request, NetworkFilter, CosmeticFilter, parseFilters } from '@cliqz/adblocker'
import extractDomain from 'extract-domain'
import c from 'picocolors'
import dayjs from 'dayjs'
import userConfig from './config'
import { Store, Config } from './utils'

const config = <Required<Config>>{
  filterLists: [],
  pollingStepTime: 60 * 10, // 10分鐘
  https: {
    keyPath: path.resolve(__dirname, 'certs/testCA.key'),
    certPath: path.resolve(__dirname, 'certs/testCA.pem'),
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

let networkFilters: NetworkFilter[] | null = null
let cosmeticFilters: CosmeticFilter[] | null = null

;(async () => {
  const server = mockttp.getLocal({
    https: config.https,
  })

  const engine = await FiltersEngine.fromLists(fetch, config.filterLists)

  loadCustomFilter(engine)

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

          const title = body.match(/<title>(.*)<\/title>/)?.[1] ?? ''

          const { styles, scripts } = engine.getCosmeticsFilters({
            url: req.url,
            hostname: hostname,
            domain: extractDomain(hostname, { tld: true }),
          })

          store.histories.push({
            url: req.url.slice(0, 255),
            hostname: hostname.slice(0, 255),
            title: title.slice(0, 255),
            created_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
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

  pollingSendStoreData(engine)
})()

function addFiltersFromText(engine: FiltersEngine, text: string) {
  if (networkFilters !== null && cosmeticFilters !== null) {
    engine.update({
      removedNetworkFilters: networkFilters.map(filter => filter.getId()),
      removedCosmeticFilters: cosmeticFilters.map(filter => filter.getId()),
    })
  }

  const parsed = parseFilters(text)
  engine.update({
    newNetworkFilters: networkFilters = parsed.networkFilters,
    newCosmeticFilters: cosmeticFilters = parsed.cosmeticFilters,
  })
}

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

function setCustomFilter(filter: string) {
  fs.writeFileSync(path.resolve(__dirname, 'filter.txt'), filter, {
    encoding: 'utf-8',
  })
}

function loadCustomFilter(engine: FiltersEngine) {
  if (!fs.existsSync(path.resolve(__dirname, 'filter.txt'))) {
    setCustomFilter('')
  }

  const filter = fs.readFileSync(path.resolve(__dirname, 'filter.txt'), {
    encoding: 'utf-8',
  })
  addFiltersFromText(engine, filter)
}

function pollingSendStoreData(engine: FiltersEngine) {
  const intervalTime = 1000 * config.pollingStepTime

  let i = 0
  let max = 3

  function startSendData() {
    store.pendingSendHistories = [
      ...store.pendingSendHistories,
      ...store.histories,
    ]
    store.histories = []
    setStore(store)

    send()

    i = 0

    function send() {
      let endpoint = process.env.YBLOCKER_SERVER_URL
      if (endpoint && /^https?:\/\/localhost/.test(endpoint)) {
        endpoint = endpoint.replace('localhost', '127.0.0.1')
      }

      axios.post(`${endpoint}/api/send`, {
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

        setCustomFilter(data.blacklist)
        loadCustomFilter(engine)

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
  }

  startSendData()
  setInterval(startSendData, intervalTime)
}
