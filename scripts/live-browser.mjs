// 배포 주소를 실제 브라우저로 따라갑니다: 랜딩 → 올리기 → 예시 도안 → 확인 → 게이지 → 작업 화면 → 내 도안 → 요금제 → 마네킹.
// 사용: node scripts/live-browser.mjs <base-url> <캡처 폴더> <대바늘 연습 PDF>
// PDF 읽기가 켜져 있어야 하고, 실제 변환을 한 번 하므로 LLM 비용이 듭니다.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
// Playwright는 apps/web의 의존성입니다.
const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium, expect } = require('@playwright/test')

const BASE = process.argv[2]
const OUT = process.argv[3]
const PDF = process.argv[4]
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ko-KR', baseURL: BASE })
const page = await ctx.newPage()
const problems = []
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 300)) })
page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`) })

let failed = 0
async function step(name, fn) {
  const t = Date.now()
  try {
    await fn()
    console.log(`PASS  ${name}  (${Date.now() - t}ms)`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${name}\n      ${String(e.message).split('\n').slice(0, 6).join('\n      ')}`)
    await page.screenshot({ path: `${OUT}/fail-${failed}.png` }).catch(() => {})
  }
}
const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png` })

let id
await step('랜딩이 열리고 올리기 버튼이 /upload 로 간다', async () => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await shot('1-landing')
  await page.getByRole('link', { name: /PDF 도안 올리기/ }).first().click()
  await expect(page).toHaveURL(/\/upload$/)
})

await step('머리띠에 새 이름과 얼굴 표시, 첫 화면에 마스코트가 있다', async () => {
  await page.goto('/')
  await expect(page).toHaveTitle(/^Stitch · /)
  await expect(page.locator('header a').first()).toContainText('Stitch')
  await expect(page.locator('header a svg').first()).toBeVisible()
  await expect(page.getByRole('img', { name: /실뭉치를 껴안고 있는 Stitch 캐릭터/ })).toBeVisible()
  await page.goto('/upload')
})

let uploadedId
await step('올리기 화면: PDF 읽기가 켜져 있고 파일을 고를 수 있다', async () => {
  await expect(page.getByTestId('no-key-notice')).toHaveCount(0)
  await expect(page.locator('#pattern-pdf')).toBeEnabled()
  await shot('2-upload')
})

await step('PDF를 올리면 읽는 중 화면을 거쳐 확인 화면에 닿는다 (실제 변환)', async () => {
  const t = Date.now()
  await page.locator('#pattern-pdf').setInputFiles(PDF)
  await page.waitForURL(/\/patterns\/[^/]+\/(reading|review)$/, { timeout: 30_000 })
  const seen = new Set()
  const watch = setInterval(async () => {
    const now = await page.getByTestId('reading-now').textContent().catch(() => null)
    if (now) seen.add(now.trim())
  }, 2000)
  await page.waitForTimeout(6000)
  await shot('2b-reading')
  try {
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/, { timeout: 300_000 })
  } finally {
    clearInterval(watch)
  }
  uploadedId = /\/patterns\/([^/]+)\/review$/.exec(page.url())[1]
  console.log(`      변환 ${((Date.now() - t) / 1000).toFixed(0)}초, 읽는 중 화면의 문구: ${[...seen].join(' / ')}`)
  await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
  await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
  await expect(page.getByText('3개 구간 · 93단')).toBeVisible()
  // 원문 패널: 글 위치를 꺼냈으면 이 안내가 없어야 합니다.
  await expect(page.getByText('글의 위치를 꺼내지 못했어요')).toHaveCount(0)
  await shot('2c-review-uploaded')
  const job = (await (await ctx.request.get(`/api/patterns/${uploadedId}/job`)).json()).job
  console.log('      job:', JSON.stringify({ status: job.status, llmCalls: job.llmCalls, feedbackRounds: job.feedbackRounds, ok: job.verification?.ok, usage: job.usage }))
})

await step('올린 도안을 지우고 올리기 화면으로 돌아간다', async () => {
  if (!uploadedId) throw new Error('올린 도안이 없습니다')
  const r = await ctx.request.delete(`/api/patterns/${uploadedId}`)
  if (!r.ok()) throw new Error('delete ' + r.status())
  await page.goto('/upload')
})

await step('예시 도안으로 시작하면 확인 화면으로 간다', async () => {
  await page.getByRole('button', { name: '예시 도안으로 둘러보기' }).click()
  await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/, { timeout: 30_000 })
  id = /\/patterns\/([^/]+)\/review$/.exec(page.url())[1]
  await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
  await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
  await shot('3-review')
})

await step('확인 완료 → 게이지 화면 → 도안 숫자 그대로', async () => {
  await page.getByRole('button', { name: /확인 완료/ }).click()
  await expect(page).toHaveURL(new RegExp(`/patterns/${id}/gauge$`), { timeout: 20_000 })
  await expect(page.getByRole('heading', { level: 1, name: '내 게이지에 맞추기' })).toBeVisible()
  await shot('4-gauge')
  await page.getByRole('radio', { name: /재지 않고/ }).check()
  await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
  await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`), { timeout: 20_000 })
})

