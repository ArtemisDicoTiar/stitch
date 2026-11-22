import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { ReviewClient } from '@/components/review/ReviewClient'
import styles from '@/components/review/Review.module.css'
import { Steps } from '@/components/upload/Steps'
import { currentUser } from '@/server/auth'
import { AppError } from '@/server/errors'
import { jobView } from '@/server/job-view'
import { getPatternView, latestJob, type PatternView } from '@/server/patterns'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '읽은 내용 확인' }

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await currentUser()
  let view: PatternView
  try {
    view = await getPatternView(user.id, id)
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound()
    throw e
  }
  // 확인 화면은 원본 IR을 고칩니다. (내 게이지로 다시 계산한 파생본은 원본에서 다시 만들어집니다.)
  const ir = view.originalIr ?? view.ir
  // 아직 읽는 중이거나 읽지 못한 도안은 읽는 중 화면이 맡습니다.
  const row = await latestJob(id)
  const running = row?.status === 'queued' || row?.status === 'running'
  if (view.status === 'reading' || view.status === 'failed' || running || !ir) redirect(`/patterns/${id}/reading`)

  const job = jobView(row)
  return (
    <>
      <SiteHeader current="upload" />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <Steps current={2} />
          <ReviewClient pattern={{ ...view, ir, originalIr: null }} job={job} />
        </div>
      </main>
    </>
  )
}
