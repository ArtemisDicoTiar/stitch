'use client'

/**
 * 기호 도안(@stitch/render-chart)을 React에 얹는 얇은 포장.
 * 도안은 한 번만 올리고, 진행 위치와 단수링, 고른 칸은 손잡이의 set 함수로만 바꿉니다.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { Expanded, Progress } from '@stitch/pattern-ir'
import { mountChart, type ChartHandle, type ChartLayout, type ChartPick, type ChartRing, type ChartSelection, type MountChartOptions, type ZoomPreset } from '@stitch/render-chart'

export type ChartViewHandle = {
  setZoom(z: number | ZoomPreset): void
  getZoom(): number
  scrollToRow(g: number, opts?: { x?: number; smooth?: boolean }): void
  /** 칸이 화면에서 차지하는 자리 */
  cellRect(row: number, x: number): DOMRect | null
  focus(): void
  /** 스크롤되는 도안 영역 */
  viewport(): HTMLElement | null
  layout(): ChartLayout | null
}

/** 올릴 때 한 번만 읽는 값 */
export type ChartViewOptions = Omit<MountChartOptions, 'onPick' | 'onDismiss' | 'onZoom' | 'progress' | 'rings' | 'selection'>

type Props = {
  expanded: Expanded
  progress: Progress | null
  rings?: ChartRing[]
  selection?: ChartSelection | null
  onPick?: (pick: ChartPick) => void
  onDismiss?: () => void
  onZoom?: (zoom: number) => void
  /** 도안을 올린 뒤 한 번 */
  onMount?: () => void
  options?: ChartViewOptions
  className?: string
  ref?: Ref<ChartViewHandle>
}

const NO_RINGS: ChartRing[] = []

export function ChartView({ expanded, progress, rings = NO_RINGS, selection = null, onPick, onDismiss, onZoom, onMount, options, className, ref }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const handle = useRef<ChartHandle | null>(null)
  // 올릴 때 넘긴 콜백은 바뀌지 않으므로, 언제나 가장 새 함수를 부르도록 ref를 거칩니다.
  const latest = useRef({ progress, rings, selection, onPick, onDismiss, onZoom, onMount, options })
  latest.current = { progress, rings, selection, onPick, onDismiss, onZoom, onMount, options }

  useEffect(() => {
    const el = host.current
    if (!el) return
    const now = latest.current
    const h = mountChart(el, expanded, {
      selectOnPick: false,
      ...now.options,
      progress: now.progress,
      rings: now.rings,
      selection: now.selection,
      onPick: (p) => latest.current.onPick?.(p),
      onDismiss: () => latest.current.onDismiss?.(),
      onZoom: (z) => latest.current.onZoom?.(z),
    })
    handle.current = h
    latest.current.onMount?.()
    return () => {
      handle.current = null
      h.destroy()
    }
  }, [expanded])

  const row = progress?.row
  const stitch = progress?.stitch
  useEffect(() => {
    handle.current?.setProgress(row === undefined || stitch === undefined ? null : { row, stitch })
    // 테스트와 보조 기술이 지금 그려진 위치를 읽을 수 있게 같은 자리에서 적어 둡니다.
    const el = host.current
    if (el) {
      el.dataset.row = row === undefined ? '' : String(row)
      el.dataset.stitch = stitch === undefined ? '' : String(stitch)
    }
  }, [row, stitch, expanded])

  useEffect(() => {
    handle.current?.setRings(rings)
  }, [rings, expanded])

  const selRow = selection?.row
  const selStitch = selection?.stitch
  useEffect(() => {
    handle.current?.setSelection(selRow === undefined || selStitch === undefined ? null : { row: selRow, stitch: selStitch })
  }, [selRow, selStitch, expanded])

  useImperativeHandle(
    ref,
    () => ({
      setZoom: (z) => handle.current?.setZoom(z),
      getZoom: () => handle.current?.getZoom() ?? 1,
      scrollToRow: (g, opts) => handle.current?.scrollToRow(g, opts),
      cellRect: (r, x) => handle.current?.cellRect(r, x) ?? null,
      focus: () => handle.current?.focus(),
      viewport: () => host.current?.querySelector<HTMLElement>('.sc-view') ?? null,
      layout: () => handle.current?.layout ?? null,
    }),
    [],
  )

  return <div ref={host} className={className} data-chart="" />
}
