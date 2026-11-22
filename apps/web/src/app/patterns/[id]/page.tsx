import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { SiteHeader } from '@/components/SiteHeader'
import { WorkspaceScreen } from '@/components/workspace/WorkspaceScreen'
import { currentUser } from '@/server/auth'
import { getAvatar } from '@/server/avatar'
import { AppError } from '@/server/errors'
import { getPatternView, listProgress, listRings, type PatternView } from '@/server/patterns'

export const dynamic = 'force-dynamic'

/** 도안은 올린 사람만 봅니다. 남의 도안이나 없는 도안은 null 입니다. */
const loadView = cache(async (id: string): Promise<{ userId: string; view: PatternView } | null> => {
  const user = await currentUser()
  try {
    return { userId: user.id, view: await getPatternView(user.id, id) }
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null
    throw error
  }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const loaded = await loadView(id)
  return { title: loaded ? `${loaded.view.title} · 작업 화면` : '작업 화면' }
}

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const loaded = await loadView(id)
  if (!loaded) notFound()
  const { userId, view } = loaded

  // 도안의 상태에 맞는 화면으로 보냅니다.
  const base = `/patterns/${encodeURIComponent(view.id)}`
  if (view.status === 'needs_review') redirect(`${base}/review`)
  if (view.status !== 'ready' || !view.ir) redirect(`${base}/reading`)
  if (view.gaugeMode === 'unset') redirect(`${base}/gauge`)

  const [entries, rings, avatar] = await Promise.all([listProgress(userId, view.id), listRings(userId, view.id), getAvatar(userId)])

  return (
    <>
      <SiteHeader current="library" />
      <main id="main">
        <WorkspaceScreen
          // 게이지를 다시 맞추면 도안의 숫자가 바뀌므로 처음부터 다시 그립니다.
          key={`${view.versionKind}:${view.gaugeMode}:${view.myGauge?.stitches ?? ''}x${view.myGauge?.rows ?? ''}`}
          view={view}
          ir={view.ir}
          initialEntries={entries}
          initialRings={rings}
          avatar={avatar.effective}
          renderedAt={Date.now()}
        />
      </main>
    </>
  )
}