await step('작업 화면: 3D와 기호 도안이 그려진다', async () => {
  await expect(page.getByRole('heading', { level: 1, name: '연습용 후드 워머' })).toBeVisible()
  await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 40_000 })
  await expect(page.locator('#panel-chart .sc-base svg')).toBeVisible()
  await page.waitForTimeout(1200)
  await shot('5-workspace')
})

await step('기록: 단을 두 번 올리면 도안과 3D가 같이 나아가고 서버에 남는다', async () => {
  const badge = page.getByTestId('progress-badge')
  await expect(badge).toHaveAttribute('data-row', '1')
  const rowUp = page.getByRole('button', { name: '단 올리기', exact: true })
  await rowUp.click()
  await rowUp.click()
  await expect(badge).toHaveAttribute('data-row', '3')
  await expect(page.locator('#panel-chart [data-chart]')).toHaveAttribute('data-row', '3')
  await expect(page.locator('[data-viewer3d]')).toHaveAttribute('data-row', '3')
  await expect.poll(async () => (await (await ctx.request.get(`/api/patterns/${id}/progress`)).json()).entries.map((e) => e.row), { timeout: 15_000 }).toEqual([2, 3])
})

await step('단수링을 달면 도안에 보이고 서버에 남는다', async () => {
  const rings = page.getByRole('region', { name: '단수링' })
  await rings.getByRole('textbox', { name: '새 단수링 이름' }).fill('오늘은 여기까지')
  await rings.getByRole('button', { name: '단수링 달기' }).click()
  await expect(rings).toContainText('1개')
  await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
  await expect.poll(async () => (await (await ctx.request.get(`/api/patterns/${id}/rings`)).json()).rings.map((r) => r.name), { timeout: 15_000 }).toEqual(['오늘은 여기까지'])
})

await step('새로 열어도 기록과 단수링이 그대로다', async () => {
  await page.reload()
  await expect(page.getByTestId('progress-badge')).toHaveAttribute('data-row', '3')
  await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
  await page.waitForTimeout(1200)
  await shot('6-workspace-after')
})

await step('내 도안에 진행률과 함께 보인다', async () => {
  await page.goto('/library')
  const card = page.getByRole('listitem').filter({ hasText: '연습용 후드 워머' }).first()
  await expect(card).toContainText('대바늘')
  await expect(card.getByRole('link').first()).toHaveAttribute('href', `/patterns/${id}`)
  await shot('7-library')
})

await step('요금제 화면이 열린다', async () => {
  await page.goto('/pricing')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await shot('8-pricing')
})

await step('마네킹 화면이 열리고 3D가 그려진다', async () => {
  await page.goto('/mannequin')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await shot('9-mannequin')
})

await step('휴대폰 너비에서 작업 화면에 가로 스크롤이 없다', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/patterns/${id}`)
  await expect(page.getByRole('heading', { level: 1, name: '연습용 후드 워머' })).toBeVisible()
  await page.waitForTimeout(1500)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  if (overflow > 1) throw new Error(`가로로 ${overflow}px 넘칩니다`)
  await shot('10-workspace-phone')
})

await step('치우기: 도안을 지우면 내 도안이 비어 있다', async () => {
  const r = await ctx.request.delete(`/api/patterns/${id}`)
  if (!r.ok()) throw new Error('delete ' + r.status())
  const list = await (await ctx.request.get('/api/patterns')).json()
  if (list.patterns.length !== 0) throw new Error('남은 도안 ' + list.patterns.length)
})

await browser.close()
console.log('\n브라우저가 본 문제:', problems.length ? '\n  ' + [...new Set(problems)].join('\n  ') : '없음')
console.log(failed ? `\n${failed} step(s) failed` : '\nall steps passed')
process.exit(failed ? 1 : 0)
