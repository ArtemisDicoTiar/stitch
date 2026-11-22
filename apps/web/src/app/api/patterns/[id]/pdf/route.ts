import { currentUser } from '@/server/auth'
import { api, type RouteParams } from '@/server/http'
import { readPdf } from '@/server/patterns'

export const dynamic = 'force-dynamic'

/** 원본 PDF. 서버가 소유자를 확인한 뒤에만 내려보냅니다. */
export const GET = api(async (_req: Request, ctx: RouteParams<'id'>) => {
  const { id } = await ctx.params
  const user = await currentUser()
  const { bytes } = await readPdf(user.id, id)
  return new Response(Buffer.from(bytes), {
    headers: { 'content-type': 'application/pdf', 'content-disposition': 'inline', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
  })
})
