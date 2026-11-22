'use client'

import { useEffect, useState } from 'react'
import type { Expanded } from '@stitch/pattern-ir'
import styles from './Review.module.css'

/**
 * 지금 읽은 대로 그린 기호 도안. 펼쳤을 때만 그리고, 고치면 다시 그립니다.
 * 그림은 <img>로 넣어 SVG 안의 내용이 페이지에서 실행되지 않게 합니다.
 */
export function ChartPreview({ expanded }: { expanded: Expanded }) {
  const [open, setOpen] = useState(false)
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    import('@stitch/render-chart')
      .then(({ renderChartSvg }) => {
        if (!alive) return
        setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderChartSvg(expanded))}`)
        setFailed(false)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [open, expanded])

  return (
    <details className={styles.chart} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className={styles.chartSummary}>기호 도안 미리 보기</summary>
      <p className={styles.sourceNote}>지금 읽은 내용으로 그린 기호 도안이에요. 고치면 바로 다시 그려집니다.</p>
      {failed ? (
        <p className="notice">미리 보기를 그리지 못했어요. 확인을 마치는 데는 문제가 없어요.</p>
      ) : src ? (
        <div className={styles.chartView} tabIndex={0} role="group" aria-label="기호 도안 미리 보기">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.chartImg} src={src} alt={`기호 도안: ${expanded.totalRows}단`} />
        </div>
      ) : (
        open && <p className={styles.sourceNote}>그리는 중이에요…</p>
      )}
    </details>
  )
}
