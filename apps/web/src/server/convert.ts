/**
 * PDF 변환 작업. 요청 하나로 끝나지 않으므로 뒤에서 돌리고, 단계 상태를 conversion_jobs에 남깁니다.
 * 올리기 화면은 이 표를 읽어 진행을 보여 주고, 창을 닫아도 작업은 계속됩니다.
 *
 * 지금은 서버 프로세스 안에서 돌리는 실행기를 씁니다. 계획서의 Workflow SDK(Local World / Vercel Workflows)로
 * 바꿀 때는 runConversion의 단계들을 'use step' 으로 옮기면 됩니다. 이 파일 밖의 코드는 그대로입니다.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { AnthropicLlm, ReaderError, ReplayLlm, readPattern, type Llm, type ReadStage } from '@stitch/reader'
import { getDb, schema } from './db/client'
import type { JobStage } from './db/schema'
import { env, repoRoot } from './env'
import { saveConverted, summarize } from './patterns'
import { storage } from './storage'

const { conversionJobs, patterns } = schema

const g = globalThis as unknown as { __stitchJobs?: Map<string, Promise<void>> }
const running = (g.__stitchJobs ??= new Map())

/** 이 PDF를 읽을 LLM 어댑터를 고릅니다. 키가 없으면 남겨 둔 응답이 있을 때만 읽을 수 있습니다. */
function pickLlm(pdfSha256: string): Llm {
  const e = env()
  if (e.anthropicApiKey) return new AnthropicLlm({ apiKey: e.anthropicApiKey, model: e.readerModel })
  // 남겨 둔 응답으로 읽는 것은 개발과 테스트용입니다. 배포 환경에서는 찾지 않습니다.
  if (!e.serverless) {
    for (const dir of [e.recordingsDir, join(repoRoot(), 'fixtures/reading/recordings')]) {
      if (existsSync(/*turbopackIgnore: true*/ dir) && ReplayLlm.has(dir, pdfSha256)) return new ReplayLlm(dir)
    }
  }
  throw new ReaderError(
    e.serverless
      ? 'PDF를 읽으려면 Claude API 키가 필요합니다. 배포 환경 변수에 ANTHROPIC_API_KEY를 넣고 다시 배포해 주세요.'
      : 'PDF를 읽으려면 Claude API 키가 필요합니다. 저장소의 .env에 ANTHROPIC_API_KEY를 넣고 서버를 다시 시작해 주세요.',
    'no_api_key',
  )
}

const STAGE: Record<ReadStage, JobStage> = { extract: 'extract', structure: 'structure', verify: 'verify', feedback: 'feedback', review: 'review' }

async function runConversion(jobId: string): Promise<void> {
  const db = await getDb()
  const set = (values: Partial<typeof conversionJobs.$inferInsert>) => db.update(conversionJobs).set({ ...values, updatedAt: new Date() }).where(eq(conversionJobs.id, jobId))
  const [job] = await db.select().from(conversionJobs).where(eq(conversionJobs.id, jobId)).limit(1)
  if (!job) return
  const [pattern] = await db.select().from(patterns).where(eq(patterns.id, job.patternId)).limit(1)
  if (!pattern) return
  try {
    await set({ status: 'running', stage: 'upload', error: null, attempts: job.attempts + 1 })
    const pdf = pattern.pdfKey ? await storage().get(pattern.pdfKey) : null
    if (!pdf || !pattern.pdfSha256) throw new ReaderError('올린 PDF를 찾을 수 없습니다. 다시 올려 주세요.', 'api')
    const result = await readPattern(pdf, {
      llm: pickLlm(pattern.pdfSha256),
      maxFeedbackRounds: env().feedbackMaxRounds,
      onStage: async (stage, d) => {
        await set({ stage: STAGE[stage], llmCalls: d?.llmCalls ?? 0, inputTokens: totalInput(d?.usage), outputTokens: d?.usage.output_tokens ?? 0, feedbackRounds: d?.round ?? 0 })
      },
    })
    await saveConverted(pattern.id, result.pattern)
    await set({
      stage: 'review',
      status: result.verification.needsReview ? 'needs_review' : 'done',
      verification: summarize(result.verification),
      pages: result.pages,
      llmCalls: result.llmCalls,
      inputTokens: totalInput(result.usage),
      outputTokens: result.usage.output_tokens,
      feedbackRounds: result.feedbackRounds,
    })
  } catch (error) {
    const message = error instanceof ReaderError ? error.message : '읽는 중에 문제가 생겼습니다. 다시 시도해 주세요.'
    if (!(error instanceof ReaderError)) console.error(error)
    await set({ status: 'failed', error: message })
    await db.update(patterns).set({ status: 'failed', updatedAt: new Date() }).where(eq(patterns.id, pattern.id))
  }
}

function totalInput(u?: { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }): number {
  return u ? u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
}

/**
 * 변환을 시작하고, 끝날 때 풀리는 약속을 돌려줍니다. 기다리지 않아도 됩니다.
 * 요청이 끝나면 프로세스가 멈출 수 있는 환경(Vercel)에서는 라우트가 이 약속을 `after()`에 넘겨
 * 응답을 보낸 뒤에도 변환이 끝까지 돌게 합니다.
 */
export function startConversion(jobId: string): Promise<void> {
  const existing = running.get(jobId)
  if (existing) return existing
  const p = runConversion(jobId).finally(() => running.delete(jobId))
  running.set(jobId, p)
  return p
}

/** 이만큼 소식이 없으면 멈춘 작업으로 봅니다. (단계가 바뀔 때마다 updated_at이 갱신됩니다) */
const STALE_MS = 6 * 60 * 1000
/** 한 작업을 시작할 수 있는 횟수. 처음 한 번과, 멈췄을 때 이어 돌리기 한 번입니다. */
const MAX_ATTEMPTS = 2

/**
 * 멈춘 작업이 있으면 이어서 돌립니다. 다시 돌린 경우 그 약속을, 아니면 null을 돌려줍니다.
 *  - 서버가 여러 대일 때 다른 서버가 돌리고 있는 작업을 겹쳐 돌리지 않도록, 한동안 소식이 없는 작업만 다시 시작합니다.
 *    (로컬에서 서버를 다시 시작한 경우는 바로 이어 돌립니다.)
 *  - 다시 돌릴 때마다 LLM을 처음부터 다시 부르므로, 이어 돌리기는 한 번만 합니다. 그래도 멈추면 실패로 닫습니다.
 */
export async function ensureRunning(job: { id: string; patternId: string; status: string; updatedAt: Date; attempts: number }): Promise<Promise<void> | null> {
  if (job.status !== 'queued' && job.status !== 'running') return null
  if (running.has(job.id)) return null
  const stale = Date.now() - job.updatedAt.getTime() > STALE_MS
  if (env().serverless && !stale) return null
  if (job.attempts >= MAX_ATTEMPTS) {
    const db = await getDb()
    await db.update(conversionJobs).set({ status: 'failed', error: '읽는 중에 작업이 멈췄습니다. 도안을 다시 올려 주세요.', updatedAt: new Date() }).where(eq(conversionJobs.id, job.id))
    await db.update(patterns).set({ status: 'failed', updatedAt: new Date() }).where(eq(patterns.id, job.patternId))
    return null
  }
  return startConversion(job.id)
}

/** 테스트에서 변환이 끝날 때까지 기다립니다. */
export async function waitForConversion(jobId: string): Promise<void> {
  await running.get(jobId)
}
