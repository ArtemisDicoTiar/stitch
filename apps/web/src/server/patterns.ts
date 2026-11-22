/**
 * 도안과 거기에 딸린 것(버전, 기록, 단수링)을 다룹니다.
 * 모든 함수는 사용자 id를 받아 소유자를 확인합니다. 도안 id를 알아도 다른 사람의 도안은 열리지 않습니다.
 */
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { expand, mapMarker, mapProgress, progressFraction, regauge, verify, type RegaugeResult } from '@stitch/engine'
import { parsePattern, type GaugeSize, type Pattern } from '@stitch/pattern-ir'
import { sha256 } from '@stitch/reader'
import { garterScarf, practiceBall, practiceBear, practiceHood } from '@stitch/fixtures'
import { ensureUserId } from './auth'
import { getDb, schema } from './db/client'
import type { GaugeMode } from './db/schema'
import { env, pdfReading } from './env'
import { AppError, notFound } from './errors'
import { storage } from './storage'
import type { JobVerification } from './types'

const { patterns, patternVersions, conversionJobs, progressEntries, markers } = schema

export type PatternRow = typeof patterns.$inferSelect
export type JobRow = typeof conversionJobs.$inferSelect

export const SAMPLES: Record<string, Pattern> = { 'practice-hood': practiceHood, 'garter-scarf': garterScarf, 'practice-ball': practiceBall, 'practice-bear': practiceBear }


export function summarize(v: ReturnType<typeof verify>): JobVerification {
  return { ok: v.ok, totalRows: v.expanded.totalRows, errors: v.errors, warnings: v.warnings, notes: v.notes }
}

/** 소유자가 맞을 때만 도안을 돌려줍니다. */
export async function ownedPattern(userId: string, id: string): Promise<PatternRow> {
  const db = await getDb()
  const [row] = await db.select().from(patterns).where(and(eq(patterns.id, id), eq(patterns.ownerId, userId))).limit(1)
  if (!row) throw notFound()
  return row
}

export async function latestJob(patternId: string): Promise<JobRow | null> {
  const db = await getDb()
  const [job] = await db.select().from(conversionJobs).where(eq(conversionJobs.patternId, patternId)).orderBy(desc(conversionJobs.createdAt)).limit(1)
  return job ?? null
}

async function versionOf(patternId: string, kind: 'original' | 'gauge') {
  const db = await getDb()
  const [v] = await db
    .select()
    .from(patternVersions)
    .where(and(eq(patternVersions.patternId, patternId), eq(patternVersions.kind, kind)))
    .orderBy(desc(patternVersions.createdAt))
    .limit(1)
  return v ?? null
}

async function currentVersion(p: PatternRow) {
  if (!p.currentVersionId) return null
  const db = await getDb()
  const [v] = await db.select().from(patternVersions).where(eq(patternVersions.id, p.currentVersionId)).limit(1)
  return v ?? null
}

// --- 만들기 -------------------------------------------------------------------

/** 한 계정이 둘 수 있는 도안 수를 넘지 않는지 봅니다. (env.maxPatternsPerUser) */
async function checkPatternLimit(userId: string) {
  const max = env().maxPatternsPerUser
  if (max === null) return
  const db = await getDb()
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(patterns).where(eq(patterns.ownerId, userId))
  if (n >= max) throw new AppError(429, 'too_many_patterns', `도안은 ${max}개까지 둘 수 있어요. 쓰지 않는 도안을 지우고 다시 시도해 주세요.`)
}

