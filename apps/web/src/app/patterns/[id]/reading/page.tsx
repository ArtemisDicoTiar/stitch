import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { ReadingClient } from '@/components/upload/ReadingClient'
import { Steps } from '@/components/upload/Steps'
import { UploadAside } from '@/components/upload/UploadAside'
import styles from '@/components/upload/Upload.module.css'
import { currentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { jobView } from '@/server/job-view'
import { latestJob, ownedPattern, type PatternRow } from '@/server/patterns'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '읽는 중' }

export default async function ReadingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  let pattern: PatternRow
  try {
    pattern = await ownedPattern(user.id, id)
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound()
    throw e
  }
  const row = await latestJob(id)
  const running = row?.status === 'queued' || row?.status === 'running'
  // 이미 다 읽은 도안이면 상태에 맞는 화면으로 보냅니다.
  // (IR은 저장됐지만 작업 기록이 아직 마무리되지 않은 짧은 사이에는 여기서 기다립니다.)
  if (pattern.status === 'needs_review' && !running) redirect(`/patterns/${id}/review`)
  if (pattern.status === 'ready') redirect(pattern.gaugeMode === 'unset' ? `/patterns/${id}/gauge` : `/patterns/${id}`)

  const job = jobView(row, false)
  return (
    <>
      <SiteHeader current="upload" />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <Steps current={1} />
          <ReadingClient id={id} initial={{ patternStatus: pattern.status, title: pattern.title, job }}>
            <UploadAside />
          </ReadingClient>
        </div>
      </main>
    </>
  )
}
