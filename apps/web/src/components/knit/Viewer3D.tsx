'use client'

/**
 * 3D 보기(@stitch/render-3d)를 React에 얹는 얇은 포장.
 * three.js는 서버에서 불러오지 않도록 effect 안에서 import() 합니다.
 * 진행 위치, 단수링, 마네킹이 바뀌어도 다시 만들지 않고 손잡이의 set 함수로만 바꿉니다.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { Expanded, GaugeSize, Progress, Template } from '@stitch/pattern-ir'
import type { PickPosition, Ring, ViewPreset, Viewer } from '@stitch/render-3d'
import type { Avatar } from '@stitch/render-3d/avatar'

export type Viewer3DHandle = {
  setView(preset: ViewPreset): void
  zoomBy(factor: number): void
  resetView(): void
}

export type Viewer3DReady = {
  /** 마네킹에 입히는 형태인지 (평면 형태는 마네킹이 없습니다) */
  hasMannequin: boolean
  /** 단수링 색 순서 */
  ringColors: readonly string[]
}

/** webgl: 이 기기에서 WebGL을 쓸 수 없음. error: 그 밖의 이유로 그리지 못함 */
export type Viewer3DFailure = 'webgl' | 'error'

type Props = {
  expanded: Expanded
  template: Template
  /** 10cm 기준 코와 단. 펼친 결과에는 게이지가 없어서 꼭 넘깁니다. */
  gauge: GaugeSize | null
  progress: Progress | null
  rings: readonly Ring[]
  avatar: Avatar
  garmentVisible?: boolean
  mannequinVisible?: boolean
  autoRotate?: boolean
  onPick?: (pos: PickPosition) => void
  onReady?: (info: Viewer3DReady) => void
  onFail?: (reason: Viewer3DFailure) => void
  /** 스크린 리더가 읽는 그림 설명 */
  label: string
  className?: string
  ref?: Ref<Viewer3DHandle>
}

export function Viewer3D({ expanded, template, gauge, progress, rings, avatar, garmentVisible = true, mannequinVisible = true, autoRotate = false, onPick, onReady, onFail, label, className, ref }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewer = useRef<Viewer | null>(null)
  const latest = useRef({ progress, rings, avatar, garmentVisible, mannequinVisible, autoRotate, onPick, onReady, onFail, label })
  latest.current = { progress, rings, avatar, garmentVisible, mannequinVisible, autoRotate, onPick, onReady, onFail, label }

  const gs = gauge?.stitches
  const gr = gauge?.rows
  useEffect(() => {
    const el = host.current
    if (!el) return
    let cancelled = false
    let made: Viewer | null = null
    // 보기 하나에 캔버스 하나. 다시 만들 때 앞의 WebGL 컨텍스트를 이어 쓰지 않습니다.
    const canvas = document.createElement('canvas')
    canvas.setAttribute('role', 'img')
    canvas.setAttribute('aria-label', latest.current.label)
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline-offset:-3px'
    el.appendChild(canvas)

    import('@stitch/render-3d')
      .then((mod) => {
        if (cancelled) return
        const now = latest.current
        try {
          made = mod.createViewer(canvas, {
            expanded,
            template,
            gauge: gs && gr ? { stitches: gs, rows: gr } : null,
            progress: now.progress,
            rings: now.rings,
            avatar: now.avatar,
            background: null,
            autoRotate: now.autoRotate,
            onPick: (p) => latest.current.onPick?.(p),
          })
        } catch (err) {
          canvas.remove()
          latest.current.onFail?.(err instanceof mod.WebGLUnavailableError ? 'webgl' : 'error')
          return
        }
        made.setGarmentVisible(now.garmentVisible)
        made.setMannequinVisible(now.mannequinVisible)
        viewer.current = made
        latest.current.onReady?.({ hasMannequin: made.garment.mannequin !== null, ringColors: mod.RING_COLORS })
      })
      .catch(() => {
        if (cancelled) return
        canvas.remove()
        latest.current.onFail?.('error')
      })

    return () => {
      cancelled = true
      viewer.current = null
      made?.dispose()
      canvas.remove()
    }
  }, [expanded, template, gs, gr])

  const row = progress?.row
  const stitch = progress?.stitch
  useEffect(() => {
    viewer.current?.setProgress(row === undefined || stitch === undefined ? null : { row, stitch })
    const el = host.current
    if (el) {
      el.dataset.row = row === undefined ? '' : String(row)
      el.dataset.stitch = stitch === undefined ? '' : String(stitch)
    }
  }, [row, stitch])

  useEffect(() => {
    viewer.current?.setRings(rings)
  }, [rings])

  useEffect(() => {
    viewer.current?.setAvatar(avatar)
  }, [avatar])

  useEffect(() => {
    viewer.current?.setGarmentVisible(garmentVisible)
  }, [garmentVisible])

  useEffect(() => {
    viewer.current?.setMannequinVisible(mannequinVisible)
  }, [mannequinVisible])

  useEffect(() => {
    viewer.current?.setAutoRotate(autoRotate)
  }, [autoRotate])

  useEffect(() => {
    host.current?.querySelector('canvas')?.setAttribute('aria-label', label)
  }, [label])

  useImperativeHandle(
    ref,
    () => ({
      setView: (p) => viewer.current?.setView(p),
      zoomBy: (f) => viewer.current?.zoomBy(f),
      resetView: () => viewer.current?.resetView(),
    }),
    [],
  )

  return <div ref={host} className={className} data-viewer3d="" />
}
