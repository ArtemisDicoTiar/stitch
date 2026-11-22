import { NextResponse, type NextRequest } from 'next/server'
import { issueSession, SESSION_COOKIE, SESSION_MAX_AGE, verifySession } from '@/server/session'

/**
 * 익명 세션 쿠키를 만들어 줍니다 (AUTH_MODE=anonymous 일 때만).
 * 쿠키가 없거나 서명이 맞지 않는 요청에는 새 id를 주고, 같은 요청 안에서도 바로 보이게 요청 헤더에 넣어 넘깁니다.
 */
export async function proxy(request: NextRequest) {
  if (process.env.AUTH_MODE !== 'anonymous') return NextResponse.next()
  const secret = process.env.AUTH_SECRET
  if (!secret) return NextResponse.next()
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value, secret)) return NextResponse.next()

  const value = await issueSession(secret)
  const headers = new Headers(request.headers)
  const others = request.cookies
    .getAll()
    .filter((c) => c.name !== SESSION_COOKIE)
    .map((c) => `${c.name}=${c.value}`)
  headers.set('cookie', [...others, `${SESSION_COOKIE}=${value}`].join('; '))
  const res = NextResponse.next({ request: { headers } })
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: SESSION_MAX_AGE })
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
