import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

// 헤드리스 브라우저에서도 3D(WebGL)가 그려지도록 소프트웨어 렌더러를 씁니다.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

// 개발 서버가 화면 구석에 띄우는 표시가 그 자리의 단추를 가리지 않게 합니다.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'nextjs-portal{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })
})

type SeedOptions = { template?: string; confirm?: boolean; gauge?: boolean }

/** 이 파일의 테스트가 만든 도안. 테스트가 끝나면 지웁니다 (한 사람이 둘 수 있는 도안 수에 한도가 있습니다). */
const made: string[] = []
test.afterEach(async ({ request }) => {
  for (const id of made.splice(0)) await request.delete(`/api/patterns/${id}`)
})

/** 예시 도안으로 새 도안을 만들고, 작업 화면에 들어갈 수 있는 상태까지 보냅니다. 이 테스트가 만든 id만 씁니다. */
async function seed(request: APIRequestContext, sample: 'practice-hood' | 'garter-scarf', opts: SeedOptions = {}): Promise<string> {
  const created = await request.post('/api/patterns', { data: { sample } })
  expect(created.status()).toBe(201)
  const { id } = (await created.json()) as { id: string }
  made.push(id)
  if (opts.template) {
    const { pattern } = (await (await request.get(`/api/patterns/${id}`)).json()) as { pattern: { ir: Record<string, unknown> } }
    expect((await request.put(`/api/patterns/${id}/ir`, { data: { ...pattern.ir, template: opts.template } })).ok()).toBeTruthy()
  }
  if (opts.confirm === false) return id
  expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBeTruthy()
  if (opts.gauge === false) return id
  expect((await request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'as_is' } })).ok()).toBeTruthy()
  return id
}

async function entryCount(request: APIRequestContext, id: string): Promise<number> {
  const { entries } = (await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: unknown[] }
  return entries.length
}

const badge = (page: Page) => page.getByTestId('progress-badge')
const rowUp = (page: Page) => page.getByRole('button', { name: '단 올리기', exact: true })
const chart = (page: Page) => page.locator('#panel-chart [data-chart]')
const viewer = (page: Page) => page.locator('[data-viewer3d]')

async function open(page: Page, id: string, stage: '3d' | 'none' = '3d') {
  await page.goto(`/patterns/${id}`)
  if (stage === '3d') await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 30_000 })
  else await expect(page.locator('[data-stage="none"]')).toBeVisible()
  await expect(page.locator('#panel-chart .sc-base svg')).toBeVisible()
}

/** 진행 카드, 기호 도안, 3D가 모두 같은 위치를 그리고 있는지 */
async function expectPosition(page: Page, row: number, stitch: number, with3d = true) {
  await expect(badge(page)).toHaveAttribute('data-row', String(row))
  await expect(badge(page)).toHaveAttribute('data-stitch', String(stitch))
  await expect(chart(page)).toHaveAttribute('data-row', String(row))
  await expect(chart(page)).toHaveAttribute('data-stitch', String(stitch))
  if (with3d) {
    await expect(viewer(page)).toHaveAttribute('data-row', String(row))
    await expect(viewer(page)).toHaveAttribute('data-stitch', String(stitch))
  }
}

/** 지금 뜰 단에서 rowsUp단 위의 가운데 칸을 누릅니다. */
async function clickCellAbove(page: Page, rowsUp: number) {
  // 도안 상자가 화면 가운데 오게 한 뒤, 그 안에서 지금 뜰 단을 가운데로 옮깁니다.
  await page.locator('#panel-chart .sc-view').evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.getByRole('button', { name: '지금 위치로' }).click()
  const band = page.locator('#panel-chart .sc-now-row')
  await expect(band).toBeVisible()
  // 부드럽게 옮겨 가는 동안 자리가 바뀌므로 멈출 때까지 기다립니다.
  let last = -1
  await expect
    .poll(async () => {
      const y = (await band.boundingBox())?.y ?? -1
      const still = y === last
      last = y
      return still
    })
    .toBeTruthy()
  const box = await band.boundingBox()
  if (!box) throw new Error('지금 뜰 단을 찾지 못했습니다')
  // 한 칸의 화면 크기: 도안 그림의 한 칸은 12이고, 겹쳐 그린 층의 viewBox가 그림 크기입니다.
  const cell = await page.locator('#panel-chart .sc-overlay').evaluate((svg) => (svg.getBoundingClientRect().width / (svg as SVGSVGElement).viewBox.baseVal.width) * 12)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - cell * rowsUp)
}

