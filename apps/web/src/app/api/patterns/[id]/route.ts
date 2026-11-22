import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { deletePattern, getPatternView, latestJob } from '@/server/patterns'
import { jobView } from '@/server/job-view'

export const dynamic = 'force-dynamic'

export const GET = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const pattern = await getPatternView(user.id, id)
  return { pattern, job: jobView(await latestJob(id)) }
})

export const DELETE = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  await deletePattern(user.id, id)
  return { ok: true }
})