/** PDF를 비공개 저장소에 두고 도안과 변환 작업을 만듭니다. 같은 파일을 다시 올리면 이전 결과를 씁니다. */
export async function createFromUpload(userId: string, bytes: Uint8Array, fileName: string): Promise<{ pattern: PatternRow; jobId: string | null; reused: boolean }> {
  const e = env()
  if (bytes.length === 0) throw new AppError(400, 'empty_file', '빈 파일입니다.')
  if (bytes.length > e.maxPdfBytes) throw new AppError(413, 'too_large', `PDF가 너무 큽니다. ${Math.floor(e.maxPdfBytes / 1024 / 1024)}MB 이하로 올려 주세요.`)
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new AppError(400, 'not_pdf', 'PDF 파일만 올릴 수 있습니다.')
  const db = await getDb()
  await ensureUserId(userId)
  const hash = sha256(bytes)
  const [same] = await db.select().from(patterns).where(and(eq(patterns.ownerId, userId), eq(patterns.pdfSha256, hash))).limit(1)
  if (same && same.status !== 'failed') return { pattern: same, jobId: (await latestJob(same.id))?.id ?? null, reused: true }

  // 배포 환경에서 API 키가 없으면 읽을 방법이 없습니다. 파일을 쌓거나 변환 횟수를 깎기 전에 돌려보냅니다.
  // (로컬에서는 남겨 둔 응답으로 읽을 수 있어서 그대로 받습니다.)
  if (pdfReading(e) === 'off') throw new AppError(503, 'reader_off', '지금은 PDF 읽기가 꺼져 있어요. 예시 도안으로 먼저 둘러봐 주세요.')

  // 변환 한 번마다 LLM 비용이 들기 때문에, 정해 둔 상한이 있으면 여기서 막습니다.
  // 도안을 지워도 센 횟수는 줄지 않습니다.
  const { usageEvents } = schema
  const used = async (...conds: Parameters<typeof and>) => (await db.select({ n: sql<number>`count(*)::int` }).from(usageEvents).where(and(eq(usageEvents.kind, 'conversion'), ...conds)))[0].n
  if (e.maxConversionsPerUser !== null && (await used(eq(usageEvents.userId, userId))) >= e.maxConversionsPerUser) {
    throw new AppError(429, 'quota_user', `읽을 수 있는 도안은 ${e.maxConversionsPerUser}개까지예요.`)
  }
  if (e.maxConversionsPerDay !== null && (await used(gte(usageEvents.at, new Date(Date.now() - 24 * 60 * 60 * 1000)))) >= e.maxConversionsPerDay) {
    throw new AppError(429, 'quota_day', '오늘은 읽을 수 있는 도안 수가 다 찼어요. 내일 다시 올려 주세요.')
  }
  await db.insert(usageEvents).values({ id: randomUUID(), userId, kind: 'conversion' })

  if (!same) await checkPatternLimit(userId)
  const id = same?.id ?? randomUUID()
  const key = `${userId}/${hash}.pdf`
  await storage().put(key, bytes)
  const title = fileName.replace(/\.pdf$/i, '').slice(0, 120) || '새 도안'
  if (same) await db.update(patterns).set({ status: 'reading', updatedAt: new Date() }).where(eq(patterns.id, id))
  else await db.insert(patterns).values({ id, ownerId: userId, title, status: 'reading', source: 'upload', pdfKey: key, pdfName: fileName.slice(0, 200), pdfSha256: hash })
  const jobId = randomUUID()
  await db.insert(conversionJobs).values({ id: jobId, patternId: id, stage: 'upload', status: 'queued' })
  return { pattern: await ownedPattern(userId, id), jobId, reused: false }
}

/** 직접 쓴 예시 도안으로 시작합니다. PDF와 LLM 없이 확인 화면부터 둘러볼 수 있습니다. */
export async function createFromSample(userId: string, sample: string): Promise<PatternRow> {
  const ir = SAMPLES[sample]
  if (!ir) throw new AppError(400, 'unknown_sample', '없는 예시 도안입니다.')
  const db = await getDb()
  await ensureUserId(userId)
  await checkPatternLimit(userId)
  const id = randomUUID()
  const versionId = randomUUID()
  const v = verify(ir)
  await db.insert(patterns).values({ id, ownerId: userId, title: ir.title, craft: ir.craft, status: 'needs_review', source: 'sample', currentVersionId: versionId })
  await db.insert(patternVersions).values({ id: versionId, patternId: id, kind: 'original', ir, gauge: null })
  await db.insert(conversionJobs).values({ id: randomUUID(), patternId: id, stage: 'review', status: v.needsReview ? 'needs_review' : 'done', verification: summarize(v) })
  return ownedPattern(userId, id)
}

/** 변환이 끝났을 때 읽은 IR을 원본 버전으로 저장합니다. */
export async function saveConverted(patternId: string, ir: Pattern): Promise<void> {
  const db = await getDb()
  const versionId = randomUUID()
  await db.delete(patternVersions).where(eq(patternVersions.patternId, patternId))
  await db.insert(patternVersions).values({ id: versionId, patternId, kind: 'original', ir, gauge: null })
  await db
    .update(patterns)
    .set({ title: ir.title || undefined, craft: ir.craft, status: 'needs_review', currentVersionId: versionId, gaugeMode: 'unset', myGauge: null, updatedAt: new Date() })
    .where(eq(patterns.id, patternId))
}

// --- 읽기 ---------------------------------------------------------------------

