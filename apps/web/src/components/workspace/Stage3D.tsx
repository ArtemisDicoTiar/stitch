'use client'

import { useCallback, useRef, useState, type ReactNode } from 'react'
import type { Expanded, GaugeSize, Template } from '@stitch/pattern-ir'
import type { PickPosition, Ring, ViewPreset } from '@stitch/render-3d'
import type { Avatar } from '@stitch/render-3d/avatar'
import { supportsTemplate } from '@stitch/render-3d/garment'
import { Viewer3D, type Viewer3DFailure, type Viewer3DHandle, type Viewer3DReady } from '@/components/knit/Viewer3D'
import type { Pos } from './position'
import styles from './Workspace.module.css'

/** 3D를 눌렀을 때 하는 일 */
export type ClickMode = 'view' | 'pos' | 'ring'

type Props = {
  expanded: Expanded
  template: Template | undefined
  gauge: GaugeSize | null
  title: string
  shown: Pos
  rings: readonly Ring[]
  avatar: Avatar
  mode: ClickMode
  onMode: (mode: ClickMode) => void
  onPick: (pos: PickPosition) => void
  onRingColors: (colors: readonly string[]) => void
  /** 3D를 그리지 못하게 됐을 때 (WebGL을 쓸 수 없는 기기 등) */
  onUnavailable: () => void
  /** 진행 카드 */
  badge: ReactNode
}

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: 'front', label: '앞' },
  { id: 'side', label: '옆' },
  { id: 'back', label: '뒤' },
  { id: 'top', label: '위' },
]

const MODES: { id: ClickMode; label: string; short: string }[] = [
  { id: 'view', label: '둘러보기', short: '둘러보기' },
  { id: 'pos', label: '진행 위치 찍기', short: '위치 찍기' },
  { id: 'ring', label: '단수링 달기', short: '단수링' },
]

/**
 * 3D 무대. 뜬 부분은 실로, 남은 부분은 비쳐 보입니다.
 * 맞는 형태가 없거나 WebGL을 쓸 수 없으면 3D 없이 진행 카드만 보여 줍니다.
 */
export function Stage3D({ expanded, template, gauge, title, shown, rings, avatar, mode, onMode, onPick, onRingColors, onUnavailable, badge }: Props) {
  const supported = supportsTemplate(template)
  const viewer = useRef<Viewer3DHandle>(null)
  const [failure, setFailure] = useState<Viewer3DFailure | null>(null)
  const [ready, setReady] = useState(false)
  const [hasMannequin, setHasMannequin] = useState(false)
  const [mannequinOn, setMannequinOn] = useState(true)
  const [garmentOn, setGarmentOn] = useState(true)
  const [spin, setSpin] = useState(false)
  /** 다 뜬 모습 보기: 진행 위치와 상관없이 전부 실로 채워 보여 줍니다. */
  const [finished, setFinished] = useState(false)

  const onReady = useCallback(
    (info: Viewer3DReady) => {
      setReady(true)
      setHasMannequin(info.hasMannequin)
      onRingColors(info.ringColors)
    },
    [onRingColors],
  )

  const onFail = useCallback(
    (reason: Viewer3DFailure) => {
      setFailure(reason)
      onUnavailable()
    },
    [onUnavailable],
  )

  if (!supported || !template || failure) {
    return (
      <div className={styles.stageNone} data-stage="none">
        {badge}
        <p className={styles.stageNoneText}>
          {!supported || !template
            ? '이 도안에 맞는 3D 형태가 없어서, 3D 없이 기호 도안과 진행 표시만 제공합니다.'
            : failure === 'webgl'
              ? '이 기기에서는 3D를 그릴 수 없어서(WebGL 사용 불가), 기호 도안과 진행 표시만 제공합니다.'
              : '3D를 그리지 못해서, 기호 도안과 진행 표시만 제공합니다.'}
        </p>
      </div>
    )
  }

  return (
    <div className={styles.stageWrap}>
      <div className={styles.stage} data-stage="3d" data-ready={ready} data-mode={mode}>
        <Viewer3D
          ref={viewer}
          className={styles.viewer}
          expanded={expanded}
          template={template}
          gauge={gauge}
          progress={finished ? null : shown}
          rings={rings}
          avatar={avatar}
          garmentVisible={garmentOn}
          mannequinVisible={mannequinOn}
          autoRotate={spin}
          onPick={onPick}
          onReady={onReady}
          onFail={onFail}
          label={`${title}의 3D 모습. 뜬 부분은 실로, 남은 부분은 비쳐 보입니다`}
        />
        {!ready && <p className={styles.stageLoading}>3D 편물을 만드는 중…</p>}

        {badge}

        {ready && (
          <div className={styles.modes} role="group" aria-label="3D를 눌렀을 때 하는 일">
            {MODES.map((m) => (
              <button key={m.id} type="button" className={styles.modeBtn} aria-pressed={mode === m.id} onClick={() => onMode(m.id)}>
                <span className={styles.wide}>{m.label}</span>
                <span className={styles.narrow}>{m.short}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {ready && (
        <div className={styles.viewbar} role="toolbar" aria-label="3D 보기">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" className={styles.chipBtn} onClick={() => viewer.current?.setView(v.id)} aria-label={`${v.label}에서 보기`}>
              {v.label}
            </button>
          ))}
          <button type="button" className={styles.chipBtn} aria-label="3D 멀리 보기" onClick={() => viewer.current?.zoomBy(1 / 1.25)}>
            −
          </button>
          <button type="button" className={styles.chipBtn} aria-label="3D 가까이 보기" onClick={() => viewer.current?.zoomBy(1.25)}>
            +
          </button>
          <button type="button" className={styles.chipBtn} onClick={() => viewer.current?.resetView()}>
            처음 보기
          </button>
          <button type="button" className={styles.chipBtn} aria-pressed={spin} onClick={() => setSpin((v) => !v)}>
            자동 회전
          </button>
          <button type="button" className={styles.chipBtn} aria-pressed={finished} onClick={() => setFinished((v) => !v)}>
            완성 모습
          </button>
          {hasMannequin && (
            <>
              <button type="button" className={styles.chipBtn} aria-pressed={mannequinOn} onClick={() => setMannequinOn((v) => !v)}>
                마네킹
              </button>
              <button type="button" className={styles.chipBtn} aria-pressed={!garmentOn} onClick={() => setGarmentOn((v) => !v)}>
                벗은 모습
              </button>
            </>
          )}
        </div>
      )}
      <p className={styles.stageNote}>
        3D는 참고용 모양입니다. 실제 크기와 모양은 도안과 기호 도안을 따라 주세요.
        {finished && ' 지금은 다 뜬 모습을 보여 주고 있어요.'}
        {mode === 'pos' && ' 뜬 마지막 코를 누르면 그 위치가 입력돼요.'}
        {mode === 'ring' && ' 코를 누르면 단수링이 달리고, 같은 코를 한 번 더 누르면 빠져요.'}
      </p>
    </div>
  )
}
