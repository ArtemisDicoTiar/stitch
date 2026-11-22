'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiError, apiFetch } from '@/lib/api'
import type { JobView } from '@/server/job-view'
import { FileIcon } from './UploadClient'
import styles from './Upload.module.css'

type PatternStatus = 'reading' | 'needs_review' | 'ready' | 'failed'
type JobState = { patternStatus: PatternStatus; title: string; job: JobView | null }

type Stage = 'upload' | 'extract' | 'structure' | 'verify' | 'feedback' | 'review'
type State = 'done' | 'current' | 'todo' | 'skipped' | 'failed'

/** 변환 작업(conversion_jobs)의 단계를 그대로 보여 줍니다. */
const STAGES: { id: Stage; name: string; desc: string }[] = [
  { id: 'upload', name: '올리기', desc: 'PDF를 비공개 저장소에 둡니다.' },
  { id: 'extract', name: '글 꺼내기', desc: '쪽마다 글과 글자 위치를 뽑아요. 확인 화면에서 원문 위치를 보여 주는 데 씁니다.' },
  { id: 'structure', name: '구조화', desc: '준비물, 게이지, 구간, 단별 지시문으로 나눠요.' },
  { id: 'verify', name: '검산', desc: '줄임과 늘림을 한 코씩 따라가며 도안에 적힌 코 수와 비교해요.' },
  { id: 'feedback', name: '되먹임', desc: '코 수가 맞지 않는 구간만 다시 읽어요.' },
  { id: 'review', name: '확인 준비', desc: '읽은 단마다 원문 위치를 붙이고 확인 화면을 준비해요.' },
]
const STATE_KR: Record<State, string> = { done: '끝남', current: '진행 중', todo: '대기', skipped: '건너뜀', failed: '멈춤' }
const POLL_MS = 1200

const isFinished = (s: JobState) => (s.job?.status === 'done' || s.job?.status === 'needs_review') && (s.patternStatus === 'needs_review' || s.patternStatus === 'ready')
const isFailed = (s: JobState) => s.job?.status === 'failed' || (s.patternStatus === 'failed' && !s.job)

function currentStage(job: JobView | null): Stage {
  if (!job) return 'upload'
  return job.stage === 'done' ? 'review' : job.stage
}

function stageStates(s: JobState, rounds: number): Record<Stage, State> {
  const finished = isFinished(s)
  const failed = isFailed(s)
  const cur = currentStage(s.job)
  const at = STAGES.findIndex((x) => x.id === cur)
  const out = {} as Record<Stage, State>
  STAGES.forEach((x, i) => {
    out[x.id] = finished || i < at ? 'done' : i > at ? 'todo' : failed ? 'failed' : 'current'
  })
  // 되먹임은 검산이 어긋났을 때만 돕니다. 되먹임 뒤에는 검산으로 돌아가므로, 한 번 돌았으면 끝난 것으로 둡니다.
  if (rounds > 0 && cur !== 'feedback' && at >= 3) out.feedback = 'done'
  if (rounds === 0 && (finished || cur === 'review')) out.feedback = 'skipped'
  return out
}

function Dot({ state }: { state: State }) {
  return (
    <span className={styles.dot} data-state={state} aria-hidden="true">
      {state === 'done' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
      {state === 'failed' && (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )}
      {state === 'skipped' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <path d="M6 12h12" />
        </svg>
      )}
    </span>
  )
}

