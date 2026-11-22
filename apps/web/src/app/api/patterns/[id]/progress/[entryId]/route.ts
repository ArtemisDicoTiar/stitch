import { z } from 'zod'
import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { deleteProgress, updateProgress } from '@/server/patterns'

export const dynamic = 'force-dynamic'

export const PATCH = api(async (req: Request, ctx: RouteParams<'id' | 'entryId'>) => {
  const { id, entryId } = await ctx.params
  const user = await currentUser()
  const { memo } = z.object({ memo: z.string().max(500) }).parse(await req.json())
  await updateProgress(user.id, id, entryId, memo)
  return { ok: true }
})

export const DELETE = api(async (_req: Request, ctx: RouteParams<'id' | 'entryId'>) => {
  const { id, entryId } = await ctx.params
  const user = await currentUser()
  await deleteProgress(user.id, id, entryId)
  return { ok: true }
})
