import fs from 'fs'
import path from 'path'
import * as mockttp from 'mockttp'
import { FiltersEngine, Request, parseFilters } from '@cliqz/adblocker'
import extractDomain from 'extract-domain'
import c from 'picocolors'

(async () => {
  const server = mockttp.getLocal({
    https: {
      keyPath: './certs/testCA.key',
      certPath: './certs/testCA.pem',
    },
  })

  const engine = await FiltersEngine.fromLists(fetch, [
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_2_Base/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_3_Spyware/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_4_Social/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_10_Useful/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_224_Chinese/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_1_Russian/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_6_German/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_16_French/filter.txt',
    'https://raw.githubusercontent.com/AdguardTeam/FiltersRegistry/master/filters/filter_7_Japanese/filter.txt',
  ])

  if (fs.existsSync(path.resolve(__dirname, 'filter.txt'))) {
    const list = fs.readFileSync(path.resolve(__dirname, 'filter.txt'), { encoding: 'utf-8' })
    const { networkFilters, cosmeticFilters } = parseFilters(list)
    engine.update({
      newNetworkFilters: networkFilters,
      newCosmeticFilters: cosmeticFilters,
    })
  }

  let injection: {
    styles?: string
    scripts?: string[]
  } = {}

  server.forAnyRequest()
    .thenPassThrough({
      beforeRequest(req) {
        const { match } = engine.match(Request.fromRawDetails({
          url: req.url,
        }))

        if (match) {
          console.log(`${c.bgRed(' BLOCK ')}\t${req.headers.host}`)
          return { response: 'close' }
        } else {
          const { styles, scripts } = engine.getCosmeticsFilters({
            url: req.url,
            hostname: new URL(req.url).hostname,
            domain: extractDomain(new URL(req.url).hostname, { tld: true }),
          })

          injection.styles = styles || undefined
          injection.scripts = scripts || undefined

          console.log(`${c.bgGreen(' PASS ')}\t${req.headers.host}`)
        }
      },
      async beforeResponse(res) {
        if (res.headers['content-type']?.startsWith('text/html')) {
          let body = await res.body.getText()

          if (body && injection.scripts)
            body = body.replace('</head>', `<script>${injection.scripts}</script></head>`)
          if (body && injection.styles)
            body = body.replace('</head>', `<style>${injection.styles}</style></head>`)

          return { body }
        }
      },
    })

  await server.start(8080)

  console.log(c.green(`Server running on port ${server.port}`))
})()