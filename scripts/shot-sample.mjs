// 예시 도안의 작업 화면과 3D를 찍습니다. 3D 모양은 눈으로 봐야 알 수 있습니다.
// 사용: node scripts/shot-sample.mjs <주소> <폴더> <예시 이름> [단] [코]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')
const [BASE, OUT, SAMPLE, ROW = '9999', STITCH = '9999'] = process.argv.slice(2)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ko-KR', baseURL: BASE })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)) })
const { id } = await (await ctx.request.post('/api/patterns', { data: { sample: SAMPLE } })).json()
try {
  await ctx.request.post(`/api/patterns/${id}/confirm`)
  await ctx.request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'as_is' } })
  await ctx.request.post(`/api/patterns/${id}/progress`, { data: { row: Number(ROW), stitch: Number(STITCH) } })
  await page.goto(`/patterns/${id}`)
  await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 40_000 })
  await page.waitForTimeout(1500)
  await page.locator('[data-stage="3d"]').screenshot({ path: `${OUT}/${SAMPLE}-3d.png` })
  await page.screenshot({ path: `${OUT}/${SAMPLE}-page.png`, fullPage: true })
} finally {
  await ctx.request.delete(`/api/patterns/${id}`)
  await browser.close()
}
console.log('문제:', problems.length ? problems.join('\n  ') : '없음')
