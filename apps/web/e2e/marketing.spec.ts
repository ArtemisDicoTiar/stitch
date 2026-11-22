import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * 랜딩(/), 요금제(/pricing), 내 도안(/library).
 * 필요한 도안은 테스트가 직접 만들고 끝나면 지웁니다. 다른 테스트가 남긴 도안이 있어도 괜찮습니다.
 */

type LibraryItem = { id: string; title: string; status: string; row: number; totalRows: number; progress: number }

async function createSample(request: APIRequestContext, sample: 'practice-hood' | 'garter-scarf'): Promise<string> {
  const res = await request.post('/api/patterns', { data: { sample } })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { id: string }).id
}

async function planNow(request: APIRequestContext): Promise<string> {
  return ((await (await request.get('/api/billing')).json()) as { plan: string }).plan
}

/** 가로로 넘치는 폭(px). 0 이하이면 가로 스크롤이 없습니다. */
const sideOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

test.describe('랜딩', () => {
  test('큰 제목이 보이고 올리기 버튼이 /upload 로 간다', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('PDF 도안을 올리면')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('입체로 따라 뜨는 페이지가 돼요')

    const main = page.getByRole('main')
    await expect(main.getByRole('link', { name: '예시 도안으로 둘러보기' })).toHaveAttribute('href', '/upload')
    await expect(main.getByRole('link', { name: '꾸미기 화면 보기' })).toHaveAttribute('href', '/mannequin')

    await main.getByRole('link', { name: 'PDF 도안 올리기' }).first().click()
    await expect(page).toHaveURL(/\/upload$/)
  })

  test('게이지 예시 표는 직접 쓴 예시 도안을 엔진으로 계산한 숫자다', async ({ page }) => {
    await page.goto('/')
    const table = page.getByRole('table', { name: /연습용 후드 워머/ })
    await expect(table.getByRole('row', { name: /게이지/ })).toContainText('18코 × 24단')
    await expect(table.getByRole('row', { name: /맞춰서 다시 계산한 코잡기/ })).toContainText('85코')
    await expect(table.getByRole('row', { name: /맞춰서 다시 계산한 코잡기/ })).toContainText('95코')
  })

  test('WebGL을 쓸 수 없어도 깨지지 않고 자리 표시가 보인다', async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type.startsWith('webgl')) return null
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof original
    })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    await page.goto('/')
    const hero = page.getByRole('img', { name: '연습용 후드 워머를 쓴 3D 마네킹' })
    await expect(hero).toHaveAttribute('data-preview', 'unavailable', { timeout: 30_000 })
    await expect(hero).toContainText('연습용 후드 워머를 쓴 3D 마네킹')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('요금제', () => {
  test('플러스를 켰다가 끈다', async ({ page, request }) => {
    await request.post('/api/billing', { data: { plan: 'free' } })
    await page.goto('/pricing')

    const now = page.getByTestId('current-plan')
    await expect(now).toHaveText('무료')
    // 실제 결제가 아니라는 안내와, 아직 정해지지 않은 가격 자리
    await expect(page.getByText('테스트용 스위치')).toBeVisible()
    await expect(page.getByRole('region', { name: '플러스' })).toContainText('[월 가격]원')
    await expect(page.getByRole('region', { name: '무료' })).toContainText('0원')

    await page.getByRole('button', { name: '플러스 시작하기' }).click()
    await expect(now).toHaveText('플러스')
    await expect(page.getByRole('button', { name: '플러스 시작하기' })).toHaveCount(0)
    expect(await planNow(request)).toBe('plus')

    // 새로 열어도 서버가 기억합니다.
    await page.reload()
    await expect(page.getByTestId('current-plan')).toHaveText('플러스')

    await page.getByRole('button', { name: '무료로 돌아가기' }).click()
    await expect(page.getByTestId('current-plan')).toHaveText('무료')
    await expect(page.getByRole('button', { name: '플러스 시작하기' })).toBeVisible()
    expect(await planNow(request)).toBe('free')
  })
})

