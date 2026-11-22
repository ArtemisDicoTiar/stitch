import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

/**
 * 마네킹 꾸미기 (/mannequin).
 * 골라 보기는 누구나 되고, 저장은 플러스만 되며, 그 판단은 서버가 합니다.
 */

// 헤드리스 크롬에서도 3D(WebGL)가 그려지게 소프트웨어 렌더러를 켭니다.
test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })
// 사용자 한 명의 플랜과 저장 값을 함께 쓰므로 차례대로 돕니다.
test.describe.configure({ mode: 'serial' })

type Avatar = { face: string; skin: string; hair: string; glasses: string }
type AvatarState = { plan: 'free' | 'plus'; saved: Avatar | null; effective: Avatar }

const DEFAULT: Avatar = { face: 'default', skin: 'gray', hair: 'none', glasses: 'none' }
const STYLED: Avatar = { face: 'round', skin: 'tone2', hair: 'bangs', glasses: 'round' }
const PARTS = ['face', 'skin', 'hair', 'glasses'] as const
const GROUPS: Record<(typeof PARTS)[number], string> = { face: '얼굴형', skin: '피부 톤', hair: '머리', glasses: '안경' }

async function setPlan(request: APIRequestContext, plan: 'free' | 'plus') {
  const res = await request.post('/api/billing', { data: { plan } })
  expect(res.ok()).toBeTruthy()
}
async function avatarState(request: APIRequestContext): Promise<AvatarState> {
  const res = await request.get('/api/avatar')
  expect(res.ok()).toBeTruthy()
  return res.json()
}
/** 무료 플랜, 기본 모습으로 돌려놓습니다. (기본 모습은 무료에서도 저장됩니다.) */
async function reset(request: APIRequestContext) {
  await setPlan(request, 'free')
  const res = await request.put('/api/avatar', { data: DEFAULT })
  expect(res.ok()).toBeTruthy()
}

const group = (page: Page, part: (typeof PARTS)[number]) => page.getByRole('group', { name: GROUPS[part], exact: true })
const option = (page: Page, part: (typeof PARTS)[number], id: string) => group(page, part).locator(`input[type=radio][value="${id}"]`)

async function pick(page: Page, avatar: Avatar) {
  for (const part of PARTS) await option(page, part, avatar[part]).check()
}
async function expectPicked(page: Page, avatar: Avatar) {
  for (const part of PARTS) await expect(option(page, part, avatar[part])).toBeChecked()
}

/** 화면을 열고 미리보기가 준비되거나 쓸 수 없다고 정해질 때까지 기다립니다. 3D가 그려졌으면 true */
async function open(page: Page): Promise<boolean> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/mannequin')
  await expect(page.getByRole('heading', { level: 1, name: '마네킹 꾸미기' })).toBeVisible()
  const preview = page.getByTestId('preview')
  await expect(preview).not.toHaveAttribute('data-preview', 'loading', { timeout: 30_000 })
  return (await preview.getAttribute('data-preview')) === 'ready'
}

/**
 * 미리보기 가운데(마네킹이 그려지는 곳)만 찍습니다.
 * 위에 겹쳐 놓은 표시와 버튼은 뺍니다. 그것들이 바뀐 것을 3D가 바뀐 것으로 잘못 보지 않기 위해서입니다.
 */
async function shootModel(page: Page): Promise<Buffer> {
  await page.evaluate(() => window.scrollTo(0, 0))
  const box = await page.getByTestId('preview').boundingBox()
  const viewport = page.viewportSize()
  if (!box || !viewport) throw new Error('미리보기의 자리를 알 수 없습니다.')
  const clip = { x: box.x + 70, y: box.y + 80, width: box.width - 160, height: 380 }
  expect(clip.width).toBeGreaterThan(200)
  expect(clip.y + clip.height).toBeLessThanOrEqual(Math.min(viewport.height, box.y + box.height - 80))
  return page.screenshot({ clip })
}
/**
 * 두 그림에서 눈에 띄게 다른 점의 수.
 * 바탕 그라데이션은 다시 칠해질 때 한 단계(1/255)씩 흔들릴 수 있어서, 그 정도 차이는 세지 않습니다.
 */
async function differingPixels(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const load = (base64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('그림을 읽지 못했습니다.'))
          img.src = `data:image/png;base64,${base64}`
        })
      const [one, two] = [await load(first), await load(second)]
      if (one.width !== two.width || one.height !== two.height) return one.width * one.height
      const canvas = document.createElement('canvas')
      canvas.width = one.width
      canvas.height = one.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('그림을 비교할 수 없습니다.')
      const read = (img: HTMLImageElement) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const d1 = read(one)
      const d2 = read(two)
      let count = 0
      for (let i = 0; i < d1.length; i += 4) {
        if (Math.abs(d1[i] - d2[i]) > 16 || Math.abs(d1[i + 1] - d2[i + 1]) > 16 || Math.abs(d1[i + 2] - d2[i + 2]) > 16) count += 1
      }
      return count
    },
    [a.toString('base64'), b.toString('base64')] as const,
  )
}
/** 이만큼은 달라야 3D가 바뀐 것으로 봅니다 (찍는 곳은 약 14만 점). */
const CHANGED = 150
/** 이보다 적게 다르면 같은 그림으로 봅니다. */
const SAME = 10

