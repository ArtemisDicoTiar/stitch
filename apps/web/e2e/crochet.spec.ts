/**
 * 코바늘 예시 도안으로 올리기 화면부터 작업 화면까지.
 * 직접 쓴 연습용 코바늘 공(fixtures/practice-ball.ts)을 씁니다. API 키 없이 돕니다.
 */
import { expect, test, type Page } from '@playwright/test'

const idFromUrl = (page: Page) => page.url().match(/\/patterns\/([^/]+)/)?.[1] ?? ''

test.describe.serial('코바늘 예시 도안', () => {
  let id = ''

  test.afterAll(async ({ request }) => {
    if (id) await request.delete(`/api/patterns/${id}`)
  })

  test('올리기 화면에서 코바늘 예시로 시작하면 확인 화면에 코바늘 도안으로 나온다', async ({ page }) => {
    await page.goto('/upload')
    await expect(page.getByRole('button', { name: '예시 도안으로 둘러보기' })).toBeVisible()
    await page.getByRole('button', { name: '코바늘 예시로 둘러보기' }).click()
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/)
    id = idFromUrl(page)

    await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
    await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
    await expect(page.getByText('코바늘 · 한국식 약어')).toBeVisible()
    await expect(page.getByText('1개 구간 · 14단')).toBeVisible()
    // 매직링은 시작 코 수 대신 말로 보여 줍니다.
    await expect(page.getByTestId('start-0')).toHaveText('매직링에서 시작')
    // 둘러 뜨는 단은 원통이 아니라 원형입니다.
    await expect(page.getByText('원형', { exact: true }).first()).toBeVisible()
    // (3D 모양 고르기의 '원통' 선택지는 빼고 셉니다.)
    await expect(page.locator(':not(option)', { hasText: /^원통$/ })).toHaveCount(0)
  })

  test('게이지 화면은 코 수를 다시 계산하지 않는 까닭을 알리고, 그대로 뜨기와 코바늘 바꾸기를 권한다', async ({ page }) => {
    await page.goto(`/patterns/${id}/review`)
    await page.getByRole('button', { name: /확인 완료/ }).click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}/gauge$`))
    // 인형이나 소품은 크기가 조금 달라도 괜찮아서 "재지 않고 뜨기"가 먼저 골라져 있습니다.
    await expect(page.getByRole('radio', { name: /재지 않고/ })).toBeChecked()
    await page.getByRole('radio', { name: /재서 맞출게요/ }).check()
    const sts = page.getByRole('spinbutton').first()
    await sts.fill('24')
    await sts.blur()
    const reason = page.getByTestId('regauge-reason')
    await expect(reason).toContainText('둥글게 뜨는 코바늘 도안은 늘림과 줄임의 간격이 모양을 정해서')
    await expect(reason).toContainText('코바늘 호수를 바꿔 보세요')
    const fits = page.getByRole('radiogroup').last()
    await expect(fits.getByRole('radio')).toHaveCount(2)
    await expect(fits).toContainText('도안 숫자 그대로 뜨기')
    await expect(fits).toContainText('모양은 그대로이고 크기만 달라져요')
    await expect(fits).toContainText('코바늘을 바꿔서 스와치 다시 뜨기')
    await expect(fits).not.toContainText('다시 계산하기')
  })

  test('작업 화면: 코바늘 기호 도안과 범례, 코바늘 말투의 안내가 나온다', async ({ page, request }) => {
    await page.goto(`/patterns/${id}/gauge`)
    await page.getByRole('radio', { name: /재지 않고/ }).check()
    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`))

    await expect(page.getByRole('heading', { level: 1, name: '연습용 코바늘 공' })).toBeVisible()
    await expect(page.getByText('매직링에서 시작해요.')).toBeVisible()
    // 3D: 둥글게 뜬 조각으로 그려지고, 마네킹은 없습니다.
    await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 40_000 })
    await expect(page.getByText('3D 없이 기호 도안과 진행 표시만')).toHaveCount(0)
    await expect(page.locator('#panel-chart .sc-base svg')).toBeVisible()
    const legend = page.getByRole('list', { name: '기호 범례' })
    await expect(legend).toContainText('짧은뜨기')
    await expect(legend).toContainText('짧은뜨기 모아뜨기 (줄임)')
    await expect(legend).toContainText('늘림 (같은 코에 한 번 더 뜬 코)')
    await expect(legend).not.toContainText('겉뜨기')
    await expect(page.locator('#main')).not.toContainText('원통')

    // 단을 올리면 도안이 따라가고 서버에 남습니다.
    const badge = page.getByTestId('progress-badge')
    await expect(badge).toHaveAttribute('data-row', '1')
    await page.getByRole('button', { name: '단 올리기', exact: true }).click()
    await expect(badge).toHaveAttribute('data-row', '2')
    await expect.poll(async () => ((await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: { row: number }[] }).entries.map((e) => e.row)).toEqual([2])

    // 느린 연결: 앞의 저장이 끝나는 사이에 다음 누름이 들어와도 지금 위치가 물러나지 않습니다.
    // (서버가 받은 시각으로 기록을 정렬하면, 먼저 저장된 기록이 저장 중인 기록보다 뒤로 가 한 단 물러났습니다.)
    const held: (() => void)[] = []
    let hold = true
    await page.route('**/api/patterns/*/progress', async (route) => {
      if (hold && route.request().method() === 'POST') await new Promise<void>((r) => held.push(r))
      await route.continue()
    })
    const rowUp = page.getByRole('button', { name: '단 올리기', exact: true })
    await rowUp.click()
    await rowUp.click()
    await expect(badge).toHaveAttribute('data-row', '4')
    // 첫 저장만 끝냅니다. 두 번째는 아직 저장 중입니다.
    await expect.poll(() => held.length).toBe(1)
    const firstSaved = page.waitForResponse((r) => r.url().includes('/progress') && r.request().method() === 'POST')
    held.shift()!()
    await firstSaved
    await page.waitForTimeout(300)
    await expect(badge).toHaveAttribute('data-row', '4')
    await rowUp.click()
    await expect(badge).toHaveAttribute('data-row', '5')
    hold = false
    for (const go of held.splice(0)) go()
    await expect.poll(async () => ((await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: { row: number }[] }).entries.map((e) => e.row), { timeout: 15_000 }).toEqual([2, 3, 4, 5])
    await expect(badge).toHaveAttribute('data-row', '5')
    await page.unroute('**/api/patterns/*/progress')

    // 단계별 안내
    await page.getByRole('tab', { name: '단계별 안내' }).click()
    await expect(page.getByTestId('step-row')).toContainText('5단')
    await expect(page.getByText('원형 ← 방향')).toBeVisible()
    await expect(page.getByRole('list', { name: '지시문 조각' })).toContainText('(짧은뜨기 3코, 짧은뜨기 늘림) 6번')
  })

  test('내 도안에 코바늘로 보인다', async ({ page }) => {
    await page.goto('/library')
    const card = page.getByRole('listitem').filter({ hasText: '연습용 코바늘 공' }).first()
    await expect(card).toContainText('코바늘')
  })
})
