/**
 * 도안 올리기 → 읽는 중 → 읽은 내용 확인.
 * API 키 없이 돕니다. 연습용 PDF(fixtures/reading/practice-hood.pdf)는 준비해 둔 응답으로 읽힙니다.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const PDF = join(here, '../../../fixtures/reading/practice-hood.pdf')
const CROCHET_PDF = join(here, '../../../fixtures/reading/practice-bear.pdf')

/** 같은 PDF는 다시 읽지 않으므로, 앞서 올린 것이 남아 있으면 지우고 시작합니다. */
async function removeUploads(request: APIRequestContext) {
  const { patterns } = (await (await request.get('/api/patterns')).json()) as { patterns: { id: string; source: string }[] }
  for (const p of patterns) if (p.source === 'upload') await request.delete(`/api/patterns/${p.id}`)
}

const idFromUrl = (page: Page) => page.url().match(/\/patterns\/([^/]+)\//)?.[1] ?? ''
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
const saved = (page: Page) => expect(page.getByTestId('save-state')).toHaveText('저장됨')

test.describe.serial('도안 올리기와 읽은 내용 확인', () => {
  let uploadedId = ''
  const made: string[] = []

  test.beforeAll(async ({ request }) => {
    await removeUploads(request)
  })
  test.afterAll(async ({ request }) => {
    await removeUploads(request)
    for (const id of made) await request.delete(`/api/patterns/${id}`)
  })

  test('올리기 화면은 비공개 원칙과 지금 되는 것을 미리 알려 준다', async ({ page, request }) => {
    const me = (await (await request.get('/api/me')).json()) as { canReadPdf: boolean }
    await page.goto('/upload')
    await expect(page.getByRole('heading', { level: 1, name: '도안 PDF를 올려 주세요' })).toBeVisible()
    await expect(page.getByText('PDF는 비공개 저장소에 보관하고, 올린 사람만 열 수 있어요.', { exact: false })).toBeVisible()
    await expect(page.getByText('PDF가 LLM 제공자(Claude API)에게 전송됩니다', { exact: false })).toBeVisible()
    await expect(page.getByText('대바늘 도안과 코바늘 도안')).toBeVisible()
    await expect(page.getByText('코바늘은 둥글게 뜨는 인형·소품과 왕복으로 뜨는 목도리·블랭킷을 읽어요', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: '예시 도안으로 둘러보기' })).toBeVisible()
    await expect(page.getByText('20MB까지 올릴 수 있어요', { exact: false })).toBeVisible()
    // API 키가 없으면 새 PDF를 읽을 수 없다고 먼저 알려 줍니다.
    await expect(page.getByTestId('no-key-notice')).toHaveCount(me.canReadPdf ? 0 : 1)

    await page.route('**/api/me', (route) => route.fulfill({ json: { user: { login: 'local' }, plan: 'free', canReadPdf: true } }))
    await page.reload()
    await expect(page.getByRole('button', { name: '예시 도안으로 둘러보기' })).toBeVisible()
    await expect(page.getByTestId('no-key-notice')).toHaveCount(0)
  })

  test('PDF가 아닌 파일은 올리는 상자 옆에 까닭을 보여 준다', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('#pattern-pdf').setInputFiles({ name: '메모.pdf', mimeType: 'application/pdf', buffer: Buffer.from('이건 그냥 글입니다.') })
    await expect(page.getByRole('alert').filter({ hasText: 'PDF 파일만 올릴 수 있습니다.' })).toBeVisible()
    await expect(page).toHaveURL(/\/upload$/)
    // 다시 고를 수 있어야 합니다.
    await page.locator('#pattern-pdf').setInputFiles({ name: '빈.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(0) })
    await expect(page.getByRole('alert').filter({ hasText: '빈 파일입니다.' })).toBeVisible()
  })

  test('상자에 끌어다 놓아도 올라가고, 한 번에 하나만 받는다', async ({ page }) => {
    await page.goto('/upload')
    const zone = page.getByTestId('dropzone')
    const files = (names: string[]) =>
      page.evaluateHandle((list) => {
        const dt = new DataTransfer()
        for (const name of list) dt.items.add(new File(['PDF가 아닌 글'], name, { type: 'application/pdf' }))
        return dt
      }, names)
    await zone.dispatchEvent('dragover', { dataTransfer: await files(['a.pdf']) })
    await expect(zone).toHaveAttribute('data-over', 'true')
    await zone.dispatchEvent('drop', { dataTransfer: await files(['a.pdf', 'b.pdf']) })
    await expect(page.getByRole('alert').filter({ hasText: 'PDF는 한 번에 하나만 올릴 수 있어요.' })).toBeVisible()
    await expect(zone).not.toHaveAttribute('data-over', 'true')
    // 놓은 파일은 서버까지 가서 확인됩니다.
    await zone.dispatchEvent('drop', { dataTransfer: await files(['a.pdf']) })
    await expect(page.getByRole('alert').filter({ hasText: 'PDF 파일만 올릴 수 있습니다.' })).toBeVisible()
  })

  test('예시 도안으로 바로 확인 화면을 둘러본다', async ({ page, request }) => {
    await page.goto('/upload')
    await page.getByRole('button', { name: '예시 도안으로 둘러보기' }).click()
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/)
    made.push(idFromUrl(page))
    await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
    await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
    // 예시 도안에는 PDF가 없어 고른 단의 지시문만 보여 줍니다.
    const aside = page.locator('aside')
    await expect(aside.getByText('예시 도안에는 원본 PDF가 없어요', { exact: false })).toBeVisible()
    await page.locator('#row-0-1-0 > button').click()
    await expect(aside.getByTestId('source-text')).toContainText('11코 무늬대로, 3코 모아뜨기')
    await expect(page.getByRole('button', { name: /확인 완료/ })).toBeEnabled()

    // 저장이 실패하면 알려 주고, 다시 저장할 수 있습니다.
    const sampleId = idFromUrl(page)
    await page.route(`**/api/patterns/${sampleId}/ir`, (route) => route.abort())
    await page.getByLabel('3D 모양').selectOption('none')
    const state = page.getByTestId('save-state')
    await expect(state).toContainText('저장하지 못했습니다')
    await page.unroute(`**/api/patterns/${sampleId}/ir`)
    await state.getByRole('button', { name: '다시 저장' }).click()
    await saved(page)
    const stored = (await (await request.get(`/api/patterns/${sampleId}`)).json()) as { pattern: { ir: { template: string } } }
    expect(stored.pattern.ir.template).toBe('none')
  })

  test('게이지를 재지 않고 넘어가면 도안 숫자 그대로 작업 화면으로 간다', async ({ page, request }) => {
    const { id } = (await (await request.post('/api/patterns', { data: { sample: 'garter-scarf' } })).json()) as { id: string }
    made.push(id)
    // 작업 화면은 다른 테스트가 맡습니다. 여기서는 확인을 마치고 그 주소로 가는지만 봅니다.
    await page.route(
      (url) => url.pathname === `/patterns/${id}`,
      (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>작업 화면</title>' }),
    )
    await page.goto(`/patterns/${id}/review`)
    await page.getByRole('button', { name: '게이지는 재지 않고 도안 숫자 그대로 만들기' }).click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}$`))
    const done = (await (await request.get(`/api/patterns/${id}`)).json()) as { pattern: { status: string; gaugeMode: string } }
    expect(done.pattern).toMatchObject({ status: 'ready', gaugeMode: 'as_is' })
  })

  test('PDF를 올리면 읽고, 확인 화면에서 고친 뒤 게이지로 넘어간다', async ({ page, request }) => {
    await page.goto('/upload')
    await page.locator('#pattern-pdf').setInputFiles(PDF)

    // 읽는 중 화면을 거쳐(이미 다 읽었으면 바로) 확인 화면에 닿습니다.
    await page.waitForURL(/\/patterns\/[^/]+\/(reading|review)$/)
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/, { timeout: 30_000 })
    uploadedId = idFromUrl(page)
    const api = `/api/patterns/${uploadedId}`
    const { job } = (await (await request.get(`${api}/job`)).json()) as { job: { llmCalls: number; feedbackRounds: number; verification: { ok: boolean } } }
    expect(job).toMatchObject({ llmCalls: 3, feedbackRounds: 1, verification: { ok: true } })

    // 요약: 제목, 종류, 게이지, 완성 크기, 3D 모양, 검산 결과
    await expect(page.getByRole('heading', { level: 1, name: '읽은 내용을 확인해 주세요' })).toBeVisible()
    const summary = page.locator('section', { has: page.getByRole('heading', { name: '준비물과 게이지' }) })
    await expect(summary).toContainText('연습용 후드 워머')
    await expect(summary).toContainText('대바늘 · 한국식 약어')
    await expect(summary).toContainText('18코 × 24단')
    await expect(summary).toContainText('가로 26cm × 세로 44cm')
    await expect(page.getByLabel('3D 모양')).toHaveValue('hood')
    const verdict = page.getByTestId('verdict')
    await expect(verdict).toContainText('코 수 검산 통과')
    await expect(verdict).toContainText('확인 필요 1곳')
    await expect(page.getByText('3개 구간 · 93단')).toBeVisible()
    const confirm = page.getByRole('button', { name: /확인 완료/ })
    await expect(confirm).toBeEnabled()

    // 단을 누르면 원문의 그 자리가 강조됩니다. 다른 쪽에 있는 단이면 그 쪽으로 넘어갑니다.
    const aside = page.locator('aside')
    const row9 = page.locator('#row-0-1-0')
    await expect(row9.locator('> button')).toContainText('9단')
    await expect(row9.locator('> button')).toContainText('일치 · 도안 79코')
    await row9.locator('> button').click()
    await expect(row9.locator('> button')).toHaveAttribute('aria-expanded', 'true')
    await expect(aside.getByTestId('source-highlight')).toBeVisible()
    await expect(aside.getByRole('button', { name: '1쪽, 지금 보는 쪽' })).toHaveAttribute('aria-pressed', 'true')
    await page.locator('#row-2-0-0 > button').click()
    await expect(aside.getByRole('button', { name: '2쪽, 지금 보는 쪽' })).toHaveAttribute('aria-pressed', 'true')
    await expect(aside.getByTestId('source-highlight')).toBeVisible()

    // 도안에 적힌 코 수를 틀리게 고치면 바로 오류가 뜨고 넘어갈 수 없습니다.
    await row9.locator('> button').click()
    const expectCount = page.getByLabel('도안에 적힌 코 수')
    await expect(expectCount).toHaveValue('79')
    await expectCount.fill('80')
    await expect(verdict).toContainText('맞지 않는 곳 1곳')
    await expect(row9.locator('> button')).toContainText('맞지 않음 · 도안 80코')
    const todo = page.locator('section', { has: page.getByRole('heading', { name: '확인이 필요한 곳' }) })
    await expect(todo).toContainText('도안에는 80코라고 적혀 있지만 계산하면 79코입니다.')
    await expect(confirm).toBeDisabled()
    await expect(page.locator('#confirm-note')).toContainText('넘어갈 수 없어요')
    // 서버도 같은 판단을 합니다.
    await saved(page)
    expect((await request.post(`${api}/confirm`)).status()).toBe(422)

    // "확인이 필요한 곳"에서 그 단으로 건너가 고칩니다.
    await page.locator('#row-2-2-0 > button').click()
    await todo.getByRole('button', { name: '이 단 보기' }).first().click()
    await expect(row9.locator('> button')).toBeFocused()
    await page.getByLabel('도안에 적힌 코 수').fill('79')
    await expect(verdict).toContainText('코 수 검산 통과')
    await expect(confirm).toBeEnabled()

    // 뜨는 순서에서 조각을 지우면 코가 남는다고 알려 주고, 처음 읽은 대로 되돌릴 수 있습니다.
    await page.getByRole('button', { name: '뜨는 순서 고치기' }).click()
    await page.getByRole('button', { name: '10번 조각 지우기', exact: true }).click()
    await expect(row9).toContainText('단이 끝났는데 2코가 남습니다.')
    await expect(confirm).toBeDisabled()
    await page.getByRole('button', { name: '처음 읽은 대로 되돌리기' }).click()
    await expect(verdict).toContainText('코 수 검산 통과')
    // 코 종류와 횟수도 고칠 수 있습니다.
    await page.getByLabel('10번 조각 횟수', { exact: true }).fill('3')
    await expect(row9).toContainText('남은 코보다 많이 뜨도록 적혀 있습니다.')
    await page.getByLabel('10번 조각 횟수', { exact: true }).fill('2')
    await page.getByLabel('10번 조각 코 종류', { exact: true }).selectOption('p')
    await expect(row9.locator('ol').first()).toContainText('안2')
    await page.getByLabel('10번 조각 코 종류', { exact: true }).selectOption('k')
    await expect(verdict).toContainText('코 수 검산 통과')

    // 묶음을 뜨는 횟수를 고치면 전체 단수가 따라 바뀝니다.
    await page.locator('#row-0-0-0 > button').click()
    const times = page.getByLabel('이 2단 묶음을 뜨는 횟수')
    await expect(times).toHaveValue('4')
    await times.fill('5')
    await expect(page.getByText('3개 구간 · 95단')).toBeVisible()
    await expect(page.locator('#grp-0-0')).toContainText('이 2단을 5번 반복 · 1단부터 10단')
    await times.fill('4')
    await expect(page.getByText('3개 구간 · 93단')).toBeVisible()

    // 3D 모양을 바꾸면 저장됩니다.
    await page.getByLabel('3D 모양').selectOption('flat')
    await saved(page)
    expect(((await (await request.get(api)).json()) as { pattern: { ir: { template: string } } }).pattern.ir.template).toBe('flat')
    await page.getByLabel('3D 모양').selectOption('hood')

    // 길이로 적힌 구간은 노란색이고, 단수를 직접 정하거나 추정으로 되돌릴 수 있습니다.
    const length = page.locator('#grp-1-4')
    await expect(length).toHaveAttribute('data-length', 'true')
    await expect(length).toContainText('게이지로 47단 추정')
    await expect(todo).toContainText('길이로 적힌 구간 (26단부터 72단)')
    // "확인이 필요한 곳"의 칸에 한 글자씩 쳐도 칸이 그대로 있습니다.
    const todoRows = todo.getByLabel('이 구간의 단수')
    await todoRows.click()
    await todoRows.pressSequentially('51')
    await expect(todoRows).toBeFocused()
    await expect(todoRows).toHaveValue('51')
    await expect(length).toContainText('직접 정한 51단')
    await expect(todo).toContainText('확인함')
    await length.getByLabel('이 구간의 단수').fill('49')
    await expect(length).toContainText('직접 정한 49단')
    await expect(todoRows).toHaveValue('49')
    await expect(page.getByText('3개 구간 · 95단')).toBeVisible()
    await expect(todo).toContainText('따로 확인할 곳이 없어요')
    await expect(verdict).not.toContainText('확인 필요')
    await saved(page)
    const rowsOf = async () => ((await (await request.get(api)).json()) as { pattern: { ir: { sections: { groups: { repeat: { rows?: number } }[] }[] } } }).pattern.ir.sections[1].groups[4].repeat.rows
    expect(await rowsOf()).toBe(49)
    await length.getByRole('button', { name: '추정(47단)으로 되돌리기' }).click()
    await expect(length).toContainText('게이지로 47단 추정')
    await saved(page)
    expect(await rowsOf()).toBeUndefined()
    await todo.getByRole('button', { name: '이대로 둘게요' }).click()
    await expect(length).toContainText('직접 정한 47단')
    await expect(page.getByText('3개 구간 · 93단')).toBeVisible()

    // 확인 완료 → 게이지 맞추기
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page).toHaveURL(new RegExp(`/patterns/${uploadedId}/gauge$`))
    const after = (await (await request.get(api)).json()) as { pattern: { status: string; ir: { sections: { groups: { repeat: { rows?: number } }[] }[] } } }
    expect(after.pattern.status).toBe('ready')
    expect(after.pattern.ir.sections[1].groups[4].repeat.rows).toBe(47)
  })

  test('같은 PDF를 다시 올리면 읽어 둔 결과로 간다', async ({ page }) => {
    await page.goto('/upload')
    await page.locator('#pattern-pdf').setInputFiles(PDF)
    await expect(page.getByRole('status').filter({ hasText: '이미 읽은 파일이에요' })).toBeVisible()
    // 이미 확인을 마친 도안이라 게이지 맞추기로 갑니다.
    await expect(page).toHaveURL(new RegExp(`/patterns/${uploadedId}/gauge$`))
  })

  test('휴대폰 너비에서도 가로로 밀리지 않고, 고른 단 아래에 원문이 보인다', async ({ page }) => {
    for (const width of [390, 360]) {
      await page.setViewportSize({ width, height: 844 })
      await page.goto('/upload')
      await expect(page.getByRole('button', { name: '예시 도안으로 둘러보기' })).toBeVisible()
      expect(await noSideScroll(page)).toBe(true)

      await page.goto(`/patterns/${uploadedId}/review`)
      await expect(page.locator('aside')).toBeHidden()
      const row = page.locator('#row-0-1-0')
      await row.locator('> button').click()
      await expect(row.getByTestId('source-highlight')).toBeVisible()
      await row.getByRole('button', { name: '뜨는 순서 고치기' }).click()
      await expect(row.getByLabel('1번 조각 코 종류', { exact: true })).toBeVisible()
      expect(await noSideScroll(page)).toBe(true)
    }
  })

  test('둥글게 뜨는 코바늘 도안 PDF를 올리면 읽어서 확인 화면에 코바늘 도안으로 보여 준다', async ({ page, request }) => {
    await page.goto('/upload')
    await page.locator('#pattern-pdf').setInputFiles(CROCHET_PDF)
    await page.waitForURL(/\/patterns\/[^/]+\/(reading|review)$/)
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/review$/, { timeout: 30_000 })
    const id = idFromUrl(page)
    made.push(id)
    await expect(page.getByTestId('verdict')).toContainText('코 수 검산 통과')
    await expect(page.getByText('코바늘 · 한국식 약어')).toBeVisible()
    await expect(page.getByText('4개 구간 · 49단')).toBeVisible()
    // 조각이 여럿이고, 팔과 귀는 2개씩 만듭니다.
    await expect(page.getByTestId('start-2')).toHaveText('매직링에서 시작 · 2개 만들기')
    // 원문 패널에 PDF의 글이 보입니다.
    await expect(page.getByText('글의 위치를 꺼내지 못했어요')).toHaveCount(0)
    const { pattern } = (await (await request.get(`/api/patterns/${id}`)).json()) as { pattern: { ir: { craft: string; template: string; sections: { id: string; copies?: number }[] } } }
    expect(pattern.ir.craft).toBe('crochet')
    expect(pattern.ir.template).toBe('round')
    expect(pattern.ir.sections.map((s) => [s.id, s.copies ?? 1])).toEqual([['head', 1], ['body', 1], ['arm', 2], ['ear', 2]])
  })

  test('읽는 중 화면은 작업의 단계를 그대로 보여 주고, 읽지 못하면 까닭과 돌아갈 길을 준다', async ({ page, request }) => {
    const me = (await (await request.get('/api/me')).json()) as { canReadPdf: boolean }
    test.skip(me.canReadPdf, 'API 키가 있으면 준비해 둔 응답이 없는 PDF도 실제로 읽으므로 건너뜁니다.')

    // 준비해 둔 응답이 없는 PDF: 연습용 PDF 끝에 한 바이트를 붙여 다른 파일로 만듭니다.
    await page.goto('/upload')
    await page.locator('#pattern-pdf').setInputFiles({ name: '처음 보는 도안.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([readFileSync(PDF), Buffer.from('\n')]) })
    await expect(page).toHaveURL(/\/patterns\/[^/]+\/reading$/)
    const id = idFromUrl(page)
    await expect(page.getByRole('heading', { level: 1, name: '도안을 읽지 못했어요' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'API 키가 필요합니다' })).toBeVisible()
    const stage = (name: string) => page.locator(`li[data-stage="${name}"]`)
    await expect(page.locator('li[data-stage]')).toHaveCount(6)
    await expect(page.locator('li[data-stage]').locator('strong')).toHaveText(['올리기', '글 꺼내기', '구조화', '검산', '되먹임', '확인 준비'])
    await expect(stage('upload')).toHaveAttribute('data-state', 'failed')
    await expect(page.getByRole('link', { name: '도안 올리기로 돌아가기' })).toHaveAttribute('href', '/upload')

    // 진행 중인 단계 표시는 작업 상태 응답을 바꿔 가며 확인합니다. (연습용 PDF는 한 번 읽는 사이에 끝납니다.)
    let job = { stage: 'structure', status: 'running', llmCalls: 1, feedbackRounds: 0 }
    await page.route(`**/api/patterns/${id}/job`, (route) =>
      route.fulfill({ json: { patternStatus: 'reading', title: '처음 보는 도안', job: { id: 'j', verification: null, pages: null, inputTokens: 0, outputTokens: 0, error: null, updatedAt: new Date().toISOString(), ...job } } }),
    )
    await page.reload()
    const now = page.getByTestId('reading-now')
    await expect(now).toHaveAttribute('aria-live', 'polite')
    await expect(now).toHaveText('지금 단계: 구조화 (3/6)')
    await expect(page.getByRole('heading', { level: 1, name: '도안을 읽고 있어요' })).toBeVisible()
    await expect(page.getByText('창을 닫아도 계속 진행돼요', { exact: false })).toBeVisible()
    await expect(stage('upload')).toHaveAttribute('data-state', 'done')
    await expect(stage('extract')).toHaveAttribute('data-state', 'done')
    await expect(stage('structure')).toHaveAttribute('data-state', 'current')
    await expect(stage('verify')).toHaveAttribute('data-state', 'todo')
    await expect(page.getByTestId('llm-calls')).toContainText('LLM 호출 1번')

    job = { stage: 'feedback', status: 'running', llmCalls: 2, feedbackRounds: 1 }
    await expect(now).toHaveText('지금 단계: 되먹임 1회차 (5/6)')
    await expect(stage('verify')).toHaveAttribute('data-state', 'done')
    await expect(stage('feedback')).toHaveAttribute('data-state', 'current')

    // 되먹임 뒤에는 검산으로 돌아갑니다. 되먹임은 끝난 것으로 남습니다.
    job = { stage: 'verify', status: 'running', llmCalls: 3, feedbackRounds: 1 }
    await expect(now).toHaveText('지금 단계: 검산 (4/6)')
    await expect(stage('verify')).toHaveAttribute('data-state', 'current')
    await expect(stage('feedback')).toHaveAttribute('data-state', 'done')
    await expect(stage('feedback')).toContainText('1회차')
    await expect(page.getByTestId('llm-calls')).toContainText('LLM 호출 3번')

    job = { stage: 'review', status: 'running', llmCalls: 3, feedbackRounds: 0 }
    await expect(now).toHaveText('지금 단계: 확인 준비 (6/6)')
    await expect(stage('feedback')).toHaveAttribute('data-state', 'done')

    await page.unroute(`**/api/patterns/${id}/job`)
    await request.delete(`/api/patterns/${id}`)
  })
})