/** 마네킹 그림이 앞의 것과 눈에 띄게 달라질 때까지 기다립니다. */
async function expectModelChanged(page: Page, before: Buffer) {
  await expect.poll(async () => differingPixels(page, before, await shootModel(page)), { timeout: 10_000 }).toBeGreaterThan(CHANGED)
}
/** 마네킹 그림이 주어진 것과 같아질 때까지 기다립니다. */
async function expectModelSame(page: Page, expected: Buffer) {
  await expect.poll(async () => differingPixels(page, expected, await shootModel(page)), { timeout: 10_000 }).toBeLessThan(SAME)
}
/** 아무것도 바꾸지 않으면 그림이 그대로인지 (비교가 믿을 만한지) 확인하고 그 그림을 돌려줍니다. */
async function settledModel(page: Page): Promise<Buffer> {
  let last = await shootModel(page)
  await expect
    .poll(
      async () => {
        const next = await shootModel(page)
        const diff = await differingPixels(page, last, next)
        last = next
        return diff
      },
      { timeout: 10_000 },
    )
    .toBeLessThan(SAME)
  return last
}

test.beforeEach(async ({ request }) => {
  await reset(request)
})
test.afterAll(async ({ request }) => {
  await reset(request)
})

test('골라 보기는 누구나 되고 저장은 플러스만 된다', async ({ page, request }) => {
  const before = (await avatarState(request)).saved
  const live3d = await open(page)
  const save = page.getByRole('button', { name: '저장하기' })

  await expect(page.getByTestId('plan-chip')).toHaveText('무료 플랜')
  await expect(page.getByText('골라 보는 것은 무료이고, 저장은 플러스에서 됩니다.')).toBeVisible()
  for (const part of PARTS) await expect(group(page, part)).toBeVisible()
  // 플러스 항목에는 글자로 된 표시가 붙고, 피부 톤은 색과 함께 이름이 보입니다.
  await expect(group(page, 'face').getByRole('radio', { name: '둥근형 플러스' })).toBeVisible()
  await expect(group(page, 'skin').getByText('따뜻한 톤')).toBeVisible()
  await expectPicked(page, DEFAULT)
  await expect(save).toBeDisabled()

  // 플러스 항목을 골라 봅니다. 미리보기가 바로 바뀝니다.
  const plain = live3d ? await settledModel(page) : null
  await pick(page, STYLED)
  if (plain) {
    await expectModelChanged(page, plain)
    await expect(page.getByTestId('preview-badge')).toContainText('아직 저장 전')
  }
  await expect(page.getByTestId('save-title')).toHaveText('플러스 항목 4개를 미리 보는 중이에요')
  await expect(save).toBeEnabled()

  // 무료에서 저장: 서버가 거절하고, 화면은 설명과 요금제 링크를 보여 줍니다. 저장된 것은 없습니다.
  await save.click()
  const notice = page.getByTestId('plus-required')
  await expect(notice).toBeVisible()
  await expect(notice.getByRole('link')).toHaveAttribute('href', '/pricing')
  expect((await avatarState(request)).saved).toEqual(before)
  await expectPicked(page, STYLED)

  // 플러스로 바꾼 뒤에는 같은 버튼으로 저장됩니다. (화면이 알던 플랜이 아니라 서버가 판단합니다.)
  await setPlan(request, 'plus')
  await save.click()
  await expect(page.getByTestId('save-status')).toHaveText('저장했어요')
  await expect(notice).toBeHidden()
  await expect(page.getByTestId('plan-chip')).toHaveText('플러스 사용 중')
  await expect(save).toBeDisabled()
  expect(await avatarState(request)).toEqual({ plan: 'plus', saved: STYLED, effective: STYLED })

  // 다시 열면 저장한 모습에서 시작합니다.
  await page.reload()
  await expectPicked(page, STYLED)
  await expect(page.getByTestId('lapsed-note')).toHaveCount(0)

  // 플러스를 그만두면: 저장한 값은 남고, 다른 화면에서는 기본 모습으로 보입니다.
  await setPlan(request, 'free')
  await page.reload()
  await expect(page.getByTestId('lapsed-note')).toBeVisible()
  await expect(page.getByTestId('lapsed-note')).toContainText('기본 모습')
  await expectPicked(page, STYLED)
  expect(await avatarState(request)).toEqual({ plan: 'free', saved: STYLED, effective: DEFAULT })
})

