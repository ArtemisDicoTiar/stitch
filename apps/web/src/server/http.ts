import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError } from './errors'

/** API 핸들러를 감싸 오류를 같은 모양의 JSON으로 돌려줍니다. */
export function api<A extends unknown[]>(handler: (...args: A) => Promise<Response | object>) {
  return async (...args: A): Promise<Response> => {
    try {
      const out = await handler(...args)
      return out instanceof Response ? out : NextResponse.json(out)
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json({ error: { code: error.code, message: error.message, detail: error.detail } }, { status: error.status })
      }
      if (error instanceof ZodError) {
        return NextResponse.json({ error: { code: 'invalid', message: '보낸 값이 형식에 맞지 않습니다.', detail: error.issues.slice(0, 20) } }, { status: 400 })
      }
      console.error(error)
      return NextResponse.json({ error: { code: 'server', message: '서버에서 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.' } }, { status: 500 })
    }
  }
}

export type RouteParams<K extends string> = { params: Promise<Record<K, string>> }
