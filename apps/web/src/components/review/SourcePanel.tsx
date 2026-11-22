'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { SourcePage } from '@/server/types'
import styles from './Review.module.css'

type Box = [number, number, number, number]
export type SourceTarget = {
  /** 고른 단이 바뀌었는지 알아보는 값 */
  key: string
  label: string
  text: string
  source?: { page: number; box: Box }
}

type Props = {
  patternId: string
  hasPdf: boolean
  pages: SourcePage[] | null
  selected: SourceTarget | null
  /** aside: 넓은 화면의 옆 칸. inline: 좁은 화면에서 고른 단 바로 아래 */
  place: 'aside' | 'inline'
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * 원문 한 쪽. PDF에서 꺼낸 글줄을 쪽 크기 그대로의 좌표에 놓아 그립니다.
 * (pdf.js로 쪽을 그대로 그리는 방식은 apps/web이 pdfjs-dist를 직접 의존하게 된 뒤에 바꿉니다.)
 */
function PageSvg({ page, box, zoom }: { page: SourcePage; box: Box | null; zoom: boolean }) {
  const W = page.width
  const H = page.height
  const hl = box ? { x: box[0] * W, y: box[1] * H, w: (box[2] - box[0]) * W, h: (box[3] - box[1]) * H } : null
  let view = [0, 0, W, H]
  if (zoom && hl) {
    const padX = W * 0.03
    const w = Math.min(W, Math.max(hl.w + padX * 2, W * 0.45))
    const h = Math.min(H, Math.max(w * 0.42, hl.h + H * 0.07))
    view = [clamp(hl.x - padX, 0, W - w), clamp(hl.y + hl.h / 2 - h / 2, 0, H - h), w, h]
  }
  const pad = W * 0.008
  return (
    <svg className={styles.pageSvg} viewBox={view.join(' ')} role="img" aria-label={`${page.page}쪽에서 꺼낸 글${hl ? '. 고른 단의 위치가 노란 상자로 표시되어 있습니다' : ''}`}>
      <rect x="0" y="0" width={W} height={H} fill="#ffffff" />
      {hl && <rect className={styles.hl} data-testid="source-highlight" x={hl.x - pad} y={hl.y - pad} width={hl.w + pad * 2} height={hl.h + pad * 2} rx={pad} strokeWidth={W * 0.0035} />}
      {page.lines.map((line, i) => {
        const x = line.box[0] * W
        const w = (line.box[2] - line.box[0]) * W
        const h = (line.box[3] - line.box[1]) * H
        // 상자는 글자 높이의 1.25배(아래로 0.25배)로 잡혀 있습니다. extract.ts 참고.
        return (
          <text key={i} x={x} y={line.box[3] * H - h * 0.2} fontSize={h * 0.8} textLength={w > 1 ? w : undefined} lengthAdjust="spacingAndGlyphs">
            {line.text}
          </text>
        )
      })}
    </svg>
  )
}

export function SourcePanel({ patternId, hasPdf, pages, selected, place }: Props) {
  const titleId = useId()
  // 고른 단 아래에 놓일 때는 구간 제목(h3)보다 낮은 제목을 씁니다.
  const Title = place === 'inline' ? 'h4' : 'h2'
  const viewport = useRef<HTMLDivElement>(null)
  const hasPages = hasPdf && !!pages && pages.length > 0
  const [page, setPage] = useState(selected?.source?.page ?? 1)
  const [zoom, setZoom] = useState(place === 'inline')
  const [seen, setSeen] = useState(selected?.key ?? '')

  // 단을 고르면 그 단이 있는 쪽으로 넘깁니다. 쪽 단추로 다른 쪽을 볼 수도 있습니다.
  const selKey = selected?.key ?? ''
  if (seen !== selKey) {
    setSeen(selKey)
    if (selected?.source) setPage(selected.source.page)
  }

  const current = hasPages ? (pages.find((p) => p.page === page) ?? pages[0]) : null
  const box = current && selected?.source && selected.source.page === current.page ? selected.source.box : null
  const boxKey = box ? box.join(',') : ''

  // 쪽 전체를 볼 때는 강조한 곳이 보이도록 칸 안에서만 스크롤합니다. (창 전체는 움직이지 않습니다.)
  useEffect(() => {
    const el = viewport.current
    if (!el || !boxKey || zoom) return
    const [, y0, , y1] = boxKey.split(',').map(Number)
    const svg = el.firstElementChild
    if (!svg) return
    el.scrollTop = Math.max(0, (svg.clientHeight * (y0 + y1)) / 2 - el.clientHeight / 2)
  }, [boxKey, zoom, current?.page])

  const pdfLink = (
    <a className={styles.pdfLink} href={`/api/patterns/${patternId}/pdf`} target="_blank" rel="noopener noreferrer">
      원본 PDF 열기<span className="sr-only"> (새 창)</span>
    </a>
  )

  if (!hasPages || !current) {
    // 좁은 화면에서는 고른 단의 지시문이 바로 위에 있으므로 되풀이하지 않습니다.
    if (place === 'inline') return null
    return (
      <section className={styles.source} data-place={place} aria-labelledby={titleId}>
        <Title id={titleId} className={styles.sourceTitle}>
          원문
        </Title>
        <p className={styles.sourceNote}>
          {hasPdf ? '이 PDF에서는 글의 위치를 꺼내지 못했어요. 고른 단의 지시문만 보여 드려요.' : '예시 도안에는 원본 PDF가 없어요. 고른 단의 지시문만 보여 드려요.'}
        </p>
        {selected ? (
          <blockquote className={styles.sourceQuote} data-testid="source-text">
            <span className={styles.sourceQuoteLabel}>{selected.label}</span>
            {selected.text}
          </blockquote>
        ) : (
          <p className={styles.sourceHint}>단을 누르면 그 단의 지시문이 여기에 보여요.</p>
        )}
        {hasPdf && pdfLink}
      </section>
    )
  }

  return (
    <section className={styles.source} data-place={place} aria-labelledby={titleId}>
      <div className={styles.sourceHead}>
        <Title id={titleId} className={styles.sourceTitle}>
          원본 PDF
        </Title>
        <div className={styles.pageBtns} role="group" aria-label="쪽 고르기">
          {pages.map((p) => (
            <button key={p.page} type="button" className={styles.pageBtn} aria-label={p.page === current.page ? `${p.page}쪽, 지금 보는 쪽` : `${p.page}쪽`} aria-pressed={p.page === current.page} onClick={() => setPage(p.page)}>
              {p.page}
            </button>
          ))}
        </div>
      </div>
      <div ref={viewport} className={styles.pageView} data-zoom={zoom || undefined} tabIndex={0} role="group" aria-label={`원본 ${current.page}쪽`}>
        <PageSvg page={current} box={box} zoom={zoom} />
      </div>
      <div className={styles.sourceFoot}>
        <button type="button" className={styles.zoomBtn} aria-pressed={zoom} disabled={!box} onClick={() => setZoom((z) => !z)}>
          강조한 곳 크게 보기
        </button>
        {pdfLink}
      </div>
      <p className={styles.sourceNote} aria-live="polite">
        {!selected
          ? '단을 누르면 원문의 해당 위치가 노란 상자로 표시돼요.'
          : !selected.source
            ? '이 단은 PDF의 글에서 위치를 찾지 못했어요. 원본 PDF와 견주어 봐 주세요.'
            : box
              ? `${selected.label}의 원문 위치예요.`
              : `${selected.label}의 원문은 ${selected.source.page}쪽에 있어요.`}{' '}
        PDF에서 꺼낸 글을 제자리에 놓아 보여 드려요. 그림과 서식은 보이지 않아요.
      </p>
    </section>
  )
}
