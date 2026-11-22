/**
 * 계획서의 화면 통과 기준을 한 번에 따라가는 테스트:
 *   올리기 → 읽기 → 확인 → 게이지 건너뛰기 → 기록 → 단수링 달기가 끝까지 된다.
 * 한 사람이 한 도안으로 처음부터 끝까지 가는 길이고, 화면 사이의 넘어감을 확인합니다.
 * 각 화면의 자세한 동작은 화면별 테스트에 있습니다.
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

// 헤드리스 브라우저에서도 3D(WebGL)가 그려지도록 소프트웨어 렌더러를 씁니다.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })

const here = dirname(fileURLToPath(import.meta.url))
const PDF = join(here, '../../../fixtures/reading/practice-hood.pdf')

test('PDF를 올려서 읽고, 확인하고, 게이지를 건너뛰고, 기록하고, 단수링을 단다', async ({ page, request }) => {
  test.setTimeout(120_000)
  // 개발 서버가 화면 구석에 띄우는 표시가 그 자리의 단추를 가리지 않게 합니다.
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent = 'nextjs-portal{display:none!important}'
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style))
  })
  // 같은 PDF를 올려 둔 도안이 남아 있으면 지우고 시작합니다.
  const before = (await (await request.get('/api/patterns')).json()) as { patterns: { id: string; source: string }[] }
  for (const p of before.patterns.filter((x) => x.source === 'upload')) await request.delete(`/api/patterns/${p.id}`)

  // 1. 랜딩에서 올리기로
  // 개발 서버가 막 떴을 때는 화면이 한두 번 새로 고쳐질 수 있어, 넘어갈 때까지 다시 누릅니다.
  await page.goto('/')
  const cta = page.getByRole('link', { name: /PDF 도안 올리기/ }).first()
  await expect(cta).toHaveAttribute('href', '/upload')
  await expect(async () => {
    await cta.click({ timeout: 5_000 })
    await expect(page).toHaveURL(/\/upload$/, { timeout: 5_000 })
  }).toPass({ timeout: 40_000 })

  // 2. 올리기 → 읽는 중 → 확인
  await page.locator('#pattern-pdf').setInputFiles(PDF)
  await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/, { timeout: 30_000 })
  const id = /\/patterns\/([^/]+)\/review$/.exec(page.url())![1]
  const api = `/api/patterns/${id}`
  const { job } = (await (await request.get(`${api}/job`)).json()) as { job: { llmCalls: number; feedbackRounds: number; verification: { ok: boolean } } }
  expect(job).toMatchObject({ llmCalls: 3, feedbackRounds: 1, verification: { ok: true } })

  // 3. 읽은 내용 확인
  await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
  await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
  await expect(page.getByText('3개 구간 · 93단')).toBeVisible()
  await page.getByRole('button', { name: /확인 완료/ }).click()

  // 4. 게이지: 재지 않고 도안 숫자 그대로
  await expect(page).toHaveURL(new RegExp(`/patterns/${id}/gauge$`))
  await expect(page.getByRole('heading', { level: 1, name: '내 게이지에 맞추기' })).toBeVisible()
  await page.getByRole('radio', { name: /재지 않고/ }).check()
  await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()

  // 5. 작업 화면: 3D와 기호 도안
  await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`))
  await expect(page.getByRole('heading', { level: 1, name: '연습용 후드 워머' })).toBeVisible()
  await expect(page.locator('[data-stage="3d"][data-ready="true"]')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('#panel-chart .sc-base svg')).toBeVisible()
  const view = (await (await request.get(api)).json()) as { pattern: { status: string; gaugeMode: string; versionKind: string } }
  expect(view.pattern).toMatchObject({ status: 'ready', gaugeMode: 'as_is', versionKind: 'original' })

  // 6. 기록: 단을 두 번 올리면 진행 카드, 도안, 3D가 같이 나아가고 서버에 남습니다.
  const badge = page.getByTestId('progress-badge')
  await expect(badge).toHaveAttribute('data-row', '1')
  const rowUp = page.getByRole('button', { name: '단 올리기', exact: true })
  await rowUp.click()
  await rowUp.click()
  await expect(badge).toHaveAttribute('data-row', '3')
  await expect(page.locator('#panel-chart [data-chart]')).toHaveAttribute('data-row', '3')
  await expect(page.locator('[data-viewer3d]')).toHaveAttribute('data-row', '3')
  await expect
    .poll(async () => ((await (await request.get(`${api}/progress`)).json()) as { entries: { row: number }[] }).entries.map((e) => e.row))
    .toEqual([2, 3])

  // 7. 단수링 달기
  const rings = page.getByRole('region', { name: '단수링' })
  await rings.getByRole('textbox', { name: '새 단수링 이름' }).fill('오늘은 여기까지')
  await rings.getByRole('button', { name: '단수링 달기' }).click()
  await expect(rings).toContainText('1개')
  await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
  await expect
    .poll(async () => ((await (await request.get(`${api}/rings`)).json()) as { rings: { name: string; row: number }[] }).rings)
    .toMatchObject([{ name: '오늘은 여기까지', row: 3 }])

  // 8. 새로 열어도 그대로이고, 내 도안에 진행률과 함께 보입니다.
  await page.reload()
  await expect(page.getByTestId('progress-badge')).toHaveAttribute('data-row', '3')
  await expect(page.locator('#panel-chart .sc-ring')).toHaveCount(1)
  await page.goto('/library')
  const card = page.getByRole('listitem').filter({ hasText: '연습용 후드 워머' }).first()
  await expect(card).toContainText('대바늘')
  await expect(card.getByRole('link').first()).toHaveAttribute('href', `/patterns/${id}`)

  // 9. 지우면 PDF도 함께 사라집니다.
  expect((await request.get(`${api}/pdf`)).status()).toBe(200)
  expect((await request.delete(api)).ok()).toBeTruthy()
  expect((await request.get(`${api}/pdf`)).status()).toBe(404)
  expect((await request.get(api)).status()).toBe(404)
})
