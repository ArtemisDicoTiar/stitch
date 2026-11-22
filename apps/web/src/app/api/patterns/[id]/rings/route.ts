import { NextResponse } from 'next/server'
import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { addRing, listRings } from '@/server/patterns'
import { RingInput } from '@/server/schemas'

export const dynamic = 'force-dynamic'

export const GET = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  return { rings: await listRings(user.id, id) }
})

export const POST = api(async (req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const ring = await addRing(user.id, id, RingInput.parse(await req.json()))
  return NextResponse.json({ ring }, { status: 201 })
})
