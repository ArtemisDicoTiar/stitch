import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { GaugeScreen } from '@/components/gauge/GaugeScreen'
import { SiteHeader } from '@/components/SiteHeader'
import { currentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { getPatternView, listProgress, listRings, type PatternView } from '@/server/patterns'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: '게이지 맞추기' }

export default async function GaugePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()

  let view: PatternView
  try {
    view = await getPatternView(user.id, id)
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound()
    throw error
  }

  // 확인을 마친 도안만 게이지를 맞춥니다. 그 전이면 상태에 맞는 화면으로 보냅니다.
  const base = `/patterns/${encodeURIComponent(view.id)}`
  if (view.status === 'needs_review') redirect(`${base}/review`)
  if (view.status !== 'ready' || !view.originalIr) redirect(`${base}/reading`)

  // 버전이 바뀌면 서버가 기록과 단수링을 옮깁니다. 옮길 것이 있는지 미리 알려 주려고 셉니다.
  const [entries, rings] = await Promise.all([listProgress(user.id, view.id), listRings(user.id, view.id)])

  return (
    <>
      <SiteHeader />
      <main id="main">
        <GaugeScreen
          patternId={view.id}
          title={view.title}
          originalIr={view.originalIr}
          gaugeMode={view.gaugeMode}
          myGauge={view.myGauge}
          versionKind={view.versionKind}
          records={{ entries: entries.length, rings: rings.length }}
        />
      </main>
    </>
  )
}
