/**
 * 게이지 맞추기 화면.
 * 기대하는 숫자는 적어 두지 않습니다. 서버에서 받은 IR을 엔진에 넣어 구한 값과 화면을 견줍니다.
 */
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { compareGauge, expand, mapProgress, regauge } from '@stitch/engine'
import type { GaugeSize, Pattern } from '@stitch/pattern-ir'

type View = {
  id: string
  status: string
  gaugeMode: 'unset' | 'as_is' | 'recalc' | 'remeasure'
  versionKind: 'original' | 'gauge' | null
  myGauge: GaugeSize | null
  ir: Pattern
  originalIr: Pattern
}

const fmt = (v: number) => String(Math.round(v * 10) / 10)

async function seed(request: APIRequestContext, sample: 'practice-hood' | 'garter-scarf', confirm = true): Promise<string> {
  const made = await request.post('/api/patterns', { data: { sample } })
  expect(made.status()).toBe(201)
  const { id } = (await made.json()) as { id: string }
  if (confirm) expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBe(true)
  return id
}

async function view(request: APIRequestContext, id: string): Promise<View> {
  const res = await request.get(`/api/patterns/${id}`)
  expect(res.ok()).toBe(true)
  return ((await res.json()) as { pattern: View }).pattern
}

async function setGauge(request: APIRequestContext, id: string, body: { mode: string; gauge: GaugeSize | null }) {
  expect((await request.post(`/api/patterns/${id}/gauge`, { data: body })).ok()).toBe(true)
}

const stitchesBox = (page: Page) => page.getByLabel('가로 10cm 안의 코 수')
const rowsBox = (page: Page) => page.getByLabel('세로 10cm 안의 단 수')
const measureChoice = (page: Page) => page.getByRole('radio', { name: /재서 맞/ })
const skipChoice = (page: Page) => page.getByRole('radio', { name: /재지 않고/ })
const recalcChoice = (page: Page) => page.getByRole('radio', { name: /다시 계산하기/ })
const needleChoice = (page: Page) => page.getByRole('radio', { name: /바늘을 바꿔서/ })
const onWorkScreen = (id: string) => new RegExp(`/patterns/${id}$`)

async function enter(page: Page, mine: GaugeSize) {
  await stitchesBox(page).fill(String(mine.stitches))
  await rowsBox(page).fill(String(mine.rows))
}

/** 화면의 표가 엔진이 준 구간별 숫자와 같은지 */
async function expectTable(page: Page, ir: Pattern, mine: GaugeSize) {
  const r = regauge(ir, mine)
  expect(r.ok).toBe(true)
  const table = page.getByTestId('regauge-table')
  await expect(table.locator(`[data-row="${r.sections[0].id}-start"]`)).toHaveCount(1)
  for (const [i, s] of r.sections.entries()) {
    const body = table.locator(`tbody[data-section="${s.id}"]`)
    await expect(body.locator('th[scope="rowgroup"]')).toHaveText(s.name)
    const rows = body.locator(`[data-row="${s.id}-rows"]`)
    await expect(rows.locator('td').nth(0)).toContainText(`${s.rows.from}단`)
    await expect(rows.locator('td').nth(1)).toContainText(`${s.rows.to}단`)
    for (const [key, v] of [
      ['start', s.start],
      ['end', s.end],
    ] as const) {
      const row = body.locator(`[data-row="${s.id}-${key}"]`)
      if ((await row.count()) === 0) continue
      await expect(row.locator('td').nth(0)).toHaveText(`${v.from}코`)
      await expect(row.locator('td').nth(1)).toHaveText(`${v.to}코`)
    }
    // 길이로 적힌 구간은 길이가 그대로이고 예상 단수만 바뀐다고 적혀 있습니다.
    const byLength = ir.sections[i].groups.some((g) => 'until_cm' in g.repeat)
    await expect(body.getByText('예상 단수만 바뀜')).toHaveCount(byLength ? 1 : 0)
  }
  if (r.width.pattern !== undefined && r.width.recalculated !== undefined) {
    const row = table.locator('[data-row="width"]')
    await expect(row.locator('td').nth(0)).toHaveText(`${fmt(r.width.pattern)}cm`)
    await expect(row.locator('td').nth(1)).toHaveText(`${fmt(r.width.recalculated)}cm`)
  }
  return r
}