test.describe('작업 화면', () => {
  test('3D와 기호 도안이 그려지고, 기록하면 모두 함께 움직인다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await open(page, id)

    await expect(page.getByRole('heading', { level: 1, name: '연습용 후드 워머' })).toBeVisible()
    await expect(page.getByText('3D는 참고용 모양입니다')).toBeVisible()
    await expect(page.getByRole('link', { name: /마네킹 꾸미기/ })).toHaveAttribute('href', '/mannequin')
    await expect(badge(page)).toContainText('1단 0코')
    await expectPosition(page, 1, 0)
    await expect(badge(page)).toHaveAttribute('data-percent', '0')

    // 단 올리기: 누를 때마다 바로 기록되고, 위치와 비율, 도안, 3D가 같이 나아갑니다.
    for (let i = 0; i < 3; i++) await rowUp(page).click()
    await expectPosition(page, 4, 0)
    await expect(badge(page)).toContainText('4단 0코')
    await expect(page.locator('#panel-chart .sc-now-row')).toBeVisible()
    const percent = Number(await badge(page).getAttribute('data-percent'))
    expect(percent).toBeGreaterThan(0)
    await expect.poll(() => entryCount(request, id)).toBe(3)

    // 코 단위로 고치면 저장 전 미리보기가 되고, '여기까지 떴어요'로 기록합니다.
    await page.getByRole('button', { name: '뜬 코 하나 늘리기' }).click()
    await page.getByRole('button', { name: '뜬 코 하나 늘리기' }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'draft')
    await expectPosition(page, 4, 2)
    await expect.poll(() => entryCount(request, id)).toBe(3)
    await page.getByRole('button', { name: '여기까지 떴어요', exact: true }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'live')
    await expectPosition(page, 4, 2)
    await expect.poll(() => entryCount(request, id)).toBe(4)

    // 도안에서 칸을 누르면 고른 칸이 되고, 확인하면 기록됩니다.
    await clickCellAbove(page, 3)
    const card = page.getByRole('group').filter({ hasText: '여기까지 떴어요 · 지금 기록' })
    await expect(card).toBeVisible()
    const title = (await card.locator('strong').first().innerText()).trim()
    const picked = /^(\d+)단 · \S+ (\d+)번째 코$/.exec(title)
    expect(picked, title).not.toBeNull()
    const row = Number(picked?.[1])
    const stitch = Number(picked?.[2])
    expect(row).toBe(7)
    await expectPosition(page, 4, 2) // 아직 기록 전
    await card.getByRole('button', { name: '여기까지 떴어요 · 지금 기록' }).click()
    await expect(card).toBeHidden()
    await expectPosition(page, row, stitch)
    await expect.poll(() => entryCount(request, id)).toBe(5)

    // 기록 목록: 메모를 쓰고, 새로 고쳐도 그대로입니다.
    await page.getByRole('tab', { name: '내 기록' }).click()
    const entries = page.getByTestId('log-entry')
    await expect(entries).toHaveCount(5)
    await expect(entries.first()).toContainText(`${row}단 ${stitch}코`)
    await entries.first().getByRole('button', { name: /메모 쓰기$/ }).click()
    await entries.first().getByRole('textbox').fill('소매 달기 전까지')
    await entries.first().getByRole('button', { name: '저장' }).click()
    await expect(entries.first()).toContainText('소매 달기 전까지')
    await expect
      .poll(async () => {
        const { entries: list } = (await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: { memo: string }[] }
        return list[list.length - 1]?.memo
      })
      .toBe('소매 달기 전까지')

    await page.reload()
    await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 30_000 })
    await expectPosition(page, row, stitch)
    await page.getByRole('tab', { name: '내 기록' }).click()
    await expect(page.getByTestId('log-entry')).toHaveCount(5)
    await expect(page.getByTestId('log-entry').first()).toContainText('소매 달기 전까지')

    // 지난 기록의 모습을 3D와 도안으로 다시 볼 수 있습니다. 기록은 바뀌지 않습니다.
    await page.getByTestId('log-entry').last().getByRole('button', { name: /그때 모습 보기$/ }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'entry')
    await expectPosition(page, 2, 0)
    await badge(page).getByRole('button', { name: '지금 위치로 돌아가기' }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'live')
    await expectPosition(page, row, stitch)

    // 벗은 모습: 편물을 감추는 보기 전환
    const off = page.getByRole('button', { name: '벗은 모습' })
    await off.click()
    await expect(off).toHaveAttribute('aria-pressed', 'true')
    await off.click()
    await expect(off).toHaveAttribute('aria-pressed', 'false')

    // 가장 최근 기록을 지우면 그 앞 기록의 위치로 돌아갑니다.
    const latest = page.getByTestId('log-entry').first()
    await latest.getByRole('button', { name: /기록 삭제$/ }).click()
    await latest.getByRole('button', { name: /기록 정말 삭제$/ }).click()
    await expect(page.getByTestId('log-entry')).toHaveCount(4)
    await expectPosition(page, 4, 2)
    await expect.poll(() => entryCount(request, id)).toBe(4)
  })

  test('단수링을 달고, 이름과 색을 바꾸고, 뺀다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await open(page, id)
    const rings = page.getByRole('region', { name: '단수링' })
    await expect(rings).toContainText('0개')

    // 지금 뜰 코에 이름을 붙여 답니다.
    await rings.getByRole('radio', { name: '파랑' }).check({ force: true })
    await rings.getByRole('textbox', { name: '새 단수링 이름' }).fill('길이 재기 시작')
    await rings.getByRole('button', { name: '단수링 달기' }).click()
    await expect(rings).toContainText('1개')
    await expect(rings).toContainText('1단 · 오른쪽부터 1번째 코')
    await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
    await expect(page.locator('#panel-chart .sc-ring-label')).toHaveText('길이 재기 시작')

    // 도안에서 고른 칸에도 답니다.
    await clickCellAbove(page, 2)
    await page.getByRole('button', { name: '여기에 단수링 달기' }).click()
    await expect(rings).toContainText('2개')
    await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(2)
    await expect(page.getByRole('button', { name: '단수링 빼기', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '닫기', exact: true }).click()

    // 이름과 색을 바꿉니다.
    const first = rings.getByRole('listitem').first()
    await first.getByRole('textbox').fill('22cm 재기 시작')
    await first.getByRole('textbox').press('Enter')
    await expect(page.locator('#panel-chart .sc-ring-label').first()).toHaveText('22cm 재기 시작')
    await first.getByRole('button', { name: /색 바꾸기 \(지금 파랑\)/ }).click()
    await expect(first.getByRole('button', { name: /색 바꾸기 \(지금 초록\)/ })).toBeVisible()
    await expect
      .poll(async () => {
        const { rings: list } = (await (await request.get(`/api/patterns/${id}/rings`)).json()) as { rings: { name: string; color: string }[] }
        return list.map((r) => `${r.name}:${r.color}`).sort()
      })
      .toEqual([':#1f6fd1', '22cm 재기 시작:#2f9e44'].sort())

    await page.reload()
    await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(2)
    const again = page.getByRole('region', { name: '단수링' })
    await expect(again.getByRole('listitem').first().getByRole('textbox')).toHaveValue('22cm 재기 시작')

    // 뺍니다. 한 번 더 눌러 확인합니다.
    await again.getByRole('listitem').first().getByRole('button', { name: /단수링 빼기$/ }).click()
    await again.getByRole('listitem').first().getByRole('button', { name: /단수링 정말 빼기$/ }).click()
    await expect(again).toContainText('1개')
    await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
    await expect.poll(async () => ((await (await request.get(`/api/patterns/${id}/rings`)).json()) as { rings: unknown[] }).rings.length).toBe(1)
  })

  test('단계별 안내가 지금 단을 따라가고, 단 재생은 기록을 남기지 않는다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await open(page, id)
    await rowUp(page).click()
    await expectPosition(page, 2, 0)
    await expect.poll(() => entryCount(request, id)).toBe(1)

    await page.getByRole('tab', { name: '단계별 안내' }).click()
    await expect(page.getByTestId('step-row')).toContainText('2단')
    const segments = page.getByRole('list', { name: '지시문 조각' })
    await expect(segments.getByRole('listitem')).not.toHaveCount(0)
    await expect(segments.locator('[aria-current="step"]')).toHaveCount(1)

    let posts = 0
    page.on('request', (r) => {
      if (r.method() !== 'GET' && r.url().includes('/progress')) posts++
    })

    // 단 재생: 도안과 3D가 미리보기로 움직이지만 저장하지 않습니다.
    await page.getByRole('button', { name: '단 재생', exact: true }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'play')
    await expect.poll(async () => Number(await badge(page).getAttribute('data-stitch'))).toBeGreaterThan(3)
    await expect(viewer(page)).toHaveAttribute('data-row', '2')
    await page.getByRole('button', { name: '멈춤' }).click()
    await page.getByRole('button', { name: '다음 조각' }).click()
    await expect(page.getByTestId('play-status')).toContainText('기록은 저장하지 않아요')
    await page.getByRole('button', { name: '재생 끝내기' }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'live')
    await expectPosition(page, 2, 0)
    expect(posts).toBe(0)
    expect(await entryCount(request, id)).toBe(1)

    // 재생하다가 기록하면 재생은 끝나고, 모든 곳이 저장된 위치를 보여 줍니다.
    await page.getByRole('button', { name: '단 재생', exact: true }).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'play')
    await page.getByRole('button', { name: '멈춤' }).click()
    await rowUp(page).click()
    await expect(badge(page)).toHaveAttribute('data-kind', 'live')
    await expectPosition(page, 3, 0)
    await expect(page.getByTestId('step-row')).toContainText('3단')
    await expect.poll(() => entryCount(request, id)).toBe(2)
    posts = 0

    // 다른 단도 볼 수 있고, 기록하면 다시 지금 단을 따라갑니다.
    await page.getByRole('button', { name: '다음 단' }).click()
    await expect(page.getByTestId('step-row')).toContainText('4단')
    await page.getByRole('button', { name: '지금 뜰 단으로' }).click()
    await expect(page.getByTestId('step-row')).toContainText('3단')
    await rowUp(page).click()
    await expect(page.getByTestId('step-row')).toContainText('4단')

    // 지금 뜰 조각에서 맞는 뜨는 법으로 넘어갑니다.
    await page.getByRole('button', { name: /뜨는 법 보기$/ }).first().click()
    await expect(page.getByRole('tab', { name: '기호별 뜨는 법' })).toHaveAttribute('aria-selected', 'true')
    const symbols = page.getByRole('tablist', { name: '기호 고르기' })
    await expect(symbols.getByRole('tab', { selected: true })).toHaveCount(1)
    const steps = page.getByRole('group', { name: '단계 고르기' })
    // 저절로 넘어가지 않게 멈춰 두고 단계를 넘겨 봅니다.
    await page.getByRole('button', { name: '일시정지' }).click()
    await steps.getByRole('button', { name: '1단계' }).click()
    await expect(steps.locator('[aria-current="step"]')).toHaveText('1')
    await page.getByRole('button', { name: '다음', exact: true }).click()
    await expect(steps.locator('[aria-current="step"]')).toHaveText('2')
    await page.getByRole('button', { name: '이전', exact: true }).click()
    await expect(steps.locator('[aria-current="step"]')).toHaveText('1')
    // 도안에 나온 기호만 탭으로 나옵니다. 다른 기호로 바꿔 봅니다.
    await symbols.getByRole('tab').nth(1).click()
    await expect(symbols.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByText('주황색이 지금 다루는 코')).toBeVisible()
  })

  test('마지막 단을 뜬 뒤에는 마무리 단계를 차례로 끝낸다', async ({ page, request }) => {
    const id = await seed(request, 'garter-scarf')
    // 마지막 단의 첫 코 자리까지 기록해 둡니다. (단 번호는 서버가 도안 범위로 맞춥니다.)
    expect((await request.post(`/api/patterns/${id}/progress`, { data: { row: 100000, stitch: 0 } })).status()).toBe(201)
    await open(page, id)

    // 평면 형태는 마네킹에 입히지 않으므로 벗은 모습 전환과 마네킹 꾸미기가 없습니다.
    await expect(page.getByRole('button', { name: '벗은 모습' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /마네킹 꾸미기/ })).toHaveCount(0)

    await rowUp(page).click()
    await expect(badge(page)).toContainText('뜨기 완료')
    await expect(badge(page)).toHaveAttribute('data-percent', '100')
    await expect(page.getByTestId('stage-name')).toContainText('마무리')

    // 기록하기 패널의 큰 단추가 다음 마무리 단계로 바뀝니다.
    await page.getByRole('button', { name: '실 정리 끝냈어요' }).click()
    await expect(badge(page)).toContainText('완성!')
    await page.getByRole('tab', { name: '내 기록' }).click()
    await expect(page.getByTestId('finishing-count')).toHaveText('1 / 1')
    const step = page.getByRole('button', { name: /실 정리/ }).filter({ hasText: '남은 실을 숨깁니다' })
    await expect(step).toHaveAttribute('aria-pressed', 'true')
    await expect
      .poll(async () => {
        const { entries } = (await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: { finishingStep: number | null }[] }
        return entries[entries.length - 1]?.finishingStep
      })
      .toBe(1)

    // 방금 끝낸 단계는 취소할 수 있습니다.
    await step.click()
    await expect(page.getByTestId('finishing-count')).toHaveText('0 / 1')
    await expect(step).toHaveAttribute('aria-pressed', 'false')
  })

  test('맞는 3D 형태가 없으면 3D 없이 기호 도안과 진행 표시만 보여 준다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood', { template: 'none' })
    await open(page, id, 'none')
    await expect(page.getByText('3D 없이 기호 도안과 진행 표시만 제공합니다')).toBeVisible()
    await expect(viewer(page)).toHaveCount(0)
    await expectPosition(page, 1, 0, false)
    await rowUp(page).click()
    await rowUp(page).click()
    await expectPosition(page, 3, 0, false)
    await expect(badge(page)).toContainText('3단 0코')
  })

  test('WebGL을 쓸 수 없는 기기에서는 3D 없이 기호 도안과 진행 표시만 보여 준다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    // 이 기기에는 WebGL이 없는 것처럼 만듭니다.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return (original as (this: HTMLCanvasElement, ...args: unknown[]) => unknown).call(this, type, ...rest)
      } as typeof HTMLCanvasElement.prototype.getContext
    })
    await open(page, id, 'none')
    await expect(page.getByText('이 기기에서는 3D를 그릴 수 없어서')).toBeVisible()
    await expect(page.getByText('기호 도안과 진행 표시만 제공합니다')).toBeVisible()
    await expect(page.locator('[data-viewer3d] canvas')).toHaveCount(0)
    await rowUp(page).click()
    await expect(badge(page)).toContainText('2단 0코')
    await expect(chart(page)).toHaveAttribute('data-row', '2')
    await expect.poll(() => entryCount(request, id)).toBe(1)
    // 뜨는 법 그림(2D 캔버스)은 그대로 됩니다.
    await page.getByRole('tab', { name: '기호별 뜨는 법' }).click()
    await expect(page.getByRole('tablist', { name: '기호 고르기' }).getByRole('tab').first()).toHaveAttribute('aria-selected', 'true')
  })

  test('준비물과 게이지 상태를 보여 주고, 게이지는 언제든 다시 맞출 수 있다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await open(page, id)
    const info = page.getByRole('region', { name: '준비물과 도안 정보' })
    await expect(info).toContainText('굵은 울 혼방사')
    await expect(info).toContainText('18코 × 24단')
    await expect(info).toContainText('가로 26cm, 세로 44cm')
    await expect(page.getByTestId('gauge-state')).toHaveText('도안 숫자 그대로')
    await expect(info.getByRole('link', { name: '게이지 다시 맞추기' })).toHaveAttribute('href', `/patterns/${id}/gauge`)
    await expect(info.getByRole('link', { name: '읽은 내용 다시 확인하기' })).toHaveAttribute('href', `/patterns/${id}/review`)
    await expect(page.getByRole('list', { name: '기호 범례' }).getByRole('listitem')).not.toHaveCount(0)
    await expect(page.getByText('겉면 단은 오른쪽에서 왼쪽으로, 안면 단은 왼쪽에서 오른쪽으로 읽습니다')).toBeVisible()

    // 내 게이지로 다시 계산하면 그 상태와 내 게이지가 보입니다.
    expect((await request.post(`/api/patterns/${id}/gauge`, { data: { mode: 'recalc', gauge: { stitches: 20, rows: 26 } } })).ok()).toBeTruthy()
    await page.reload()
    await expect(page.getByTestId('gauge-state')).toHaveText('내 게이지로 다시 계산')
    const after = page.getByRole('region', { name: '준비물과 도안 정보' })
    await expect(after).toContainText('도안 게이지 18코 × 24단')
    await expect(after).toContainText('내 게이지 20코 × 26단')
  })

  test('저장에 실패하면 화면을 되돌리고 이유를 알려 준다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood', { template: 'none' })
    await open(page, id, 'none')
    await rowUp(page).click()
    await expectPosition(page, 2, 0, false)
    await expect.poll(() => entryCount(request, id)).toBe(1)

    // 다음 기록 요청은 서버 오류로 돌려보냅니다.
    await page.route(`**/api/patterns/${id}/progress`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      // 화면이 먼저 바뀌는 것을 볼 수 있게 조금 늦게 답합니다.
      await new Promise((r) => setTimeout(r, 600))
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'server', message: '서버에서 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' } }) })
    })
    await rowUp(page).click()
    await expectPosition(page, 3, 0, false) // 먼저 화면부터
    await expect(page.getByTestId('save-error')).toContainText('서버에서 문제가 생겼습니다')
    await expect(page.getByTestId('save-error')).toHaveAttribute('role', 'alert')
    await expectPosition(page, 2, 0, false) // 실패하면 되돌림
    expect(await entryCount(request, id)).toBe(1)

    // 다시 되면 이어서 기록할 수 있습니다.
    await page.unroute(`**/api/patterns/${id}/progress`)
    await rowUp(page).click()
    await expectPosition(page, 3, 0, false)
    await expect.poll(() => entryCount(request, id)).toBe(2)
    await expect(page.getByTestId('save-error')).toHaveCount(0)
  })

  test('도안의 상태에 맞는 화면으로 보낸다', async ({ page, request }) => {
    const unconfirmed = await seed(request, 'garter-scarf', { confirm: false })
    await page.goto(`/patterns/${unconfirmed}`)
    await expect(page).toHaveURL(new RegExp(`/patterns/${unconfirmed}/review$`))

    const ungauged = await seed(request, 'garter-scarf', { gauge: false })
    await page.goto(`/patterns/${ungauged}`)
    await expect(page).toHaveURL(new RegExp(`/patterns/${ungauged}/gauge$`))
  })
})
