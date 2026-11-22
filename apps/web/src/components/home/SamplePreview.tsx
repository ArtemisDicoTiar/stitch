'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Expanded, Pattern, Progress } from '@stitch/pattern-ir'
// 타입만 가져옵니다. three.js가 든 본체는 아래에서 브라우저가 필요할 때 불러옵니다.
import type { Avatar, Viewer } from '@stitch/render-3d'
import styles from './SamplePreview.module.css'

/**
 * 저장소의 직접 쓴 예시 도안을 3D로 보여 주는 작은 미리보기.
 * three.js와 엔진은 화면에 가까워졌을 때 브라우저에서만 불러옵니다.
 * 3D를 불러오지 못하거나 WebGL을 쓸 수 없으면 조용한 자리 표시만 남깁니다.
 */
export type SamplePreviewProps = {
  sample: 'practice-hood' | 'garter-scarf'
  /** 뜬 만큼(0~1). 없으면 다 뜬 모습입니다. */
  progress?: number
  avatar?: 'default' | 'styled'
  height: number
  /** 화면 낭독기에 읽히는 설명. 3D가 안 될 때는 글자로도 보입니다. */
  label: string
}

/** 꾸민 마네킹 예시: 피부 톤, 앞머리, 둥근테 안경 */
const STYLED_AVATAR: Avatar = { face: 'round', skin: 'tone2', hair: 'bangs', glasses: 'round' }

/** 진행률(0~1)을 엔진이 쓰는 위치(단, 코)로 바꿉니다. */
function positionAt(expanded: Expanded, fraction: number): Progress {
  const rows = expanded.blocks.flatMap((b) => b.rows)
  const target = Math.round(Math.min(1, Math.max(0, fraction)) * expanded.totalStitches)
  if (target <= 0 || rows.length === 0) return { row: 0, stitch: 0 }
  let done = 0
  for (const r of rows) {
    if (done + r.cells.length >= target) return { row: r.g, stitch: target - done }
    done += r.cells.length
  }
  const last = rows[rows.length - 1]
  return { row: last.g, stitch: last.cells.length }
}

type State = 'idle' | 'ready' | 'unavailable'

export function SamplePreview({ sample, progress, avatar = 'default', height, label }: SamplePreviewProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [near, setNear] = useState(false)
  const [state, setState] = useState<State>('idle')

  // 화면 가까이 왔을 때에만 3D를 준비합니다.
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(box)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!near) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let viewer: Viewer | null = null

    const start = async () => {
      try {
        const [r3d, engine, fixtures] = await Promise.all([import('@stitch/render-3d'), import('@stitch/engine'), import('@stitch/fixtures')])
        if (cancelled) return
        if (typeof r3d.createViewer !== 'function') throw new Error('3D 보기를 불러오지 못했습니다.')
        const pattern: Pattern = sample === 'garter-scarf' ? fixtures.garterScarf : fixtures.practiceHood
        const expanded = engine.expand(pattern)
        viewer = r3d.createViewer(canvas, {
          expanded,
          template: pattern.template ?? 'none',
          // 펼친 결과에는 게이지가 없어 따로 넘깁니다. 빼면 기본 게이지 크기로 그려집니다.
          gauge: pattern.gauge ?? null,
          // null이면 다 뜬 모습, 값이 있으면 그 단과 코까지만 실로 채웁니다.
          progress: progress === undefined ? null : positionAt(expanded, progress),
          avatar: avatar === 'styled' ? STYLED_AVATAR : r3d.DEFAULT_AVATAR,
          // 놓이는 자리의 바탕이 그대로 보이게 투명하게 그립니다.
          background: null,
          interactive: false,
          autoRotate: true,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        })
        setState('ready')
      } catch {
        // 불러오기 실패, WebGL 없음(WebGLUnavailableError), 그릴 수 없는 모양 모두 같은 자리 표시로 갑니다.
        if (!cancelled) setState('unavailable')
      }
    }
    void start()

    return () => {
      cancelled = true
      try {
        viewer?.dispose()
      } catch {
        // 이미 정리된 경우
      }
      viewer = null
      setState('idle')
    }
  }, [near, sample, progress, avatar])

  return (
    <div ref={boxRef} className={styles.box} style={{ '--h': `${height}px` } as CSSProperties} role="img" aria-label={label} data-preview={state}>
      {/* 값이 바뀌면 새 캔버스에서 다시 시작합니다. 정리한 캔버스는 WebGL을 다시 열지 못할 수 있습니다. */}
      <canvas key={`${sample}:${avatar}:${progress ?? 'done'}`} ref={canvasRef} className={styles.canvas} data-ready={state === 'ready' || undefined} aria-hidden="true" />
      {/* 불러오는 동안에는 흐린 그림만, 3D를 쓸 수 없으면 설명 글자가 있는 자리 표시를 보입니다. */}
      {state !== 'ready' && (
        <div className={styles.placeholder} data-loading={state === 'idle' || undefined} data-small={height < 180 || undefined}>
          <svg className={styles.glyph} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="20" cy="28" r="13" />
            <path d="M9 21.5c6.5 2 15.5 2 22 0" />
            <path d="M7.5 30.5c7.5 3 17.5 3 25 0" />
            <path d="M15 40c-1.5-8 0-17 5-25" />
            <path d="M29 18.5L42 5.5" />
            <path d="M40 3.5l4 4" />
          </svg>
          <span className={styles.label}>{label}</span>
        </div>
      )}
    </div>
  )
}
