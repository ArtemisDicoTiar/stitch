// SVG 파일을 PNG로 찍습니다. 사용: node scripts/svg2png.mjs <in.svg> <out.png> [배율]
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test')
const [inp, out, scale = '2'] = process.argv.slice(2)
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: Number(scale) })
await page.setContent(`<body style="margin:12px;background:#fff">${readFileSync(inp, 'utf8')}</body>`)
await (await page.$('svg')).screenshot({ path: out })
await browser.close()
