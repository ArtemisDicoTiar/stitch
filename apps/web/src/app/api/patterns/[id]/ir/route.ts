import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { saveIr } from '@/server/patterns'

export const dynamic = 'force-dynamic'

/** 확인 화면에서 고친 IR을 저장합니다. 바로 다시 검산한 결과를 돌려줍니다. */
export const PUT = api(async (req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  return saveIr(user.id, id, await req.json())
})
