import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { setGauge } from '@/server/patterns'
import { SetGaugeInput } from '@/server/schemas'

export const dynamic = 'force-dynamic'

/** 게이지를 정합니다: 도안 숫자 그대로(as_is), 내 게이지로 다시 계산(recalc), 바늘을 바꿔 다시 재기(remeasure). */
export const POST = api(async (req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const body = SetGaugeInput.parse(await req.json())
  return { pattern: await setGauge(user.id, id, body.mode, body.gauge ?? null) }
})
