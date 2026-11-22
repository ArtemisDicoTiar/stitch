import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { previewGauge } from '@/server/patterns'
import { GaugeInput } from '@/server/schemas'

export const dynamic = 'force-dynamic'

/** 저장하지 않고 다시 계산한 결과만 봅니다. */
export const POST = api(async (req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const r = await previewGauge(user.id, id, GaugeInput.parse(await req.json()))
  return { ok: r.ok, reason: r.reason ?? null, factor: r.factor, sections: r.sections, width: r.width }
})
