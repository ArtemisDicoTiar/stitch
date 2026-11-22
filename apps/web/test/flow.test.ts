/**
 * 서버 쪽 흐름 테스트: 올리기 → 읽기 → 확인 → 게이지 → 기록 → 단수링 → 지우기.
 * 내장형 Postgres를 메모리에 띄우고, LLM은 준비해 둔 응답으로 대신합니다.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import type { Pattern } from '@stitch/pattern-ir'

const tmp = mkdtempSync(join(tmpdir(), 'stitch-web-'))
process.env.DATABASE_URL = 'pglite://memory'
process.env.STORAGE_DIR = join(tmp, 'uploads')
process.env.READER_RECORDINGS_DIR = join(tmp, 'recordings')
process.env.AUTH_MODE = 'local'
process.env.BILLING_PROVIDER = 'mock'
delete process.env.ANTHROPIC_API_KEY

type Patterns = typeof import('../src/server/patterns')
let P: Patterns
let convert: typeof import('../src/server/convert')
let avatar: typeof import('../src/server/avatar')
let billing: typeof import('../src/server/billing')
let dbm: typeof import('../src/server/db/client')
let userId: string
const pdf = new Uint8Array(readFileSync('fixtures/reading/practice-hood.pdf'))

beforeAll(async () => {
  P = await import('../src/server/patterns')
  convert = await import('../src/server/convert')
  avatar = await import('../src/server/avatar')
  billing = await import('../src/server/billing')
  dbm = await import('../src/server/db/client')
  userId = (await (await import('../src/server/auth')).currentUser()).id
})

afterAll(async () => {
  await dbm.closeDb()
  rmSync(tmp, { recursive: true, force: true })
})

describe('올리기와 읽기', () => {
  let id: string

  it('PDF가 아니면 받지 않는다', async () => {
    await expect(P.createFromUpload(userId, new TextEncoder().encode('hello'), 'a.pdf')).rejects.toMatchObject({ code: 'not_pdf' })
    await expect(P.createFromUpload(userId, new Uint8Array(), 'a.pdf')).rejects.toMatchObject({ code: 'empty_file' })
  })

  it('올리면 변환 작업이 돌고, 끝나면 확인 화면으로 넘어갈 상태가 된다', async () => {
    const r = await P.createFromUpload(userId, pdf, '연습용 후드.pdf')
    id = r.pattern.id
    expect(r.reused).toBe(false)
    expect(r.pattern.status).toBe('reading')
    convert.startConversion(r.jobId!)
    await convert.waitForConversion(r.jobId!)
    const job = await P.latestJob(id)
    expect(job?.error).toBeNull()
    expect(job).toMatchObject({ stage: 'review', llmCalls: 3, feedbackRounds: 1 })
    expect(job?.verification?.ok).toBe(true)
    expect(job?.pages?.length).toBeGreaterThan(0)
    const view = await P.getPatternView(userId, id)
    expect(view).toMatchObject({ status: 'needs_review', title: '연습용 후드 워머', versionKind: 'original', gaugeMode: 'unset', hasPdf: true })
    expect(expand(view.ir!).totalRows).toBe(93)
  })

  it('같은 파일을 다시 올리면 이전 결과를 쓴다', async () => {
    const again = await P.createFromUpload(userId, pdf, '다른 이름.pdf')
    expect(again.reused).toBe(true)
    expect(again.pattern.id).toBe(id)
  })

  it('준비해 둔 응답도 API 키도 없는 PDF는 까닭을 남기고 실패한다', async () => {
    const other = new Uint8Array([...pdf, 0x0a])
    const r = await P.createFromUpload(userId, other, 'other.pdf')
    convert.startConversion(r.jobId!)
    await convert.waitForConversion(r.jobId!)
    const job = await P.latestJob(r.pattern.id)
    expect(job?.status).toBe('failed')
    expect(job?.error).toContain('ANTHROPIC_API_KEY')
    expect((await P.getPatternView(userId, r.pattern.id)).status).toBe('failed')
    await P.deletePattern(userId, r.pattern.id)
  })

  it('소유자만 원본 PDF를 받는다', async () => {
    expect((await P.readPdf(userId, id)).bytes.length).toBe(pdf.length)
    await expect(P.readPdf('someone-else', id)).rejects.toMatchObject({ status: 404 })
  })

  it('고치면 바로 다시 검산하고, 오류가 남아 있으면 확인을 마칠 수 없다', async () => {
    const view = await P.getPatternView(userId, id)
    const broken: Pattern = structuredClone(view.ir!)
    broken.sections[0].groups[1].rows[0].expect_count = 80
    const bad = await P.saveIr(userId, id, broken)
    expect(bad.verification.ok).toBe(false)
    expect(bad.verification.errors[0]).toMatchObject({ code: 'count_mismatch', g: 9 })
    await expect(P.confirmReview(userId, id)).rejects.toMatchObject({ code: 'has_errors' })
    const good = await P.saveIr(userId, id, view.ir)
    expect(good.verification.ok).toBe(true)
    await expect(P.saveIr(userId, id, { nope: true })).rejects.toThrow()
    expect((await P.confirmReview(userId, id)).status).toBe('ready')
  })
})

describe('게이지, 기록, 단수링', () => {
  let id: string

  beforeAll(async () => {
    id = (await P.createFromSample(userId, 'practice-hood')).id
    await P.confirmReview(userId, id)
  })

  it('건너뛰면 원본 IR이 그대로 쓰이고, 나중에 다시 맞출 수 있다', async () => {
    const v = await P.setGauge(userId, id, 'as_is', null)
    expect(v).toMatchObject({ gaugeMode: 'as_is', versionKind: 'original', myGauge: null })
    expect(v.ir).toEqual(v.originalIr)
    const preview = await P.previewGauge(userId, id, { stitches: 20, rows: 28 })
    expect(preview.ok).toBe(true)
  })

  it('기록은 단과 그 단에서 뜬 코 수로 남기고, 범위를 벗어나면 맞춘다', async () => {
    const a = await P.addProgress(userId, id, { row: 30, stitch: 40, memo: '저녁' })
    expect(a).toMatchObject({ row: 30, stitch: 40, memo: '저녁', finishingStep: null })
    const b = await P.addProgress(userId, id, { row: 9999, stitch: 9999 })
    expect(b.row).toBe(93)
    await P.deleteProgress(userId, id, b.id)
    await P.updateProgress(userId, id, a.id, '고친 메모')
    expect(await P.listProgress(userId, id)).toMatchObject([{ id: a.id, memo: '고친 메모' }])
  })

  it('단수링을 달고 고치고 뗀다', async () => {
    const ring = await P.addRing(userId, id, { row: 30, x: 10, color: '#e8590c', name: '여기까지' })
    await P.updateRing(userId, id, ring.id, { name: '오늘은 여기까지' })
    expect(await P.listRings(userId, id)).toEqual([{ ...ring, name: '오늘은 여기까지' }])
    await expect(P.addRing(userId, id, { row: 1, x: 0, color: 'red' })).rejects.toMatchObject({ code: 'invalid' })
    const extra = await P.addRing(userId, id, { row: 2, x: 3, color: '#2f7d32' })
    await P.deleteRing(userId, id, extra.id)
    expect(await P.listRings(userId, id)).toHaveLength(1)
  })

  it('내 게이지로 다시 계산하면 파생 IR을 쓰고, 기록과 단수링이 같은 구간으로 옮겨진다', async () => {
    const before = await P.getPatternView(userId, id)
    const from = expand(before.ir!)
    const v = await P.setGauge(userId, id, 'recalc', { stitches: 20, rows: 28 })
    expect(v).toMatchObject({ gaugeMode: 'recalc', versionKind: 'gauge', myGauge: { stitches: 20, rows: 28 } })
    expect(v.originalIr).toEqual(before.originalIr)
    const to = expand(v.ir!)
    expect(to.sections[0].startCount).toBeGreaterThan(from.sections[0].startCount)
    const [entry] = await P.listProgress(userId, id)
    const src = from.sections.find((s) => 30 >= s.firstRow && 30 <= s.lastRow)!
    const dst = to.sections.find((s) => s.id === src.id)!
    expect(entry.row).toBeGreaterThanOrEqual(dst.firstRow)
    expect(entry.row).toBeLessThanOrEqual(dst.lastRow)
    const [ring] = await P.listRings(userId, id)
    expect(ring.row).toBe(entry.row)
  })

  it('원본으로 돌아가면 다시 원본 IR을 쓴다', async () => {
    const v = await P.setGauge(userId, id, 'remeasure', { stitches: 20, rows: 28 })
    expect(v).toMatchObject({ gaugeMode: 'remeasure', versionKind: 'original' })
  })

  it('맞출 수 없는 게이지는 저장하지 않고 까닭을 알려 준다', async () => {
    await expect(P.setGauge(userId, id, 'recalc', null)).rejects.toMatchObject({ code: 'gauge_required' })
  })

  it('내 도안 목록에 진행률이 나온다', async () => {
    const list = await P.listPatterns(userId)
    const mine = list.find((x) => x.id === id)!
    expect(mine).toMatchObject({ craft: 'knit', template: 'hood', totalRows: 93 })
    expect(mine.progress).toBeGreaterThan(0)
    expect(mine.progress).toBeLessThan(1)
  })

  it('다른 사람은 도안 id를 알아도 열지 못한다', async () => {
    await expect(P.getPatternView('someone-else', id)).rejects.toMatchObject({ status: 404 })
    await expect(P.listProgress('someone-else', id)).rejects.toMatchObject({ status: 404 })
    await expect(P.addRing('someone-else', id, { row: 1, x: 0, color: '#000000' })).rejects.toMatchObject({ status: 404 })
    await expect(P.saveIr('someone-else', id, {})).rejects.toMatchObject({ status: 404 })
    await expect(P.deletePattern('someone-else', id)).rejects.toMatchObject({ status: 404 })
    expect(await P.listPatterns('someone-else')).toEqual([])
  })

  it('도안을 지우면 기록과 단수링, PDF가 함께 지워진다', async () => {
    const up = (await P.listPatterns(userId)).find((x) => x.source === 'upload')!
    await P.deletePattern(userId, up.id)
    await expect(P.readPdf(userId, up.id)).rejects.toMatchObject({ status: 404 })
    await P.deletePattern(userId, id)
    const db = await dbm.getDb()
    expect(await db.select().from(dbm.schema.progressEntries)).toEqual([])
    expect(await db.select().from(dbm.schema.markers)).toEqual([])
    expect(await db.select().from(dbm.schema.patternVersions)).toEqual([])
    expect(await db.select().from(dbm.schema.conversionJobs)).toEqual([])
  })
})

describe('마네킹 꾸미기와 플러스', () => {
  const fancy = { face: 'round', skin: 'tone2', hair: 'bangs', glasses: 'round' }

  it('무료는 꾸민 값을 저장할 수 없고, 기본 모습은 저장할 수 있다', async () => {
    expect((await avatar.getAvatar(userId)).plan).toBe('free')
    await expect(avatar.saveAvatar(userId, fancy)).rejects.toMatchObject({ status: 403, code: 'plus_required' })
    const d = await avatar.saveAvatar(userId, { face: 'default', skin: 'gray', hair: 'none', glasses: 'none' })
    expect(d.saved).toEqual(d.effective)
  })

  it('플러스는 저장할 수 있다', async () => {
    expect(await billing.mockSetPlan(userId, 'plus')).toBe('plus')
    const s = await avatar.saveAvatar(userId, fancy)
    expect(s).toMatchObject({ plan: 'plus', saved: fancy, effective: fancy })
  })

  it('플러스를 그만두면 기본 모습으로 보이고, 저장해 둔 값은 지우지 않는다', async () => {
    expect(await billing.mockSetPlan(userId, 'free')).toBe('free')
    const s = await avatar.getAvatar(userId)
    expect(s.saved).toEqual(fancy)
    expect(s.effective).toEqual({ face: 'default', skin: 'gray', hair: 'none', glasses: 'none' })
    expect(await billing.mockSetPlan(userId, 'plus')).toBe('plus')
    expect((await avatar.getAvatar(userId)).effective).toEqual(fancy)
  })

  it('모르는 값은 받지 않는다', async () => {
    await expect(avatar.saveAvatar(userId, { face: 'alien', skin: 'gray', hair: 'none', glasses: 'none' })).rejects.toThrow()
  })
})

describe('배포 환경을 위한 장치', () => {
  it('PDF를 데이터베이스에 두는 저장소도 같은 방식으로 동작한다', async () => {
    process.env.STORAGE_DRIVER = 'db'
    try {
      const { storage } = await import('../src/server/storage')
      const s = storage()
      const bytes = new Uint8Array([37, 80, 68, 70, 45, 0, 255, 128, 1])
      await s.put('u/a.pdf', bytes)
      expect(await s.get('u/a.pdf')).toEqual(bytes)
      await s.put('u/a.pdf', new Uint8Array([1, 2, 3]))
      expect(await s.get('u/a.pdf')).toEqual(new Uint8Array([1, 2, 3]))
      await s.delete('u/a.pdf')
      expect(await s.get('u/a.pdf')).toBeNull()
    } finally {
      delete process.env.STORAGE_DRIVER
    }
  })

  it('데이터베이스 저장소로도 올리기부터 PDF 내려받기, 삭제까지 된다', async () => {
    process.env.STORAGE_DRIVER = 'db'
    try {
      const r = await P.createFromUpload(userId, pdf, 'db.pdf')
      expect(r.reused).toBe(false)
      await convert.startConversion(r.jobId!)
      expect((await P.latestJob(r.pattern.id))?.verification?.ok).toBe(true)
      expect((await P.readPdf(userId, r.pattern.id)).bytes.length).toBe(pdf.length)
      await P.deletePattern(userId, r.pattern.id)
      await expect(P.readPdf(userId, r.pattern.id)).rejects.toMatchObject({ status: 404 })
      const db = await dbm.getDb()
      expect(await db.select({ key: dbm.schema.files.key }).from(dbm.schema.files)).toEqual([])
    } finally {
      delete process.env.STORAGE_DRIVER
    }
  })

  it('변환 상한을 넘으면 받지 않고, 도안을 지워도 센 횟수는 줄지 않는다', async () => {
    const db = await dbm.getDb()
    const before = (await db.select().from(dbm.schema.usageEvents)).length
    expect(before).toBeGreaterThanOrEqual(3)
    process.env.MAX_CONVERSIONS_PER_DAY = String(before)
    try {
      await expect(P.createFromUpload(userId, new Uint8Array([...pdf, 0x0a, 0x0a]), 'over.pdf')).rejects.toMatchObject({ status: 429, code: 'quota_day' })
      process.env.MAX_CONVERSIONS_PER_DAY = String(before + 1)
      const ok = await P.createFromUpload(userId, new Uint8Array([...pdf, 0x0a, 0x0a]), 'ok.pdf')
      await convert.startConversion(ok.jobId!)
      await P.deletePattern(userId, ok.pattern.id)
      await expect(P.createFromUpload(userId, new Uint8Array([...pdf, 0x0a, 0x0a, 0x0a]), 'again.pdf')).rejects.toMatchObject({ code: 'quota_day' })
    } finally {
      delete process.env.MAX_CONVERSIONS_PER_DAY
    }
    process.env.MAX_CONVERSIONS_PER_USER = '1'
    try {
      await expect(P.createFromUpload(userId, new Uint8Array([...pdf, 0x0a, 0x0a, 0x0a]), 'user.pdf')).rejects.toMatchObject({ code: 'quota_user' })
    } finally {
      delete process.env.MAX_CONVERSIONS_PER_USER
    }
  })

  it('배포인데 API 키가 없으면 올리기를 바로 돌려보내고, 횟수도 파일도 남기지 않는다', async () => {
    const db = await dbm.getDb()
    const count = async () => ({ usage: (await db.select().from(dbm.schema.usageEvents)).length, patterns: (await P.listPatterns(userId)).length })
    const before = await count()
    process.env.VERCEL = '1'
    try {
      const fresh = new Uint8Array([...pdf, 0x0a, 0x0a, 0x0a, 0x0a])
      await expect(P.createFromUpload(userId, fresh, 'off.pdf')).rejects.toMatchObject({ status: 503, code: 'reader_off' })
      expect(await count()).toEqual(before)
      // 키를 넣으면 다시 받습니다.
      process.env.ANTHROPIC_API_KEY = 'test-key'
      const ok = await P.createFromUpload(userId, fresh, 'on.pdf')
      expect(ok.reused).toBe(false)
      await P.deletePattern(userId, ok.pattern.id)
    } finally {
      delete process.env.VERCEL
      delete process.env.ANTHROPIC_API_KEY
    }
  })

  it('익명 세션 쿠키는 서명이 맞을 때만 받는다', async () => {
    const { issueSession, verifySession } = await import('../src/server/session')
    const value = await issueSession('secret-a')
    const id = value.split('.')[0]
    expect(await verifySession(value, 'secret-a')).toBe(id)
    expect(await verifySession(value, 'secret-b')).toBeNull()
    expect(await verifySession(`${crypto.randomUUID()}.${value.split('.')[1]}`, 'secret-a')).toBeNull()
    expect(await verifySession(value.slice(0, -2), 'secret-a')).toBeNull()
    expect(await verifySession(undefined, 'secret-a')).toBeNull()
    expect(await verifySession('nonsense', 'secret-a')).toBeNull()
  })
})

describe('공개 배포를 위한 안전장치', () => {
  it('멈춘 변환은 한 번만 이어 돌리고, 그래도 멈추면 실패로 닫는다', async () => {
    const db = await dbm.getDb()
    const { eq } = await import('drizzle-orm')
    const jobs = dbm.schema.conversionJobs
    const r = await P.createFromUpload(userId, new Uint8Array([...pdf, 0x0a, 0x0a, 0x0a, 0x0a]), 'stuck.pdf')
    // 시작하지 못하고 남은 작업: 이어 돌립니다. (준비해 둔 응답이 없는 PDF라 읽기는 실패로 끝납니다)
    const first = await convert.ensureRunning((await P.latestJob(r.pattern.id))!)
    expect(first).not.toBeNull()
    await first
    expect((await P.latestJob(r.pattern.id))!.attempts).toBe(1)
    // 두 번 시작하고도 "도는 중"으로 멈춰 있는 작업: 다시 돌리지 않고 닫습니다.
    await db.update(jobs).set({ status: 'running', attempts: 2, error: null }).where(eq(jobs.id, r.jobId!))
    expect(await convert.ensureRunning((await P.latestJob(r.pattern.id))!)).toBeNull()
    const closed = (await P.latestJob(r.pattern.id))!
    expect(closed).toMatchObject({ status: 'failed', attempts: 2 })
    expect(closed.error).toContain('멈췄습니다')
    expect((await P.getPatternView(userId, r.pattern.id)).status).toBe('failed')
    await P.deletePattern(userId, r.pattern.id)
  })

  it('계정 행은 처음 쓸 때 만들고, 읽기만 하면 만들지 않는다', async () => {
    const db = await dbm.getDb()
    const { eq } = await import('drizzle-orm')
    const who = 'anon-11111111-2222-4333-8444-555555555555'
    const rows = () => db.select().from(dbm.schema.users).where(eq(dbm.schema.users.id, who))
    expect(await P.listPatterns(who)).toEqual([])
    expect((await avatar.getAvatar(who)).plan).toBe('free')
    expect(await rows()).toHaveLength(0)
    const p = await P.createFromSample(who, 'garter-scarf')
    expect(await rows()).toHaveLength(1)
    await expect(P.getPatternView(userId, p.id)).rejects.toMatchObject({ status: 404 })
    await P.deletePattern(who, p.id)
  })
})

describe('계정마다 둘 수 있는 도안 수', () => {
  it('상한이 있으면 넘는 도안을 받지 않고, 로컬 기본값에서는 제한하지 않는다', async () => {
    const who = 'anon-99999999-2222-4333-8444-555555555555'
    process.env.MAX_PATTERNS_PER_USER = '2'
    try {
      const a = await P.createFromSample(who, 'garter-scarf')
      const b = await P.createFromSample(who, 'garter-scarf')
      await expect(P.createFromSample(who, 'garter-scarf')).rejects.toMatchObject({ status: 429, code: 'too_many_patterns' })
      await P.deletePattern(who, a.id)
      const c = await P.createFromSample(who, 'garter-scarf')
      delete process.env.MAX_PATTERNS_PER_USER
      const d = await P.createFromSample(who, 'garter-scarf')
      for (const p of [b, c, d]) await P.deletePattern(who, p.id)
    } finally {
      delete process.env.MAX_PATTERNS_PER_USER
    }
  })
})