test.describe('내 도안', () => {
  test('예시 도안이 종류, 진행률과 함께 보이고, 확인한 뒤 지우면 사라진다', async ({ page, request }) => {
    const id = await createSample(request, 'practice-hood')
    expect((await request.post(`/api/patterns/${id}/progress`, { data: { row: 30, stitch: 10 } })).status()).toBe(201)
    const { patterns } = (await (await request.get('/api/patterns')).json()) as { patterns: LibraryItem[] }
    const item = patterns.find((p) => p.id === id)!
    expect(item.row).toBe(30)

    await page.goto('/library')
    const card = page.locator(`[data-pattern-id="${id}"]`)
    await expect(card.getByRole('heading', { name: '연습용 후드 워머' })).toBeVisible()
    await expect(card).toContainText('대바늘')
    await expect(card).toContainText(`30 / ${item.totalRows}단`)
    await expect(card).toContainText(`${Math.round(item.progress * 100)}%`)
    await expect(card.getByTestId('status')).toHaveText('확인 필요')
    await expect(card.getByRole('link')).toHaveAttribute('href', `/patterns/${id}/review`)

    const remove = card.getByRole('button', { name: '연습용 후드 워머 지우기' })
    const dialog = card.getByRole('dialog')

    // 취소하면 그대로 남습니다.
    await remove.click()
    await expect(dialog).toContainText('도안을 지우면 PDF, 기록, 단수링이 함께 지워집니다')
    await dialog.getByRole('button', { name: '취소' }).click()
    await expect(dialog).toBeHidden()
    await expect(card).toBeVisible()
    expect((await request.get(`/api/patterns/${id}`)).status()).toBe(200)

    // 확인하면 지워집니다.
    await remove.click()
    await dialog.getByRole('button', { name: '지우기' }).click()
    await expect(card).toHaveCount(0)
    expect((await request.get(`/api/patterns/${id}`)).status()).toBe(404)
  })

  test('도안의 상태에 따라 카드가 가는 곳이 달라진다', async ({ page, request }) => {
    const id = await createSample(request, 'garter-scarf')
    try {
      const link = page.locator(`[data-pattern-id="${id}"]`).getByRole('link')
      const status = page.locator(`[data-pattern-id="${id}"]`).getByTestId('status')

      await page.goto('/library')
      await expect(link).toHaveAttribute('href', `/patterns/${id}/review`)

      // 확인을 마쳤지만 게이지를 정하지 않았으면 게이지 화면으로
      expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBeTruthy()
      await page.reload()
      await expect(status).toHaveText('준비됨')
      await expect(link).toHaveAttribute('href', `/patterns/${id}/gauge`)

      // 게이지까지 정했으면 작업 화면으로
      expect((await request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'as_is' } })).ok()).toBeTruthy()
      await page.reload()
      await expect(link).toHaveAttribute('href', `/patterns/${id}`)
    } finally {
      await request.delete(`/api/patterns/${id}`)
    }
  })
})

test.describe('공통', () => {
  for (const path of ['/', '/pricing', '/library']) {
    test(`${path} 는 h1이 하나이고 좁은 화면에서 가로 스크롤이 없다`, async ({ page, request }) => {
      // 내 도안은 카드가 있을 때의 배치를 봅니다.
      const id = path === '/library' ? await createSample(request, 'practice-hood') : null
      try {
        for (const width of [390, 360]) {
          await page.setViewportSize({ width, height: 844 })
          await page.goto(path)
          await expect(page.locator('h1')).toHaveCount(1)
          await expect(page.locator('main#main')).toHaveCount(1)
          expect(await sideOverflow(page), `${path} @ ${width}px`).toBeLessThanOrEqual(0)
        }
      } finally {
        if (id) await request.delete(`/api/patterns/${id}`)
      }
    })
  }
})
