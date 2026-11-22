'use client'

import { useSyncExternalStore } from 'react'
import type { Expanded } from '@stitch/pattern-ir'
import { fmtFull, isComplete, percentOf, posText, sectionText, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

/** 화면이 지금 보여 주는 위치의 종류 */
export type ShownKind = 'live' | 'draft' | 'entry' | 'replay' | 'play'

const KIND_LABEL: Record<ShownKind, string> = {
  live: '지금 진행',
  draft: '미리보기 · 아직 저장 전',
  entry: '지난 기록 보기',
  replay: '기록 재생 중',
  play: '단 재생 중 · 저장하지 않음',
}

type Props = {
  expanded: Expanded
  kind: ShownKind
  shown: Pos
  /** 기록이 하나라도 있는지 */
  started: boolean
  /** 보여 주는 기록의 시각 */
  at: string | null
  finishingTotal: number
  finishingDone: number
  /** 지난 기록이나 기록 재생을 보다가 지금 위치로 돌아가기 */
  onBack: () => void
}

const noop = () => () => {}
/** 브라우저에서 그린 뒤인지. 날짜와 시간은 보는 사람의 시간대로 적어야 해서 서버에서는 비워 둡니다. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  )
}

/** 진행 카드: 지금 단과 코, 구간, 전체에서의 비율 */
export function ProgressBadge({ expanded, kind, shown, started, at, finishingTotal, finishingDone, onBack }: Props) {
  const done = isComplete(expanded, shown)
  const work = workingPos(expanded, shown)
  const pct = percentOf(expanded, shown)
  const live = kind === 'live'
  const main = done ? (live && finishingTotal > 0 ? (finishingDone >= finishingTotal ? '완성!' : `뜨기 완료 · 마무리 ${finishingDone}/${finishingTotal}`) : '뜨기 완료') : posText(expanded, work)
  const sub = done ? `${expanded.totalRows}단 모두 뜸` : sectionText(expanded, work.row)
  const hydrated = useHydrated()
  const foot = kind === 'draft' ? '‘여기까지 떴어요’를 누르면 저장돼요' : !started && live ? '아직 기록이 없어요' : at && hydrated && (live || kind === 'entry') ? `${fmtFull(at)} 기록` : ''
  return (
    <div className={styles.badge} data-kind={kind} data-testid="progress-badge" data-row={work.row} data-stitch={work.stitch} data-percent={pct}>
      <span className={styles.badgeKind}>{live && !started ? '시작 전' : KIND_LABEL[kind]}</span>
      <strong className={styles.badgePos}>{main}</strong>
      <div className={styles.bar} role="progressbar" aria-label="전체 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={styles.barFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.badgeRow}>
        <span className={styles.badgeSection}>{sub}</span>
        <strong className={styles.badgePct}>{pct}%</strong>
      </div>
      {foot && <span className={styles.badgeFoot}>{foot}</span>}
      {(kind === 'entry' || kind === 'replay') && (
        <button type="button" className={styles.badgeBack} onClick={onBack}>
          지금 위치로 돌아가기
        </button>
      )}
    </div>
  )
}
