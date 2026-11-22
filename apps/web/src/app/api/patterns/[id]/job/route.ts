import { after } from 'next/server'
import { currentUser } from '@/server/auth'
import { ensureRunning } from '@/server/convert'
import { api, type RouteParams } from '@/server/http'
import { jobView } from '@/server/job-view'
import { latestJob, ownedPattern } from '@/server/patterns'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** 올리기 화면이 읽는 단계 상태. 서버가 다시 시작되어 멈춘 작업은 여기서 이어 돌립니다. */
export const GET = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const pattern = await ownedPattern(user.id, id)
  const job = await latestJob(id)
  const resumed = job ? await ensureRunning(job) : null
  if (resumed) after(() => resumed)
  // 이어 돌리지 못하고 실패로 닫았을 수 있으니 상태를 다시 읽습니다.
  const fresh = job && !resumed && (job.status === 'queued' || job.status === 'running') ? await latestJob(id) : job
  const current = fresh && fresh.status === 'failed' && job?.status !== 'failed' ? await ownedPattern(user.id, id) : pattern
  return { patternStatus: current.status, title: current.title, job: jobView(fresh, false) }
})
