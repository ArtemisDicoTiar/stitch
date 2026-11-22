import { NextResponse } from 'next/server'
import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { addProgress, listProgress } from '@/server/patterns'
import { ProgressInput } from '@/server/schemas'

export const dynamic = 'force-dynamic'

export const GET = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  return { entries: await listProgress(user.id, id) }
})

export const POST = api(async (req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const entry = await addProgress(user.id, id, ProgressInput.parse(await req.json()))
  return NextResponse.json({ entry }, { status: 201 })
})