export type PatternView = {
  id: string
  title: string
  craft: 'knit' | 'crochet'
  status: PatternRow['status']
  source: PatternRow['source']
  hasPdf: boolean
  gaugeMode: GaugeMode
  myGauge: GaugeSize | null
  /** 지금 쓰는 버전이 원본인지 게이지 파생인지 */
  versionKind: 'original' | 'gauge' | null
  ir: Pattern | null
  /** 원본 IR. 게이지 화면이 도안 숫자와 비교할 때 씁니다. */
  originalIr: Pattern | null
  createdAt: string
  updatedAt: string
}

export async function getPatternView(userId: string, id: string): Promise<PatternView> {
  const p = await ownedPattern(userId, id)
  const cur = await currentVersion(p)
  const orig = cur?.kind === 'original' ? cur : await versionOf(id, 'original')
  return {
    id: p.id,
    title: p.title,
    craft: p.craft,
    status: p.status,
    source: p.source,
    hasPdf: !!p.pdfKey,
    gaugeMode: p.gaugeMode,
    myGauge: p.myGauge ?? null,
    versionKind: cur?.kind ?? null,
    ir: cur?.ir ?? null,
    originalIr: orig?.ir ?? null,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export type LibraryItem = {
  id: string
  title: string
  craft: 'knit' | 'crochet'
  status: PatternRow['status']
  source: PatternRow['source']
  template: string | null
  /** 게이지를 정했는지. 갈 곳을 정할 때 씁니다 (unset이면 게이지 화면) */
  gaugeMode: GaugeMode
  totalRows: number
  row: number
  /** 진행률(0~1). 저장하지 않고 IR의 총 코 수에서 계산합니다. */
  progress: number
  updatedAt: string
}

export async function listPatterns(userId: string): Promise<LibraryItem[]> {
  const db = await getDb()
  const rows = await db.select().from(patterns).where(eq(patterns.ownerId, userId)).orderBy(desc(patterns.updatedAt))
  const out: LibraryItem[] = []
  for (const p of rows) {
    const cur = await currentVersion(p)
    let totalRows = 0
    let row = 0
    let progress = 0
    if (cur) {
      const e = expand(cur.ir)
      totalRows = e.totalRows
      const [last] = await db.select().from(progressEntries).where(eq(progressEntries.patternId, p.id)).orderBy(desc(progressEntries.at)).limit(1)
      if (last) {
        row = last.row
        progress = progressFraction(e, { row: last.row, stitch: last.stitch })
      }
    }
    out.push({ id: p.id, title: p.title, craft: p.craft, status: p.status, source: p.source, template: cur?.ir.template ?? null, gaugeMode: p.gaugeMode, totalRows, row, progress, updatedAt: p.updatedAt.toISOString() })
  }
  return out
}

export async function readPdf(userId: string, id: string): Promise<{ bytes: Uint8Array; name: string }> {
  const p = await ownedPattern(userId, id)
  if (!p.pdfKey) throw new AppError(404, 'no_pdf', '이 도안에는 PDF가 없습니다.')
  const bytes = await storage().get(p.pdfKey)
  if (!bytes) throw new AppError(404, 'no_pdf', 'PDF 파일을 찾을 수 없습니다.')
  return { bytes, name: p.pdfName ?? 'pattern.pdf' }
}

// --- 고치기 -------------------------------------------------------------------

/** 확인 화면에서 고친 IR을 저장하고 바로 다시 검산합니다. */
export async function saveIr(userId: string, id: string, input: unknown): Promise<{ verification: JobVerification; ir: Pattern }> {
  const p = await ownedPattern(userId, id)
  const ir = parsePattern(input)
  const v = verify(ir)
  const db = await getDb()
  const orig = await versionOf(id, 'original')
  if (!orig) throw new AppError(409, 'not_ready', '아직 읽는 중인 도안입니다.')
  await db.update(patternVersions).set({ ir }).where(eq(patternVersions.id, orig.id))
  // 원본이 바뀌면 게이지 파생본은 맞지 않으므로 원본으로 돌아갑니다.
  await db.delete(patternVersions).where(and(eq(patternVersions.patternId, id), eq(patternVersions.kind, 'gauge')))
  await db
    .update(patterns)
    .set({ title: ir.title || p.title, craft: ir.craft, currentVersionId: orig.id, gaugeMode: p.gaugeMode === 'recalc' ? 'unset' : p.gaugeMode, status: p.status === 'ready' && !v.ok ? 'needs_review' : p.status, updatedAt: new Date() })
    .where(eq(patterns.id, id))
  const job = await latestJob(id)
  if (job) await db.update(conversionJobs).set({ verification: summarize(v), status: v.needsReview ? 'needs_review' : 'done', updatedAt: new Date() }).where(eq(conversionJobs.id, job.id))
  return { verification: summarize(v), ir }
}

/** 확인을 마칩니다. 검산 오류가 남아 있으면 넘어가지 않습니다. */
export async function confirmReview(userId: string, id: string): Promise<PatternRow> {
  await ownedPattern(userId, id)
  const orig = await versionOf(id, 'original')
  if (!orig) throw new AppError(409, 'not_ready', '아직 읽는 중인 도안입니다.')
  const v = verify(orig.ir)
  if (!v.ok) throw new AppError(422, 'has_errors', '아직 코 수가 맞지 않는 단이 있습니다. 표시된 단을 고쳐 주세요.', summarize(v))
  const db = await getDb()
  await db.update(patterns).set({ status: 'ready', updatedAt: new Date() }).where(eq(patterns.id, id))
  return ownedPattern(userId, id)
}

export async function previewGauge(userId: string, id: string, mine: GaugeSize): Promise<RegaugeResult> {
  await ownedPattern(userId, id)
  const orig = await versionOf(id, 'original')
  if (!orig) throw new AppError(409, 'not_ready', '아직 읽는 중인 도안입니다.')
  return regauge(orig.ir, mine)
}

/**
 * 게이지를 정합니다.
 *  - as_is: 도안 숫자 그대로 (재지 않았거나 재 보니 같음). 원본 IR을 씁니다.
 *  - recalc: 내 게이지로 다시 계산. 원본에서 만든 파생 IR을 씁니다. 원본은 덮지 않습니다.
 *  - remeasure: 바늘을 바꿔 다시 재기. 다시 잴 때까지 원본 IR을 씁니다.
 * 버전이 바뀌면 기록과 단수링을 새 버전의 같은 구간, 같은 비율 위치로 옮깁니다.
 */
export async function setGauge(userId: string, id: string, mode: Exclude<GaugeMode, 'unset'>, mine: GaugeSize | null): Promise<PatternView> {
  const p = await ownedPattern(userId, id)
  const db = await getDb()
  const orig = await versionOf(id, 'original')
  if (!orig) throw new AppError(409, 'not_ready', '아직 읽는 중인 도안입니다.')
  const before = await currentVersion(p)
  let nextId = orig.id
  let nextIr = orig.ir
  if (mode === 'recalc') {
    if (!mine) throw new AppError(400, 'gauge_required', '내 게이지를 넣어 주세요.')
    const r = regauge(orig.ir, mine)
    if (!r.ok || !r.pattern) throw new AppError(422, 'regauge_failed', r.reason ?? '다시 계산하지 못했습니다.', { sections: r.sections })
    nextId = randomUUID()
    nextIr = r.pattern
    await db.delete(patternVersions).where(and(eq(patternVersions.patternId, id), eq(patternVersions.kind, 'gauge')))
    await db.insert(patternVersions).values({ id: nextId, patternId: id, kind: 'gauge', ir: nextIr, gauge: mine })
  }
  if (before && before.id !== nextId) await moveRecords(id, before.ir, nextIr)
  await db.update(patterns).set({ currentVersionId: nextId, gaugeMode: mode, myGauge: mine, updatedAt: new Date() }).where(eq(patterns.id, id))
  return getPatternView(userId, id)
}

async function moveRecords(patternId: string, fromIr: Pattern, toIr: Pattern) {
  const db = await getDb()
  const from = expand(fromIr)
  const to = expand(toIr)
  for (const e of await db.select().from(progressEntries).where(eq(progressEntries.patternId, patternId))) {
    const m = mapProgress(from, to, { row: e.row, stitch: e.stitch })
    await db.update(progressEntries).set({ row: m.row, stitch: m.stitch }).where(eq(progressEntries.id, e.id))
  }
  for (const k of await db.select().from(markers).where(eq(markers.patternId, patternId))) {
    const m = mapMarker(from, to, k.row, k.x)
    await db.update(markers).set({ row: m.row, x: m.x }).where(eq(markers.id, k.id))
  }
}

/** 도안을 지우면 PDF, IR, 기록, 단수링을 함께 지웁니다. */
export async function deletePattern(userId: string, id: string): Promise<void> {
  const p = await ownedPattern(userId, id)
  const db = await getDb()
  await db.delete(patterns).where(eq(patterns.id, id))
  if (p.pdfKey) {
    const [other] = await db.select({ id: patterns.id }).from(patterns).where(eq(patterns.pdfKey, p.pdfKey)).limit(1)
    if (!other) await storage().delete(p.pdfKey)
  }
}

// --- 기록과 단수링 -------------------------------------------------------------

export type ProgressEntry = { id: string; at: string; row: number; stitch: number; finishingStep: number | null; memo: string }
export type RingMarker = { id: string; row: number; x: number; color: string; name: string }

const entryOut = (e: typeof progressEntries.$inferSelect): ProgressEntry => ({ id: e.id, at: e.at.toISOString(), row: e.row, stitch: e.stitch, finishingStep: e.finishingStep, memo: e.memo })

export async function listProgress(userId: string, id: string): Promise<ProgressEntry[]> {
  await ownedPattern(userId, id)
  const db = await getDb()
  return (await db.select().from(progressEntries).where(eq(progressEntries.patternId, id)).orderBy(asc(progressEntries.at))).map(entryOut)
}

export async function addProgress(userId: string, id: string, input: { row: number; stitch: number; finishingStep?: number | null; memo?: string; at?: string }): Promise<ProgressEntry> {
  const p = await ownedPattern(userId, id)
  const cur = await currentVersion(p)
  if (!cur) throw new AppError(409, 'not_ready', '아직 읽는 중인 도안입니다.')
  const e = expand(cur.ir)
  const row = Math.min(Math.max(0, Math.round(input.row)), e.totalRows)
  const cells = e.blocks.flatMap((b) => b.rows).find((r) => r.g === row)?.cells.length ?? 0
  const stitch = Math.min(Math.max(0, Math.round(input.stitch)), cells)
  const at = input.at ? new Date(input.at) : new Date()
  if (Number.isNaN(at.getTime())) throw new AppError(400, 'invalid', '기록 시각이 올바르지 않습니다.')
  const db = await getDb()
  const entry = { id: randomUUID(), patternId: id, at, row, stitch, finishingStep: input.finishingStep ?? null, memo: (input.memo ?? '').slice(0, 500) }
  await db.insert(progressEntries).values(entry)
  await db.update(patterns).set({ updatedAt: new Date() }).where(eq(patterns.id, id))
  return entryOut(entry)
}

export async function updateProgress(userId: string, id: string, entryId: string, memo: string): Promise<void> {
  await ownedPattern(userId, id)
  const db = await getDb()
  await db.update(progressEntries).set({ memo: memo.slice(0, 500) }).where(and(eq(progressEntries.id, entryId), eq(progressEntries.patternId, id)))
}

export async function deleteProgress(userId: string, id: string, entryId: string): Promise<void> {
  await ownedPattern(userId, id)
  const db = await getDb()
  await db.delete(progressEntries).where(and(eq(progressEntries.id, entryId), eq(progressEntries.patternId, id)))
}

const ringOut = (m: typeof markers.$inferSelect): RingMarker => ({ id: m.id, row: m.row, x: m.x, color: m.color, name: m.name })

export async function listRings(userId: string, id: string): Promise<RingMarker[]> {
  await ownedPattern(userId, id)
  const db = await getDb()
  return (await db.select().from(markers).where(eq(markers.patternId, id)).orderBy(asc(markers.createdAt))).map(ringOut)
}

export async function addRing(userId: string, id: string, input: { row: number; x: number; color: string; name?: string }): Promise<RingMarker> {
  await ownedPattern(userId, id)
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new AppError(400, 'invalid', '색이 올바르지 않습니다.')
  const db = await getDb()
  const m = { id: randomUUID(), patternId: id, row: Math.max(1, Math.round(input.row)), x: Math.max(0, Math.round(input.x)), color: input.color, name: (input.name ?? '').slice(0, 40), createdAt: new Date() }
  await db.insert(markers).values(m)
  return ringOut(m)
}

export async function updateRing(userId: string, id: string, ringId: string, input: { color?: string; name?: string }): Promise<void> {
  await ownedPattern(userId, id)
  if (input.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new AppError(400, 'invalid', '색이 올바르지 않습니다.')
  const db = await getDb()
  await db
    .update(markers)
    .set({ ...(input.color ? { color: input.color } : {}), ...(input.name !== undefined ? { name: input.name.slice(0, 40) } : {}) })
    .where(and(eq(markers.id, ringId), eq(markers.patternId, id)))
}

export async function deleteRing(userId: string, id: string, ringId: string): Promise<void> {
  await ownedPattern(userId, id)
  const db = await getDb()
  await db.delete(markers).where(and(eq(markers.id, ringId), eq(markers.patternId, id)))
}
