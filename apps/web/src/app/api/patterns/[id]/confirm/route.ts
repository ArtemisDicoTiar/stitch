import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { confirmReview } from '@/server/patterns'

export const dynamic = 'force-dynamic'

export const POST = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const p = await confirmReview(user.id, id)
  return { id: p.id, status: p.status }
})