test('모자 벗은 모습, 보는 방향, 기본 모습으로', async ({ page }) => {
  const live3d = await open(page)
  test.skip(!live3d, '이 환경에서는 WebGL을 쓸 수 없어 3D 조작을 확인하지 않습니다.')
  const hoodOn = page.getByRole('button', { name: '모자 쓴 모습' })
  const hoodOff = page.getByRole('button', { name: '모자 벗은 모습' })

  // 모자를 벗기면 편물이 사라집니다.
  await expect(hoodOn).toHaveAttribute('aria-pressed', 'true')
  const worn = await settledModel(page)
  await hoodOff.click()
  await expect(hoodOff).toHaveAttribute('aria-pressed', 'true')
  await expect(hoodOn).toHaveAttribute('aria-pressed', 'false')
  await expectModelChanged(page, worn)

  // 꾸미기 값 하나하나가 그림을 바꿉니다 (모자를 벗은 채로).
  let before = await settledModel(page)
  for (const part of PARTS) {
    await option(page, part, STYLED[part]).check()
    await expectModelChanged(page, before)
    before = await settledModel(page)
  }

  // 보는 방향, 확대, 처음 보기
  await page.getByRole('button', { name: '옆에서 보기' }).click()
  await expectModelChanged(page, before)
  before = await settledModel(page)
  await page.getByRole('button', { name: '확대' }).click()
  await expectModelChanged(page, before)
  before = await settledModel(page)
  await page.getByRole('button', { name: '처음 보기로' }).click()
  await expectModelChanged(page, before)

  // 모자를 다시 씌우면 처음과 다른(꾸민) 모습으로 돌아옵니다.
  before = await settledModel(page)
  await hoodOn.click()
  await expectModelChanged(page, before)
  expect(await differingPixels(page, worn, await settledModel(page))).toBeGreaterThan(CHANGED)

  // "기본 모습으로"를 누르면 모두 무료 항목으로 돌아가고, 그림도 처음과 같아집니다.
  await page.getByRole('button', { name: '기본 모습으로' }).click()
  await expectPicked(page, DEFAULT)
  await expect(page.getByTestId('save-title')).toHaveText('기본 모습이에요')
  await expectModelSame(page, worn)
})

test('키보드만으로 묶음마다 고르고 저장까지 간다', async ({ page }) => {
  await open(page)
  const focusedName = () => page.evaluate(() => (document.activeElement instanceof HTMLInputElement ? document.activeElement.name : ''))

  // Tab으로 첫 묶음(얼굴형)까지 갑니다.
  for (let i = 0; i < 40 && (await focusedName()) !== 'face'; i++) await page.keyboard.press('Tab')
  expect(await focusedName()).toBe('face')

  // 묶음 안에서는 화살표 키로 고르고, Tab으로 다음 묶음으로 갑니다.
  const second: Avatar = { face: 'round', skin: 'tone1', hair: 'bangs', glasses: 'round' }
  for (const part of PARTS) {
    expect(await focusedName()).toBe(part)
    await page.keyboard.press('ArrowRight')
    await expect(option(page, part, second[part])).toBeChecked()
    await expect(option(page, part, second[part])).toBeFocused()
    await page.keyboard.press('Tab')
  }
  await expectPicked(page, second)
  await page.keyboard.press('ArrowLeft') // 묶음 밖에서는 아무것도 바뀌지 않습니다.
  await expectPicked(page, second)

  // 저장 버튼까지 Tab으로 가서 Enter. 무료 플랜이라 설명이 나옵니다.
  const save = page.getByRole('button', { name: '저장하기' })
  for (let i = 0; i < 6 && !(await save.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(save).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('plus-required')).toBeVisible()
})

test('WebGL을 쓸 수 없어도 고르기와 저장이 된다', async ({ page, request }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (String(type).includes('webgl')) return null
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest)
    } as typeof original
  })
  const live3d = await open(page)
  expect(live3d).toBe(false)

  const fallback = page.getByTestId('preview-fallback')
  await expect(fallback).toContainText('이 기기에서는 3D 미리보기를 쓸 수 없어요')
  await pick(page, STYLED)
  await expect(fallback).toContainText('머리 앞머리')

  const save = page.getByRole('button', { name: '저장하기' })
  await save.click()
  await expect(page.getByTestId('plus-required')).toBeVisible()
  await setPlan(request, 'plus')
  await save.click()
  await expect(page.getByTestId('save-status')).toHaveText('저장했어요')
  expect((await avatarState(request)).saved).toEqual(STYLED)
})

for (const size of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
]) {
  test(`휴대폰 너비 ${size.width}px: 미리보기가 위, 가로 스크롤 없음`, async ({ page }) => {
    await page.setViewportSize(size)
    await open(page)
    await pick(page, STYLED)
    await page.getByRole('button', { name: '저장하기' }).click()
    await expect(page.getByTestId('plus-required')).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)

    await page.evaluate(() => window.scrollTo(0, 0))
    const preview = await page.getByTestId('preview').boundingBox()
    const options = await group(page, 'face').boundingBox()
    expect(preview).not.toBeNull()
    expect(options).not.toBeNull()
    if (!preview || !options) return
    expect(preview.y + preview.height).toBeLessThanOrEqual(options.y)
    // 붙어 있는 미리보기가 화면을 다 차지하지 않습니다.
    expect(preview.height).toBeLessThan(size.height * 0.55)
  })
}
