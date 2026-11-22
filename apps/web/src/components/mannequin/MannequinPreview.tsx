'use client'

import { useEffect, useRef, useState } from 'react'
// 타입만 가져옵니다. three.js가 든 본체는 아래 effect에서 브라우저가 불러옵니다.
import type { Avatar, ViewPreset, Viewer } from '@stitch/render-3d'
import styles from './Mannequin.module.css'

export type PreviewState = 'loading' | 'ready' | 'unavailable'

type Props = {
  avatar: Avatar
  /** 모자(편물)를 쓴 모습인지 */
  hoodOn: boolean
  onHoodChange: (on: boolean) => void
  /** 왼쪽 위 표시: 저장 전인지, 저장한 모습인지 */
  badge: { text: string; unsaved: boolean }
  /** 지금 고른 모습을 글로 적은 것 ("얼굴형 기본, 피부 톤 …"). 화면 낭독기와 3D를 못 쓰는 기기에서 씁니다. */
  summary: string
}

/** 보이는 글자는 한 글자이고, 화면 낭독기에는 name 전체를 읽어 줍니다. */
const VIEWS: { preset: ViewPreset; label: string; name: string }[] = [
  { preset: 'front', label: '앞', name: '앞에서 보기' },
  { preset: 'side', label: '옆', name: '옆에서 보기' },
  { preset: 'back', label: '뒤', name: '뒤에서 보기' },
]

/**
 * 마네킹 3D 미리보기. 저장소의 직접 쓴 예시 도안(연습용 후드)을 다 뜬 모습으로 씌웁니다.
 *
 * 보기(viewer)는 한 번만 만들고, 꾸미기 값이 바뀌면 `setAvatar` 만 부릅니다.
 * 3D를 불러오지 못하거나 WebGL을 쓸 수 없으면 자리 표시와 설명 한 줄만 남기고,
 * 고르기와 저장은 그대로 됩니다.
 */
export function MannequinPreview({ avatar, hoodOn, onHoodChange, badge, summary }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const avatarRef = useRef(avatar)
  const hoodRef = useRef(hoodOn)
  const [state, setState] = useState<PreviewState>('loading')

  // 고른 값은 바로 보기에 넘깁니다. 보기를 아직 만드는 중이면 ref에 두었다가 만든 직후에 씁니다.
  useEffect(() => {
    avatarRef.current = avatar
    viewerRef.current?.setAvatar(avatar)
  }, [avatar])
  useEffect(() => {
    hoodRef.current = hoodOn
    viewerRef.current?.setGarmentVisible(hoodOn)
  }, [hoodOn])

  // 보기는 한 번만 만듭니다. 꾸미기 값에 따라 다시 만들지 않습니다.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let viewer: Viewer | null = null
    const start = async () => {
      try {
        const [r3d, engine, fixtures] = await Promise.all([import('@stitch/render-3d'), import('@stitch/engine'), import('@stitch/fixtures')])
        if (cancelled) return
        const pattern = fixtures.practiceHood
        viewer = r3d.createViewer(canvas, {
          expanded: engine.expand(pattern),
          template: 'hood',
          // 펼친 결과(Expanded)에는 게이지가 없어서 도안의 게이지를 따로 넘깁니다.
          gauge: pattern.gauge,
          // 다 뜬 모습
          progress: null,
          avatar: avatarRef.current,
          // 바탕은 CSS의 코코아색 그라데이션이 비쳐 보이게 둡니다.
          background: null,
          interactive: true,
        })
        viewer.setGarmentVisible(hoodRef.current)
        viewerRef.current = viewer
        setState('ready')
      } catch {
        // 불러오기 실패, WebGL 없음(WebGLUnavailableError) 모두 같은 자리 표시로 갑니다.
        if (!cancelled) setState('unavailable')
      }
    }
    void start()

    return () => {
      cancelled = true
      viewerRef.current = null
      try {
        viewer?.dispose()
      } catch {
        // 이미 정리된 경우
      }
      viewer = null
    }
  }, [])

  // 미리보기 위에서 휠을 굴리면 확대되지 않고 페이지가 그대로 스크롤되게 합니다.
  // 확대는 버튼, 두 손가락 벌리기, Ctrl(⌘)+휠로 합니다.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation()
    }
    stage.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => stage.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  const ready = state === 'ready'
  const unavailable = state === 'unavailable'

  return (
    <div className={styles.stageCol} data-preview={state} data-testid="preview">
      <div ref={stageRef} className={styles.stage}>
        <canvas ref={canvasRef} className={styles.canvas} data-ready={ready || undefined} role="img" aria-label={`마네킹 미리보기. ${summary}. ${hoodOn ? '모자를 쓴 모습' : '모자를 벗은 모습'}`} hidden={unavailable} />

        {state === 'loading' && (
          <div className={styles.loading} aria-hidden="true">
            <Bust />
          </div>
        )}

        {unavailable ? (
          <div className={styles.fallback} data-testid="preview-fallback">
            <Bust />
            <p className={styles.fallbackLine}>이 기기에서는 3D 미리보기를 쓸 수 없어요. 고르기와 저장은 그대로 할 수 있습니다.</p>
            <p className={styles.fallbackSummary}>지금 고른 모습: {summary}</p>
          </div>
        ) : (
          <>
            <span className={styles.badge} data-unsaved={badge.unsaved || undefined} data-testid="preview-badge">
              {badge.unsaved && <span className={styles.badgeLong}>미리보기 · </span>}
              {badge.text}
            </span>

            <div className={styles.views} role="group" aria-label="보는 방향">
              {VIEWS.map((v) => (
                <button key={v.preset} type="button" className={styles.viewBtn} aria-label={v.name} onClick={() => viewerRef.current?.setView(v.preset)}>
                  {v.label}
                </button>
              ))}
            </div>

            <div className={styles.zoom} role="group" aria-label="확대와 축소">
              <button type="button" className={styles.viewBtn} aria-label="확대" onClick={() => viewerRef.current?.zoomBy(1.25)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button type="button" className={styles.viewBtn} aria-label="축소" onClick={() => viewerRef.current?.zoomBy(0.8)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                  <path d="M5 12h14" />
                </svg>
              </button>
            </div>

            <button type="button" className={styles.home} aria-label="처음 보기로" onClick={() => viewerRef.current?.resetView()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.6-5.9" />
                <path d="M4 4.5V9h4.5" />
              </svg>
            </button>

            <div className={styles.hood} role="group" aria-label="모자">
              <button type="button" className={styles.hoodBtn} aria-pressed={hoodOn} onClick={() => onHoodChange(true)}>
                모자 쓴 모습
              </button>
              <button type="button" className={styles.hoodBtn} aria-label="모자 벗은 모습" aria-pressed={!hoodOn} onClick={() => onHoodChange(false)}>
                벗은 모습
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** 자리 표시에 쓰는 마네킹 윤곽 */
function Bust() {
  return (
    <svg className={styles.bust} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="32" cy="24" rx="12" ry="15" />
      <path d="M27 38v6c0 2-2 4-6 5-6 2-10 5-11 11" />
      <path d="M37 38v6c0 2 2 4 6 5 6 2 10 5 11 11" />
    </svg>
  )
}
