import type { JobRow } from './patterns'
import type { JobVerification, SourcePage } from './types'

export type JobView = {
  id: string
  stage: JobRow['stage']
  status: JobRow['status']
  verification: JobVerification | null
  pages: SourcePage[] | null
  llmCalls: number
  inputTokens: number
  outputTokens: number
  feedbackRounds: number
  error: string | null
  updatedAt: string
}

export function jobView(job: JobRow | null, withPages = true): JobView | null {
  if (!job) return null
  return {
    id: job.id,
    stage: job.stage,
    status: job.status,
    verification: job.verification ?? null,
    pages: withPages ? (job.pages ?? null) : null,
    llmCalls: job.llmCalls,
    inputTokens: job.inputTokens,
    outputTokens: job.outputTokens,
    feedbackRounds: job.feedbackRounds,
    error: job.error,
    updatedAt: job.updatedAt.toISOString(),
  }
}
