import { z } from 'zod'
import { currentUser } from '@/server/auth'
import { mockSetPlan, planOf } from '@/server/billing'
import { env } from '@/server/env'
import { api } from '@/server/http'

export const dynamic = 'force-dynamic'

export const GET = api(async () => {
  const user = await currentUser()
  return { plan: await planOf(user.id), provider: env().billingProvider }
})

/** 가짜 결제 스위치. 실제 결제 제공자는 M4에서 정합니다. */
export const POST = api(async (req: Request) => {
  const user = await currentUser()
  const { plan } = z.object({ plan: z.enum(['free', 'plus']) }).parse(await req.json())
  return { plan: await mockSetPlan(user.id, plan), provider: env().billingProvider }
})
