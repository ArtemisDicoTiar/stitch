/** 게이지 맞추기, 휴대폰 크기(390×844). 가로로 밀리지 않고, 누를 곳이 스크롤 없이 엄지 닿는 자리에 있어야 합니다. */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { compareGauge } from '@stitch/engine'
import type { GaugeSize, Pattern } from '@stitch/pattern-ir'

const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE })

async function seed(request: APIRequestContext, sample: string): Promise<{ id: string; ir: Pattern }> {
  const { id } = (await (await request.post('/api/patterns', { data: { sample } })).json()) as { id: string }
  expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBe(true)
  const { pattern } = (await (await request.get(`/api/patterns/${id}`)).json()) as { pattern: { originalIr: Pattern } }
  return { id, ir: pattern.originalIr }
}

async function noSidewaysScroll(page: Page) {
  const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
  expect(scroll).toBeLessThanOrEqual(client)
}

/** 스크롤하지 않고도 화면 안에 다 보이는지 */
async function fullyOnScreen(page: Page, target: Locator) {
  await expect(target).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const box = (await target.boundingBox())!
  const { width, height } = page.viewportSize()!
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(height)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
}

test.describe('게이지 맞추기 (휴대폰)', () => {
  test('가로 스크롤이 없고, 숫자를 고치면 결과와 누를 곳이 스크롤 없이 보인다', async ({ page, request }) => {
    const { id, ir } = await seed(request, 'practice-hood')
    const base = ir.gauge!
    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByRole('heading', { level: 1, name: '내 게이지에 맞추기' })).toBeVisible()
    await noSidewaysScroll(page)

    // 두 선택지는 같은 크기의 단추 한 줄입니다.
    const measure = page.locator('label', { has: page.getByRole('radio', { name: /재서 맞/ }) })
    const skip = page.locator('label', { has: page.getByRole('radio', { name: /재지 않고/ }) })
    const [a, b] = [(await measure.boundingBox())!, (await skip.boundingBox())!]
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1)
    expect(a.height).toBeGreaterThanOrEqual(44)
    expect(b.height).toBeGreaterThanOrEqual(44)
    await expect(page.getByTestId('mode-hint')).toContainText('권해요')

    await fullyOnScreen(page, page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }))

    // 누르는 단추는 44px 이상입니다.
    for (const name of ['코 수 줄이기', '코 수 늘리기', '단 수 줄이기', '단 수 늘리기']) {
      const box = (await page.getByRole('button', { name }).boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
    }

    await page.getByRole('button', { name: '코 수 늘리기' }).click()
    await page.getByRole('button', { name: '코 수 늘리기' }).click()
    await page.getByRole('button', { name: '단 수 늘리기' }).click()
    const mine: GaugeSize = { stitches: base.stitches + 2, rows: base.rows + 1 }
    const cmp = compareGauge(base, mine)
    const verdict = page.getByTestId('verdict')
    await expect(verdict).toContainText(`코가 ${cmp.stitchPct}% 더 ${cmp.tighter ? '촘촘해요' : '느슨해요'}`)
    await fullyOnScreen(page, verdict)
    const primary = page.getByRole('button', { name: '이 코 수로 페이지 만들기' })
    await fullyOnScreen(page, primary)
    await fullyOnScreen(page, page.getByRole('button', { name: '재지 않고 도안 숫자 그대로 뜨기' }))
    expect((await primary.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await noSidewaysScroll(page)

    // 아래로 끝까지 내려도 단추 줄은 그대로 화면 아래에 붙어 있습니다.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await expect(primary).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('regauge-table')).toBeVisible()
    await noSidewaysScroll(page)

    await primary.click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`))
    const { pattern } = (await (await request.get(`/api/patterns/${id}`)).json()) as { pattern: { gaugeMode: string; myGauge: GaugeSize } }
    expect(pattern).toMatchObject({ gaugeMode: 'recalc', myGauge: mine })
  })

  test('아래 단추로 재지 않고 뜨기로 넘어가도 누를 곳이 스크롤 없이 보인다', async ({ page, request }) => {
    const { id } = await seed(request, 'practice-hood')
    await page.goto(`/patterns/${id}/gauge`)
    await page.getByRole('button', { name: '재지 않고 도안 숫자 그대로 뜨기' }).click()
    await expect(page.getByRole('radio', { name: /재지 않고/ })).toBeChecked()
    await expect(page.getByRole('heading', { name: '도안 숫자 그대로 페이지를 만들어요' })).toBeFocused()
    await fullyOnScreen(page, page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }))
    await noSidewaysScroll(page)
    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`))
  })

  test('360px 너비에서도 가로로 밀리지 않는다', async ({ page, request }) => {
    const { id, ir } = await seed(request, 'practice-hood')
    const scarf = await seed(request, 'garter-scarf')
    await page.setViewportSize({ width: 360, height: 740 })

    await page.goto(`/patterns/${id}/gauge`)
    await page.getByLabel('가로 10cm 안의 코 수').fill(String(ir.gauge!.stitches + 2.5))
    await page.getByLabel('세로 10cm 안의 단 수').fill(String(ir.gauge!.rows + 4))
    await expect(page.getByTestId('regauge-table')).toBeVisible()
    await noSidewaysScroll(page)
    await page.getByRole('radio', { name: /재지 않고/ }).check()
    await noSidewaysScroll(page)

    await page.goto(`/patterns/${scarf.id}/gauge`)
    await expect(page.getByRole('radio', { name: /재지 않고/ })).toBeChecked()
    await noSidewaysScroll(page)
    await fullyOnScreen(page, page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }))

    // 다시 들어왔을 때의 지금 상태 줄도 밀리지 않습니다.
    const mine = { stitches: ir.gauge!.stitches + 2, rows: ir.gauge!.rows + 4 }
    expect((await request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'recalc', gauge: mine } })).ok()).toBe(true)
    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByTestId('current-state')).toBeVisible()
    await noSidewaysScroll(page)
    await fullyOnScreen(page, page.getByRole('link', { name: '바꾸지 않고 작업 화면으로' }))
  })
})
