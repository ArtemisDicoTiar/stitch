import { eq } from 'drizzle-orm'
import { getDb, schema } from './db/client'
import { env } from './env'
import { AppError } from './errors'
import { SESSION_COOKIE, verifySession } from './session'

export type User = { id: string; login: string }

const LOCAL_USER: User = { id: 'local-user', login: 'local' }

/**
 * 사용자 행을 만들어 둡니다. 도안, 마네킹, 플랜처럼 사용자에 딸린 것을 처음 쓸 때 부릅니다.
 * 익명 계정은 둘러보기만 하는 방문(검색 로봇 포함)마다 행이 쌓이지 않도록 읽을 때는 만들지 않습니다.
 */
export async function ensureUser(user: User): Promise<User> {
  const db = await getDb()
  const found = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, user.id)).limit(1)
  if (found.length === 0) await db.insert(schema.users).values(user).onConflictDoNothing()
  return user
}

/** 사용자 id만 알 때 쓰는 ensureUser */
export function ensureUserId(userId: string): Promise<User> {
  return ensureUser({ id: userId, login: userId === LOCAL_USER.id ? LOCAL_USER.login : userId })
}

/**
 * 지금 요청을 보낸 사용자. 모든 읽기와 쓰기는 이 사용자가 소유자인지 서버에서 확인합니다.
 *  - local: 고정 사용자 1명 (로컬 개발)
 *  - anonymous: 브라우저마다 익명 계정 하나. proxy가 만들어 준 서명 쿠키로 알아봅니다.
 * 계정 로그인(카카오, 구글, 애플)을 붙일 때는 이 함수만 바꾸면 됩니다.
 */
export async function currentUser(): Promise<User> {
  const e = env()
  if (e.authMode === 'local') return ensureUser(LOCAL_USER)
  if (!e.authSecret) throw new Error('AUTH_MODE=anonymous 에는 AUTH_SECRET 이 필요합니다.')
  const { cookies } = await import('next/headers')
  const id = await verifySession((await cookies()).get(SESSION_COOKIE)?.value, e.authSecret)
  if (!id) throw new AppError(401, 'no_session', '세션을 확인하지 못했습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.')
  return { id: `anon-${id}`, login: `anon-${id}` }
}
