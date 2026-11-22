import { currentUser } from '@/server/auth'
import { planOf } from '@/server/billing'
import { env, pdfReading } from '@/server/env'
import { api } from '@/server/http'

export const dynamic = 'force-dynamic'

export const GET = api(async () => {
  const user = await currentUser()
  const e = env()
  // 익명 계정의 id는 화면에 보일 까닭이 없어 이름만 돌려줍니다.
  return { user: { login: e.authMode === 'anonymous' ? '손님' : user.login }, plan: await planOf(user.id), authMode: e.authMode, billingProvider: e.billingProvider, canReadPdf: !!e.anthropicApiKey, pdfReading: pdfReading(e), maxPdfBytes: e.maxPdfBytes }
})
