import { after, NextResponse, type NextRequest } from 'next/server'
import { currentUser } from '@/server/auth'
import { startConversion } from '@/server/convert'
import { AppError } from '@/server/errors'
import { api } from '@/server/http'
import { createFromSample, createFromUpload, listPatterns } from '@/server/patterns'

export const dynamic = 'force-dynamic'
// PDF 변환은 응답을 보낸 뒤에도 이어집니다. 그동안 함수가 살아 있도록 넉넉히 둡니다.
export const maxDuration = 300

export const GET = api(async () => {
  const user = await currentUser()
  return { patterns: await listPatterns(user.id) }
})

/** PDF를 올리거나({file}), 예시 도안으로 시작합니다({sample}). */
export const POST = api(async (req: NextRequest) => {
  const user = await currentUser()
  const type = req.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const body = (await req.json()) as { sample?: string }
    if (!body.sample) throw new AppError(400, 'invalid', '예시 도안 이름이 없습니다.')
    const pattern = await createFromSample(user.id, body.sample)
    return NextResponse.json({ id: pattern.id, status: pattern.status, reused: false }, { status: 201 })
  }
  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) throw new AppError(400, 'no_file', 'PDF 파일을 골라 주세요.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { pattern, jobId, reused } = await createFromUpload(user.id, bytes, file.name)
  if (jobId && !reused) {
    const done = startConversion(jobId)
    after(() => done)
  }
  return NextResponse.json({ id: pattern.id, status: pattern.status, reused }, { status: reused ? 200 : 201 })
})
