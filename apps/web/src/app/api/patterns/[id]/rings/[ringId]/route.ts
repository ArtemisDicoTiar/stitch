import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { deleteRing, updateRing } from '@/server/patterns'
import { RingPatch } from '@/server/schemas'

export const dynamic = 'force-dynamic'

export const PATCH = api(async (req: Request, ctx: RouteParams<'id' | 'ringId'>) => {
  const { id, ringId } = await ctx.params
  const user = await currentUser()
  await updateRing(user.id, id, ringId, RingPatch.parse(await req.json()))
  return { ok: true }
})

export const DELETE = api(async (_req: Request, ctx: RouteParams<'id' | 'ringId'>) => {
  const { id, ringId } = await ctx.params
  const user = await currentUser()
  await deleteRing(user.id, id, ringId)
  return { ok: true }
})
