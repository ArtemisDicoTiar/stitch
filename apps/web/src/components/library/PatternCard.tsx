import Link from 'next/link'
import { SamplePreview } from '@/components/home/SamplePreview'
import type { GaugeMode } from '@/server/db/schema'
import type { LibraryItem } from '@/server/patterns'
import { DeletePattern } from './DeletePattern'
import styles from './PatternCard.module.css'

const CRAFT: Record<LibraryItem['craft'], string> = { knit: '대바늘', crochet: '코바늘' }

const STATUS: Record<LibraryItem['status'], { label: string; chip: string }> = {
  reading: { label: '읽는 중', chip: 'chip' },
  needs_review: { label: '확인 필요', chip: 'chip chip-warn' },
  ready: { label: '준비됨', chip: 'chip chip-ok' },
  failed: { label: '읽지 못함', chip: `chip ${styles.chipFailed}` },
}

/** 도안의 상태에 따라 갈 곳 (SCREENS.md 의 규칙) */
export function patternHref(item: Pick<LibraryItem, 'id' | 'status'>, gaugeMode: GaugeMode | null): string {
  const base = `/patterns/${item.id}`
  if (item.status === 'reading' || item.status === 'failed') return `${base}/reading`
  if (item.status === 'needs_review') return `${base}/review`
  if (gaugeMode === 'unset') return `${base}/gauge`
  return base
}

/** 직접 쓴 예시 도안으로 시작한 것만 3D 미리보기가 있습니다. 올린 도안은 목록에 모양 정보가 오지 않습니다. */
function sampleOf(item: LibraryItem): 'practice-hood' | 'garter-scarf' | null {
  if (item.source !== 'sample') return null
  if (item.template === 'hood') return 'practice-hood'
  if (item.template === 'flat') return 'garter-scarf'
  return null
}

const dayFormat = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', timeZone: 'Asia/Seoul' })

function CraftIcon({ craft }: { craft: LibraryItem['craft'] }) {
  return craft === 'knit' ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M5 20L17 5" />
      <path d="M19 20L7 5" />
      <circle cx="17.6" cy="4.2" r="1.2" />
      <circle cx="6.4" cy="4.2" r="1.2" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 21L15.5 7" />
      <path d="M15.5 7c1.2-2.4 3.6-2.8 4.2-1.2c.5 1.4-.9 2.3-2.2 1.6" />
    </svg>
  )
}

function DocIcon({ failed }: { failed?: boolean }) {
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      {failed ? (
        <>
          <path d="M10 13l4 4" />
          <path d="M14 13l-4 4" />
        </>
      ) : (
        <>
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </>
      )}
    </svg>
  )
}

function Thumb({ item }: { item: LibraryItem }) {
  if (item.status === 'reading' || item.status === 'failed') {
    return (
      <div className={styles.thumbPlain}>
        <DocIcon failed={item.status === 'failed'} />
        <span>{item.status === 'failed' ? '도안을 읽지 못했어요' : '읽는 중이라 아직 모양이 없어요'}</span>
      </div>
    )
  }
  const sample = sampleOf(item)
  if (sample) {
    const label = item.row > 0 ? `${item.row}단까지 뜬 ${item.title} 3D 모습` : `${item.title} 3D 모습`
    return (
      <div className={styles.thumb3d}>
        <SamplePreview sample={sample} progress={item.progress} height={220} label={label} />
      </div>
    )
  }
  return (
    <div className={styles.thumbPlain}>
      <span className={styles.thumbCraft}>
        <CraftIcon craft={item.craft} />
      </span>
      <span>{item.status === 'ready' ? '도안을 열면 3D로 볼 수 있어요' : '읽은 내용을 확인해 주세요'}</span>
    </div>
  )
}

export function PatternCard({ item, gaugeMode }: { item: LibraryItem; gaugeMode: GaugeMode | null }) {
  const status = STATUS[item.status]
  const hasShape = item.status === 'needs_review' || item.status === 'ready'
  const percent = Math.round(item.progress * 100)
  return (
    <li className={styles.card} data-pattern-id={item.id} data-status={item.status}>
      <Link href={patternHref(item, gaugeMode)} className={styles.link}>
        <Thumb item={item} />
        <div className={styles.body}>
          <h2 className={styles.title}>{item.title}</h2>
          {hasShape ? (
            <>
              <p className={styles.meta}>
                <span className={styles.craft} data-craft={item.craft}>
                  <CraftIcon craft={item.craft} />
                  {CRAFT[item.craft]}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <span className="sr-only">지금 단과 전체 단 </span>
                  {item.row} / {item.totalRows}단
                </span>
              </p>
              <div className={styles.progress}>
                <div className={styles.track} aria-hidden="true">
                  <div className={styles.fill} style={{ width: `${percent}%` }} />
                </div>
                <strong className={styles.percent}>
                  <span className="sr-only">진행률 </span>
                  {percent}%
                </strong>
              </div>
            </>
          ) : (
            <p className={styles.meta}>{item.status === 'failed' ? '열어서 까닭을 보거나 지울 수 있어요.' : '다 읽으면 확인이 필요해요.'}</p>
          )}
        </div>
      </Link>
      <div className={styles.foot}>
        <span className={styles.when}>
          마지막 변경 <time dateTime={item.updatedAt}>{dayFormat.format(new Date(item.updatedAt))}</time>
        </span>
        <span className={styles.actions}>
          {gaugeMode === 'recalc' && <span className={`chip ${styles.chipLine}`}>내 게이지 적용</span>}
          <span className={status.chip} data-testid="status">
            {status.label}
          </span>
          <DeletePattern id={item.id} title={item.title} />
        </span>
      </div>
    </li>
  )
}
