import { eq } from 'drizzle-orm'
import { DEFAULT_AVATAR, isAvatar, isFreeAvatar, sanitizeAvatar, type Avatar } from '@stitch/render-3d/avatar'
import { ensureUserId } from './auth'
import { planOf, type Plan } from './billing'
import { getDb, schema } from './db/client'
import { AppError } from './errors'

export type AvatarState = {
  plan: Plan
  /** 저장해 둔 꾸미기 값. 플러스를 그만둬도 지우지 않습니다. */
  saved: Avatar | null
  /** 지금 보이는 모습. 플러스가 아니면 기본 모습입니다. */
  effective: Avatar
}

export async function getAvatar(userId: string): Promise<AvatarState> {
  const db = await getDb()
  const plan = await planOf(userId)
  const [row] = await db.select().from(schema.avatars).where(eq(schema.avatars.userId, userId)).limit(1)
  const saved = row ? sanitizeAvatar(row.value) : null
  return { plan, saved, effective: saved && (plan === 'plus' || isFreeAvatar(saved)) ? saved : DEFAULT_AVATAR }
}

/** 꾸미기 값을 저장합니다. 골라 보기는 누구나 되지만 저장은 플러스만 됩니다. 권한은 여기서 확인합니다. */
export async function saveAvatar(userId: string, input: unknown): Promise<AvatarState> {
  // 저장할 때는 목록에 있는 값만 받습니다. 모르는 값을 기본값으로 바꿔 저장하지 않습니다.
  if (!isAvatar(input)) throw new AppError(400, 'invalid', '고를 수 없는 꾸미기 값입니다.')
  const value: Avatar = { face: input.face, skin: input.skin, hair: input.hair, glasses: input.glasses }
  if (!isFreeAvatar(value) && (await planOf(userId)) !== 'plus') {
    throw new AppError(403, 'plus_required', '꾸민 마네킹을 저장하려면 플러스가 필요합니다.')
  }
  const db = await getDb()
  await ensureUserId(userId)
  await db
    .insert(schema.avatars)
    .values({ userId, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.avatars.userId, set: { value, updatedAt: new Date() } })
  return getAvatar(userId)
}
