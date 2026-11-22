import { expect, test, type Page } from '@playwright/test'

// 휴대폰 화면(390×844)에서 봅니다. 어느 프로젝트로 돌려도 같은 크기입니다.
test.use({
  viewport: { width: 390, height: 844 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
})

// 개발 서버가 화면 구석에 띄우는 표시가 그 자리의 단추를 가리지 않게 합니다.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'nextjs-portal{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })
})

/** 이 테스트가 만든 도안. 끝나면 지웁니다. */
const made: string[] = []
test.afterEach(async ({ request }) => {
  for (const id of made.splice(0)) await request.delete(`/api/patterns/${id}`)
})

async function noSideScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
  expect(scroll, '가로 스크롤이 생기지 않아야 합니다').toBeLessThanOrEqual(inner)
}

/** 요소 전체가 지금 화면 안에 보이는지 (스크롤하지 않고) */
async function inViewport(page: Page, name: string) {
  const el = page.getByRole('button', { name, exact: true })
  await expect(el).toBeVisible()
  const box = await el.boundingBox()
  const size = page.viewportSize()
  if (!box || !size) throw new Error(`${name} 단추의 자리를 읽지 못했습니다`)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height)
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width)
  expect(box.height).toBeGreaterThanOrEqual(44)
}

test('휴대폰: 기록 단추와 단 올리기가 스크롤 없이 아래쪽에 있고, 가로 스크롤이 없다', async ({ page, request }) => {
  const created = await request.post('/api/patterns', { data: { sample: 'practice-hood' } })
  const { id } = (await created.json()) as { id: string }
  made.push(id)
  expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBeTruthy()
  expect((await request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'as_is' } })).ok()).toBeTruthy()

  await page.goto(`/patterns/${id}`)
  await expect(page.locator('#panel-chart .sc-base svg')).toBeAttached()
  const badge = page.getByTestId('progress-badge')
  await expect(badge).toContainText('1단 0코')

  // 엄지가 닿는 아래쪽: 화면 아래 절반에, 스크롤하지 않아도 보입니다.
  await inViewport(page, '단 올리기')
  await inViewport(page, '여기까지 떴어요')
  const up = page.getByRole('button', { name: '단 올리기', exact: true })
  expect((await up.boundingBox())?.y ?? 0).toBeGreaterThan(844 / 2)
  await noSideScroll(page)

  // 한 손으로 단 올리기
  await up.click()
  await up.click()
  await expect(badge).toHaveAttribute('data-row', '3')
  await expect(page.locator('#panel-chart [data-chart]')).toHaveAttribute('data-row', '3')

  // 코 단위로 고친 뒤 기록
  await page.getByRole('button', { name: '뜬 코 하나 늘리기' }).click()
  await page.getByRole('button', { name: '여기까지 떴어요', exact: true }).click()
  await expect(badge).toHaveAttribute('data-kind', 'live')
  await expect(badge).toHaveAttribute('data-stitch', '1')

  // 아래 메뉴로 구역을 옮겨 다녀도 막대는 그대로이고 가로 스크롤이 없습니다.
  const nav = page.getByRole('navigation', { name: '페이지 구역으로 가기' })
  for (const name of ['도안', '뜨는 법', '기록', '3D']) {
    await nav.getByRole('button', { name }).click()
    await inViewport(page, '단 올리기')
    await noSideScroll(page)
  }
  await nav.getByRole('button', { name: '도안' }).click()
  await expect(page.getByRole('tab', { name: '전체 기호 도안' })).toHaveAttribute('aria-selected', 'true')
  // 도안은 제 상자 안에서만 움직입니다.
  const view = page.locator('#panel-chart .sc-view')
  await expect(view).toBeInViewport()
  expect(await view.evaluate((el) => el.scrollWidth > el.clientWidth)).toBeTruthy()

  // 360px 너비에서도 가로 스크롤이 없고 두 단추가 보입니다.
  await page.setViewportSize({ width: 360, height: 740 })
  await noSideScroll(page)
  await inViewport(page, '단 올리기')
  await inViewport(page, '여기까지 떴어요')
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await noSideScroll(page)
})