test.describe('게이지 맞추기', () => {
  test('두 선택지는 같은 크기이고, 재지 않고 뜨면 도안 숫자 그대로 작업 화면으로 간다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const before = await view(request, id)
    expect(before).toMatchObject({ status: 'ready', gaugeMode: 'unset' })

    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByRole('heading', { level: 1, name: '내 게이지에 맞추기' })).toBeVisible()
    await expect(page.locator('#main')).toBeVisible()

    const a = await page.locator('label', { has: measureChoice(page) }).boundingBox()
    const b = await page.locator('label', { has: skipChoice(page) }).boundingBox()
    expect(Math.abs(a!.width - b!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(a!.height - b!.height)).toBeLessThanOrEqual(1)

    await skipChoice(page).check()
    const panel = page.getByRole('region', { name: '도안 숫자 그대로 페이지를 만들어요' })
    const g = before.originalIr.gauge!
    await expect(panel).toContainText(`${fmt(g.stitches)}코 × ${fmt(g.rows)}단`)
    await expect(panel).toContainText(`${before.originalIr.sections[0].start.count}코`)
    await expect(panel).toContainText('뜨던 편물의 평평한 곳에서 10cm를 재서 넣어도 됩니다')

    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: null })
  })

  test('칸의 숫자를 건드리지 않고 넘어가면 잰 것으로 적지 않고, 뒤로 돌아오면 저장한 상태가 보인다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const base = (await view(request, id)).originalIr.gauge!

    await page.goto(`/patterns/${id}/gauge`)
    await expect(measureChoice(page)).toBeChecked()
    await expect(stitchesBox(page)).toHaveValue(fmt(base.stitches))
    await expect(rowsBox(page)).toHaveValue(fmt(base.rows))
    await expect(page.getByTestId('verdict')).toContainText('잰 숫자로 바꿔 주세요')
    await expect(recalcChoice(page)).toHaveCount(0)

    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: null })

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}/gauge$`))
    await expect(page.getByTestId('current-state')).toContainText('재지 않고 도안 숫자 그대로 뜨고 있어요')
    await expect(skipChoice(page)).toBeChecked()
    await expect(page.getByRole('link', { name: '바꾸지 않고 작업 화면으로' })).toBeVisible()
    await expect(page.getByText('저장하는 중')).toHaveCount(0)
  })

  test('다시 들어오면 지금 상태가 보이고, 숫자를 넣으면 엔진의 결과가 바로 보이며, 다시 계산으로 저장하고 되돌릴 수 있다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await setGauge(request, id, { mode: 'as_is', gauge: null })
    const v = await view(request, id)
    const ir = v.originalIr
    const base = ir.gauge!
    // 도안보다 촘촘한 게이지. 숫자는 도안 게이지에서 만들어 씁니다(연습용 후드에서는 20 × 28).
    const mine = { stitches: base.stitches + 2, rows: base.rows + 4 }

    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByTestId('current-state')).toContainText('재지 않고 도안 숫자 그대로 뜨고 있어요')
    await expect(skipChoice(page)).toBeChecked()
    await expect(page.getByRole('link', { name: '바꾸지 않고 작업 화면으로' })).toHaveAttribute('href', `/patterns/${id}`)

    await measureChoice(page).check()
    await expect(page.getByTestId('pattern-gauge')).toContainText(`${fmt(base.stitches)}코 × ${fmt(base.rows)}단`)
    await expect(page.getByTestId('pattern-gauge')).toContainText(`${base.in_stitch}, ${fmt(base.tool_mm)}mm 바늘`)
    await expect(page.getByText('뜨던 편물의 평평한 곳에서 10cm를 재서 넣어도 됩니다')).toBeVisible()
    await expect(page.getByTestId('verdict')).toContainText('잰 숫자로 바꿔 주세요')

    await enter(page, mine)
    const cmp = compareGauge(base, mine)
    expect(cmp.same).toBe(false)
    await expect(page.getByTestId('my-gauge')).toHaveText(`${mine.stitches}코 × ${mine.rows}단`)
    await expect(page.getByTestId('verdict')).toContainText(`코가 ${cmp.stitchPct}% 더 ${cmp.tighter ? '촘촘해요' : '느슨해요'}`)
    const r = await expectTable(page, ir, mine)
    await expect(page.getByTestId('verdict')).toContainText(`${fmt(r.width.asIs!)}cm로 ${cmp.tighter ? '작게' : '크게'} 나와요`)

    // 완성 가로 세 가지와 막대 길이
    const widest = Math.max(r.width.pattern!, r.width.asIs!, r.width.recalculated!)
    for (const [key, value] of [
      ['pattern', r.width.pattern!],
      ['asis', r.width.asIs!],
      ['new', r.width.recalculated!],
    ] as const) {
      const row = page.getByTestId(`width-${key}`)
      await expect(row).toContainText(`${fmt(value)}cm`)
      // 막대는 셋 가운데 가장 넓은 것을 가득 채운 길이로 놓고 그 비율로 그립니다.
      const share = () => row.locator('[data-tone]').first().evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width)
      await expect.poll(async () => Math.abs((await share()) - value / widest)).toBeLessThan(0.01)
    }
    await expect(page.getByTestId('height-note')).toContainText(mine.rows > base.rows ? '짧아져요' : '길어져요')

    // 한 코 늘리면 바로 다시 계산됩니다.
    const more = { stitches: mine.stitches + 1, rows: mine.rows }
    await page.getByRole('button', { name: '코 수 늘리기' }).click()
    await expect(stitchesBox(page)).toHaveValue(String(more.stitches))
    await expect(page.getByTestId('verdict')).toContainText(`코가 ${compareGauge(base, more).stitchPct}% 더`)
    await expectTable(page, ir, more)
    await page.getByRole('button', { name: '코 수 줄이기' }).click()
    await expectTable(page, ir, mine)

    await expect(recalcChoice(page)).toBeChecked()
    await page.getByRole('button', { name: '이 코 수로 바꾸기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    const saved = await view(request, id)
    expect(saved).toMatchObject({ gaugeMode: 'recalc', versionKind: 'gauge', myGauge: mine })
    expect(saved.ir.sections.map((s) => s.start.count)).toEqual(r.sections.map((s) => s.start.to))
    expect(saved.originalIr).toEqual(ir)

    // 다시 들어오면 다시 계산한 상태가 보이고, 도안 숫자로 돌아갈 수 있습니다.
    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByTestId('current-state')).toContainText(`내 게이지(${mine.stitches}코 × ${mine.rows}단)에 맞춰 다시 계산한 숫자로 뜨고 있어요`)
    await expect(measureChoice(page)).toBeChecked()
    await expect(stitchesBox(page)).toHaveValue(String(mine.stitches))
    await expect(rowsBox(page)).toHaveValue(String(mine.rows))
    await expect(recalcChoice(page)).toBeChecked()
    await expectTable(page, ir, mine)
    await expect(page.getByRole('link', { name: '바꾸지 않고 작업 화면으로' })).toBeVisible()

    await skipChoice(page).check()
    await page.getByRole('button', { name: '도안 숫자 그대로 뜨기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    const back = await view(request, id)
    expect(back).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: null })
    expect(back.ir).toEqual(ir)
  })

  test('바늘을 바꿔 다시 재기로 하면 도안 숫자는 그대로 두고 그 상태를 기억한다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const ir = (await view(request, id)).originalIr
    const base = ir.gauge!
    const tight = { stitches: base.stitches + 2, rows: base.rows + 4 }
    const loose = { stitches: base.stitches - 2, rows: base.rows - 3 }

    await page.goto(`/patterns/${id}/gauge`)
    await expect(measureChoice(page)).toBeChecked()

    await enter(page, loose)
    expect(compareGauge(base, loose)).toMatchObject({ same: false, tighter: false })
    await expect(page.locator('label', { has: needleChoice(page) })).toContainText('더 가는 바늘')

    await enter(page, tight)
    expect(compareGauge(base, tight)).toMatchObject({ same: false, tighter: true })
    const advice = page.locator('label', { has: needleChoice(page) })
    await expect(advice).toContainText('더 굵은 바늘')
    // 굵기 제안은 도안 바늘에서 0.5mm 단위로 옮긴 값입니다.
    const suggested = /\((\d+(?:\.\d+)?)mm쯤\)/.exec((await advice.textContent()) ?? '')
    expect(suggested).not.toBeNull()
    const mm = Number(suggested![1])
    expect(mm).toBeGreaterThan(base.tool_mm)
    expect((mm * 2) % 1).toBe(0)

    await needleChoice(page).check()
    await page.getByRole('button', { name: '스와치를 다시 뜨고 올게요' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    const saved = await view(request, id)
    expect(saved).toMatchObject({ gaugeMode: 'remeasure', versionKind: 'original', myGauge: tight })
    expect(saved.ir).toEqual(ir)

    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByTestId('current-state')).toContainText('바늘을 바꿔 스와치를 다시 뜨기로 했어요')
    await expect(page.getByTestId('current-state')).toContainText(`${tight.stitches}코 × ${tight.rows}단`)
    await expect(needleChoice(page)).toBeChecked()

    // 새로 재 보니 도안과 같아졌다면 도안 숫자 그대로 뜹니다.
    await enter(page, { stitches: base.stitches, rows: base.rows })
    await expect(page.getByTestId('verdict')).toContainText('코 너비가 도안과 거의 같아요')
    await page.getByRole('button', { name: '도안 숫자 그대로 뜨기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: { stitches: base.stitches, rows: base.rows } })
  })

  test('키보드만으로 선택지와 숫자 단추를 쓰고 저장한다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const ir = (await view(request, id)).originalIr
    const base = ir.gauge!

    await page.goto(`/patterns/${id}/gauge`)
    await measureChoice(page).focus()

    // 방향키로 두 선택지를 오갑니다.
    await page.keyboard.press('ArrowRight')
    await expect(skipChoice(page)).toBeChecked()
    await expect(page.getByRole('heading', { name: '도안 숫자 그대로 페이지를 만들어요' })).toBeVisible()
    await page.keyboard.press('ArrowLeft')
    await expect(measureChoice(page)).toBeChecked()

    // Tab: 줄이기 단추 → 숫자 칸 → 늘리기 단추
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '코 수 줄이기' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(stitchesBox(page)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await expect(stitchesBox(page)).toHaveValue(fmt(base.stitches + 2))
    await page.keyboard.press('ArrowDown')
    await expect(stitchesBox(page)).toHaveValue(fmt(base.stitches + 1))
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '코 수 늘리기' })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(stitchesBox(page)).toHaveValue(fmt(base.stitches + 3))

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '단 수 줄이기' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(rowsBox(page)).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '단 수 늘리기' })).toBeFocused()
    await page.keyboard.press('Space')
    await page.keyboard.press('Enter')
    await expect(rowsBox(page)).toHaveValue(fmt(base.rows + 2))

    const mine = { stitches: base.stitches + 3, rows: base.rows + 2 }
    await expectTable(page, ir, mine)

    // Tab: 맞추는 방법. 방향키로 바늘 바꾸기와 다시 계산을 오갑니다.
    await page.keyboard.press('Tab')
    await expect(recalcChoice(page)).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(needleChoice(page)).toBeChecked()
    await expect(page.getByRole('button', { name: '스와치를 다시 뜨고 올게요' })).toBeVisible()
    await page.keyboard.press('ArrowUp')
    await expect(recalcChoice(page)).toBeChecked()

    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: '이 코 수로 페이지 만들기' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'recalc', versionKind: 'gauge', myGauge: mine })
  })

  test('게이지가 도안과 같으면 같다고 알려 주고 다시 계산을 내놓지 않는다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const base = (await view(request, id)).originalIr.gauge!
    const same = { stitches: base.stitches, rows: base.rows }
    expect(compareGauge(base, same).same).toBe(true)

    await page.goto(`/patterns/${id}/gauge`)
    // 다른 숫자를 넣었다가 도안과 같은 숫자로 고칩니다.
    await enter(page, { stitches: base.stitches + 3, rows: base.rows + 3 })
    await expect(recalcChoice(page)).toBeChecked()
    await enter(page, same)

    await expect(page.getByTestId('verdict')).toContainText('코 너비가 도안과 거의 같아요')
    await expect(page.getByTestId('verdict')).toContainText('그대로 떠도 가로 크기가 거의 같게 나와요')
    await expect(recalcChoice(page)).toHaveCount(0)
    await expect(needleChoice(page)).toHaveCount(0)
    await expect(page.getByTestId('regauge-table')).toHaveCount(0)
    await expect(page.getByTestId('width-new')).toHaveCount(0)
    await expect(page.getByRole('radio', { name: /도안 숫자 그대로 뜨기/ })).toBeChecked()

    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: same })
  })

  test('엔진의 검산을 통과하지 못하는 게이지에서는 까닭을 보여 주고 바늘 바꾸기만 안내한다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const ir = (await view(request, id)).originalIr
    const base = ir.gauge!
    // 넣을 수 있는 범위 안에서 엔진이 통과시키지 않는 게이지를 찾습니다.
    let bad: GaugeSize | null = null
    for (let stitches = 4; stitches <= 60 && !bad; stitches++) {
      const mine = { stitches, rows: base.rows }
      if (!regauge(ir, mine).ok) bad = mine
    }
    test.skip(!bad, '이 도안은 범위 안의 모든 게이지에서 다시 계산을 통과합니다.')
    const failed = regauge(ir, bad!)

    await page.goto(`/patterns/${id}/gauge`)
    await enter(page, bad!)
    await expect(page.getByTestId('regauge-reason')).toContainText(failed.reason!)
    await expect(recalcChoice(page)).toHaveCount(0)
    await expect(page.getByTestId('regauge-table')).toHaveCount(0)
    await expect(needleChoice(page)).toBeChecked()

    await page.getByRole('button', { name: '스와치를 다시 뜨고 올게요' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'remeasure', versionKind: 'original', myGauge: bad })
  })

  test('서버가 거절하면 까닭을 그 자리에 보여 준다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const base = (await view(request, id)).originalIr.gauge!
    const message = '다시 계산한 숫자가 검산을 통과하지 못했습니다. 바늘을 바꿔 게이지를 맞춰 주세요.'
    await page.route('**/api/patterns/*/gauge', (route) =>
      route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ error: { code: 'regauge_failed', message } }) }),
    )

    await page.goto(`/patterns/${id}/gauge`)
    await enter(page, { stitches: base.stitches + 2, rows: base.rows + 4 })
    await page.getByRole('button', { name: '이 코 수로 페이지 만들기' }).click()
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}/gauge$`))
    await expect(page.getByRole('button', { name: '이 코 수로 페이지 만들기' })).toBeEnabled()
    expect((await view(request, id)).gaugeMode).toBe('unset')
  })

  test('숫자 칸은 소수를 받고 범위를 넘으면 범위 끝으로 맞춘다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    const base = (await view(request, id)).originalIr.gauge!
    await page.goto(`/patterns/${id}/gauge`)

    await stitchesBox(page).fill(`${base.stitches}.5`)
    await expect(page.getByTestId('my-gauge')).toContainText(`${base.stitches}.5코`)
    await stitchesBox(page).fill(`${base.stitches},5코`)
    await expect(stitchesBox(page)).toHaveValue(`${base.stitches}.5`)

    await stitchesBox(page).fill('500')
    await rowsBox(page).focus()
    const max = Number(await stitchesBox(page).getAttribute('aria-valuemax'))
    await expect(stitchesBox(page)).toHaveValue(String(max))
    await expect(page.getByTestId('my-gauge')).toContainText(`${max}코`)

    // 비우면 도안 게이지로 돌아가고, 단추는 거기서부터 움직입니다.
    await stitchesBox(page).fill('')
    await expect(page.getByTestId('my-gauge')).toContainText(`${fmt(base.stitches)}코`)
    await page.getByRole('button', { name: '코 수 줄이기' }).click()
    await expect(stitchesBox(page)).toHaveValue(fmt(base.stitches - 1))
  })

  test('재기를 권하는 말은 크기가 맞아야 하는 도안에만 띄운다', async ({ page, request }) => {
    const hood = await seed(request, 'practice-hood')
    const scarf = await seed(request, 'garter-scarf')
    expect((await view(request, hood)).originalIr.template).toBe('hood')
    expect((await view(request, scarf)).originalIr.template).toBe('flat')

    await page.goto(`/patterns/${hood}/gauge`)
    await expect(measureChoice(page)).toBeChecked()
    await expect(page.getByRole('radio', { name: /권해요/ })).toHaveCount(1)

    await page.goto(`/patterns/${scarf}/gauge`)
    await expect(skipChoice(page)).toBeChecked()
    await expect(page.getByText('권해요')).toHaveCount(0)
    await measureChoice(page).check()
    await expect(page.getByText('권해요')).toHaveCount(0)
    // 길이를 재며 뜨는 도안은 세로가 그대로라고 알려 줍니다.
    const ir = (await view(request, scarf)).originalIr
    const mine = { stitches: ir.gauge!.stitches + 2, rows: ir.gauge!.rows + 4 }
    await enter(page, mine)
    await expectTable(page, ir, mine)
  })

  test('게이지가 없는 도안은 도안 숫자 그대로만 뜰 수 있다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood', false)
    const ir = (await view(request, id)).originalIr
    // 게이지를 지우고, 길이로 적힌 구간에는 지금 펼쳐진 단수를 직접 적어 둡니다.
    const rowsIn = new Map<string, number>()
    for (const row of expand(ir).blocks.flatMap((b) => b.rows)) {
      const key = `${row.ref.section}:${row.ref.group}`
      rowsIn.set(key, (rowsIn.get(key) ?? 0) + 1)
    }
    const noGauge: Pattern = structuredClone(ir)
    noGauge.gauge = null
    noGauge.sections.forEach((s, si) =>
      s.groups.forEach((g, gi) => {
        if ('until_cm' in g.repeat) g.repeat.rows = rowsIn.get(`${si}:${gi}`) ?? 0
      }),
    )
    const put = await request.put(`/api/patterns/${id}/ir`, { data: noGauge })
    expect(((await put.json()) as { verification: { ok: boolean } }).verification.ok).toBe(true)
    expect((await request.post(`/api/patterns/${id}/confirm`)).ok()).toBe(true)

    await page.goto(`/patterns/${id}/gauge`)
    await expect(measureChoice(page)).toBeDisabled()
    await expect(skipChoice(page)).toBeChecked()
    await expect(page.getByTestId('no-gauge')).toContainText('게이지가 적혀 있지 않아요')
    await expect(stitchesBox(page)).toHaveCount(0)
    await page.getByRole('button', { name: '도안 숫자 그대로 페이지 만들기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    expect(await view(request, id)).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: null })
  })

  test('기록이 있으면 버전이 바뀔 때 같은 구간, 같은 비율 위치로 옮긴다고 알려 준다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood')
    await setGauge(request, id, { mode: 'as_is', gauge: null })
    const ir = (await view(request, id)).originalIr
    const base = ir.gauge!
    const total = expand(ir).totalRows
    const at = { row: Math.round(total / 2), stitch: 3 }
    expect((await request.post(`/api/patterns/${id}/progress`, { data: at })).status()).toBe(201)
    expect((await request.post(`/api/patterns/${id}/rings`, { data: { row: at.row, x: 2, color: '#c2410c' } })).ok()).toBe(true)

    await page.goto(`/patterns/${id}/gauge`)
    await expect(page.getByTestId('move-notice')).toHaveCount(0)
    await measureChoice(page).check()
    // 도안 숫자 그대로라면 버전이 바뀌지 않으니 알릴 것이 없습니다.
    await expect(page.getByTestId('move-notice')).toHaveCount(0)

    const mine = { stitches: base.stitches + 2, rows: base.rows + 4 }
    await enter(page, mine)
    await expect(recalcChoice(page)).toBeChecked()
    await expect(page.getByTestId('move-notice')).toContainText('기록 1개와 단수링 1개는 새 숫자의 같은 구간, 같은 비율 위치로 옮겨져요')
    await needleChoice(page).check()
    await expect(page.getByTestId('move-notice')).toHaveCount(0)
    await recalcChoice(page).check()

    await page.getByRole('button', { name: '이 코 수로 바꾸기' }).click()
    await expect(page).toHaveURL(onWorkScreen(id))
    const r = regauge(ir, mine)
    const moved = mapProgress(expand(ir), expand(r.pattern!), at)
    const entries = ((await (await request.get(`/api/patterns/${id}/progress`)).json()) as { entries: { row: number; stitch: number }[] }).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject(moved)

    // 도안 숫자로 돌아갈 때도 옮겨진다고 알려 줍니다.
    await page.goto(`/patterns/${id}/gauge`)
    await skipChoice(page).check()
    await expect(page.getByTestId('move-notice')).toBeVisible()
  })

  test('확인을 마치지 않은 도안은 확인 화면으로 보내고, 없는 도안은 404다', async ({ page, request }) => {
    const id = await seed(request, 'practice-hood', false)
    expect((await view(request, id)).status).toBe('needs_review')
    await page.goto(`/patterns/${id}/gauge`)
    await expect(page).toHaveURL(new RegExp(`/patterns/${id}/review$`))

    const missing = await page.goto('/patterns/does-not-exist/gauge')
    expect(missing?.status()).toBe(404)
  })
})
