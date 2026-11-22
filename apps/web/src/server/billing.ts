import { randomUUID } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { ensureUserId } from './auth'
import { getDb, schema } from './db/client'
import { env } from './env'

export type Plan = 'free' | 'plus'

/**
 * 결제 결과는 entitlements 테이블 하나로 모으고, 앱은 이 테이블만 봅니다.
 * 제공자를 바꿔도 앱 코드는 그대로입니다.
 */
export async function planOf(userId: string): Promise<Plan> {
  const db = await getDb()
  const rows = await db.select().from(schema.entitlements).where(eq(schema.entitlements.userId, userId))
  const now = Date.now()
  return rows.some((r) => r.plan === 'plus' && r.startsAt.getTime() <= now && (!r.endsAt || r.endsAt.getTime() > now)) ? 'plus' : 'free'
}

/** 가짜 결제 스위치 (BILLING_PROVIDER=mock). 플러스를 켜고 끕니다. */
export async function mockSetPlan(userId: string, plan: Plan): Promise<Plan> {
  if (env().billingProvider !== 'mock') throw new Error('가짜 결제는 BILLING_PROVIDER=mock 에서만 쓸 수 있습니다.')
  const db = await getDb()
  const active = and(eq(schema.entitlements.userId, userId), isNull(schema.entitlements.endsAt))
  if (plan === 'plus') {
    await ensureUserId(userId)
    if ((await planOf(userId)) !== 'plus') {
      await db.insert(schema.entitlements).values({ id: randomUUID(), userId, plan: 'plus', provider: 'mock' })
    }
  } else {
    await db.update(schema.entitlements).set({ endsAt: new Date() }).where(active)
  }
  return planOf(userId)
}