/** children에는 옆 안내(UploadAside)를 넣습니다. */
export function ReadingClient({ id, initial, children }: { id: string; initial: JobState; children?: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<JobState>(initial)
  const [rounds, setRounds] = useState(initial.job?.feedbackRounds ?? 0)
  const [pollError, setPollError] = useState<string | null>(null)
  const [gone, setGone] = useState(false)

  const finished = isFinished(state)
  const failed = isFailed(state)
  const reviewHref = `/patterns/${id}/review`

  // 처음 그린 상태가 낡았을 수 있으므로 열자마자 한 번 읽고, 끝나거나 멈출 때까지 이어서 읽습니다.
  useEffect(() => {
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await apiFetch<JobState>(`/api/patterns/${id}/job`)
        if (stop) return
        setState(next)
        setPollError(null)
        // 확인 준비 단계가 잠깐 0으로 적히므로 가장 큰 회차를 기억합니다.
        setRounds((r) => Math.max(r, next.job?.feedbackRounds ?? 0))
        if (isFinished(next) || isFailed(next)) return
      } catch (e) {
        if (stop) return
        if (e instanceof ApiError && e.status === 404) {
          setGone(true)
          return
        }
        setPollError('진행 상태를 불러오지 못했어요. 다시 시도하고 있어요.')
      }
      timer = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [id])

  useEffect(() => {
    if (!finished) return
    const t = setTimeout(() => router.replace(reviewHref), 900)
    return () => clearTimeout(t)
  }, [finished, reviewHref, router])

  const states = stageStates(state, rounds)
  const cur = currentStage(state.job)
  const curInfo = STAGES.find((x) => x.id === cur)!
  const curIndex = STAGES.indexOf(curInfo) + 1
  const llmCalls = state.job?.llmCalls ?? 0

  let now: string
  if (gone) now = '이 도안을 찾을 수 없어요.'
  else if (finished) now = '다 읽었어요. 확인 화면으로 넘어갑니다.'
  else if (failed) now = `${curInfo.name} 단계에서 멈췄어요.`
  else now = `지금 단계: ${curInfo.name}${cur === 'feedback' && rounds > 0 ? ` ${rounds}회차` : ''} (${curIndex}/${STAGES.length})`

  return (
    <>
      <div className={styles.head}>
        <h1 className={styles.title}>{failed || gone ? '도안을 읽지 못했어요' : finished ? '도안을 다 읽었어요' : '도안을 읽고 있어요'}</h1>
        <p className={styles.lead}>{failed || gone ? '아래 까닭을 확인한 뒤 다시 올려 주세요.' : finished ? '이제 읽은 내용을 확인해 주세요.' : '창을 닫아도 계속 진행돼요. 다 읽으면 내 도안에 나타납니다.'}</p>
      </div>

      <div className={styles.cols}>
        <div className={styles.main}>
          <div className={styles.fileBox}>
            <FileIcon />
            <div className={styles.dropText}>
              <strong className={styles.dropTitle}>{state.title}</strong>
              <span className={styles.dropSub}>올린 PDF</span>
            </div>
            <Link href="/upload" className="btn">
              다른 파일 올리기
            </Link>
          </div>

          {failed && (
            <div className="notice notice-error" role="alert">
              <strong>읽는 중에 멈췄어요.</strong> {state.job?.error ?? '까닭을 알 수 없는 문제가 생겼습니다. 다시 올려 주세요.'}
            </div>
          )}
          {gone && (
            <div className="notice notice-error" role="alert">
              도안이 지워졌거나 주소가 잘못되었어요.
            </div>
          )}
          {pollError && !gone && (
            <p className="notice" role="status">
              {pollError}
            </p>
          )}

          <section className={styles.stages} aria-labelledby="stages-title">
            <h2 id="stages-title" className="sr-only">
              읽는 단계
            </h2>
            <p className={styles.now} aria-live="polite" data-testid="reading-now">
              {now}
            </p>
            <ol className={styles.stageList}>
              {STAGES.map((x) => {
                const st = states[x.id]
                return (
                  <li key={x.id} className={styles.stage} data-stage={x.id} data-state={st}>
                    <Dot state={st} />
                    <div className={styles.stageBody}>
                      <span className={styles.stageName}>
                        <strong>{x.name}</strong>
                        <span className={styles.stageState}>
                          {STATE_KR[st]}
                          {x.id === 'feedback' && rounds > 0 && st !== 'todo' ? ` · ${rounds}회차` : ''}
                        </span>
                      </span>
                      <span className={styles.stageDesc}>
                        {x.id === 'feedback' && st === 'skipped'
                          ? '검산이 한 번에 맞아서 다시 읽지 않았어요.'
                          : x.id === 'verify' && st === 'current' && rounds > 0
                            ? `되먹임 ${rounds}회차에서 고친 구간을 다시 검산하고 있어요.`
                            : x.desc}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className={styles.stageFoot}>
              <span className={styles.footNote} data-testid="llm-calls">
                LLM 호출 {llmCalls}번{failed || gone ? '' : finished ? ' · 다 읽었어요.' : ' · 다 읽으면 확인 화면으로 넘어가요.'}
              </span>
              {finished ? (
                <Link href={reviewHref} className={styles.nextLink}>
                  다음 화면: 읽은 내용 확인
                </Link>
              ) : failed || gone ? (
                <Link href="/upload" className="btn btn-primary">
                  도안 올리기로 돌아가기
                </Link>
              ) : null}
            </div>
          </section>
        </div>
        {children}
      </div>
    </>
  )
}
