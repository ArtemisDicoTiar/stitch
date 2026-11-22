/**
 * 기호 도안을 화면에 올리고 누르기, 키보드, 확대와 축소를 붙입니다.
 * 프레임워크 없이 DOM만 씁니다. 바탕 도안은 한 번만 그리고,
 * 진행 표시, 단수링, 고른 칸은 그 위에 얹은 층만 다시 그립니다.
 */
import type { Expanded, Progress, Side, SymbolId } from '@stitch/pattern-ir'
import { chartLayout, type ChartHit, type ChartLayout, type ChartOptions } from './layout'
import {
  cellOutlineSvg,
  moveCursor,
  progressOverlaySvg,
  ringsOverlaySvg,
  selectionCell,
  workingPosition,
  type ChartRing,
  type ChartSelection,
  type CursorMove,
} from './overlay'
import { renderLayoutSvg } from './render'
import { SYMBOLS } from './symbols'
import { clamp, esc, num } from './util'

/** 사용자가 고른 칸. stitch는 그 단에서 몇 번째로 뜨는 코인지 (1부터), x는 기둥 위치 */
export type ChartPick = { row: number; stitch: number; x: number }

/** fit은 도안 전체가 보이게, width는 가로 폭에 맞게 */
export type ZoomPreset = 'fit' | 'width'

/** 스크린 리더에 읽어 줄 칸 정보 */
export type ChartCellInfo = {
  row: number
  stitch: number
  x: number
  side: Side
  symbol: SymbolId
  /** 기호의 한국어 이름 */
  name: string
  /** 그 단의 코 수 */
  cells: number
}

/** 화면에 보이거나 스크린 리더가 읽는 글 */
export type ChartUiLabels = {
  viewport: string
  toolbar: string
  zoomOut: string
  zoomIn: string
  zoomRatio: string
  fit: string
  fitWidth: string
  toNow: string
  cell: (c: ChartCellInfo) => string
}

export const DEFAULT_UI: ChartUiLabels = {
  viewport: '기호 도안. 화살표 키로 칸을 옮기고 Enter 키로 고릅니다. 더하기와 빼기 키로 확대하고 축소합니다.',
  toolbar: '도안 확대와 축소',
  zoomOut: '축소',
  zoomIn: '확대',
  zoomRatio: '확대 비율',
  fit: '전체 보기',
  fitWidth: '가로 맞춤',
  toNow: '지금 위치로',
  cell: (c) => `${c.row}단 ${c.side === 'WS' ? '안면 단, 왼쪽' : c.side === 'RS' ? '겉면 단, 오른쪽' : '오른쪽'}부터 ${c.stitch}번째 코, ${c.name}`,
}

export type MountChartOptions = ChartOptions & {
  /** 칸을 눌렀거나 Enter, Space로 골랐을 때 */
  onPick?: (pos: ChartPick) => void
  /** 코가 없는 곳을 눌렀거나 Escape를 눌렀을 때 */
  onDismiss?: () => void
  /** 확대 비율이 바뀌었을 때 */
  onZoom?: (zoom: number) => void
  /**
   * 처음 확대 비율. 숫자 1은 한 칸이 cell(12px) 크기입니다.
   * 생략하면 가로에 맞추되 칸이 너무 작아지면 0.6에서 멈춥니다.
   */
  zoom?: number | ZoomPreset
  /** 가장 작은 비율. 기본은 도안 전체가 보이는 비율 (1보다 크지 않게) */
  minZoom?: number
  /** 가장 큰 비율. 기본 6 */
  maxZoom?: number
  /** 확대와 축소 단추 줄. 기본 true */
  controls?: boolean
  /** 도안 영역의 높이 (CSS 길이). 'fill'이면 container 높이를 채웁니다. 기본 min(80vh, 900px) */
  height?: string
  /** 고른 칸에 바로 테두리를 그릴지. 기본 true. 끄면 setSelection 으로만 바뀝니다. */
  selectOnPick?: boolean
  progress?: Progress | null
  rings?: ChartRing[]
  selection?: ChartSelection | null
  ui?: Partial<ChartUiLabels>
}

export type ChartHandle = {
  /** 진행 위치. 그 앞까지 뜬 칸은 선명하게, 나머지는 옅게 보입니다. null이면 표시를 지웁니다. */
  setProgress(p: Progress | null): void
  setRings(rings: ChartRing[]): void
  setSelection(sel: ChartSelection | null): void
  setZoom(z: number | ZoomPreset): void
  getZoom(): number
  /** g단이 가운데 오게 옮깁니다. x를 주면 그 기둥이 가로 가운데로 옵니다. */
  scrollToRow(g: number, opts?: { x?: number; smooth?: boolean }): void
  /** 칸이 화면에서 차지하는 자리. 말풍선을 붙일 때 씁니다. */
  cellRect(row: number, x: number): DOMRect | null
  /** 도안 영역에 키보드 초점을 줍니다. */
  focus(): void
  layout: ChartLayout
  destroy(): void
}

const KEY_MOVES: Record<string, CursorMove> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
}

const CSS = `
.stitch-chart{display:flex;flex-direction:column;gap:8px;min-height:0;--sc-accent:#e8590c;--sc-line:#e3d6c8;--sc-panel:#fffaf4;--sc-ink:#2a201b}
.stitch-chart .sc-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.stitch-chart .sc-bar button{min-height:44px;min-width:44px;border-radius:10px;border:1px solid var(--sc-line);background:var(--sc-panel);color:var(--sc-ink);font:inherit;font-weight:600;cursor:pointer;padding:0 14px}
.stitch-chart .sc-bar button:disabled{opacity:.45;cursor:default}
.stitch-chart .sc-bar input[type=range]{width:min(260px,40vw);height:44px;accent-color:var(--sc-accent)}
.stitch-chart .sc-bar output{min-width:5ch;font-weight:700;font-variant-numeric:tabular-nums}
.stitch-chart .sc-sep{flex:0 0 6px}
.stitch-chart .sc-view{position:relative;min-height:0;overflow:auto;border:1px solid var(--sc-line);border-radius:12px;touch-action:pan-x pan-y;overscroll-behavior:contain;cursor:grab;-webkit-tap-highlight-color:transparent}
.stitch-chart .sc-view.sc-drag{cursor:grabbing}
.stitch-chart .sc-view:focus-visible{outline:3px solid #f6b48f;outline-offset:2px}
.stitch-chart .sc-canvas{position:relative;margin:0 auto;-webkit-user-select:none;user-select:none}
.stitch-chart .sc-base{position:absolute;inset:0}
.stitch-chart .sc-base svg{display:block;width:100%;height:100%}
.stitch-chart .sc-overlay{position:absolute;inset:0;width:100%;height:100%;cursor:pointer;touch-action:pan-x pan-y;-webkit-tap-highlight-color:transparent}
.stitch-chart .sc-view.sc-drag .sc-overlay{cursor:grabbing}
.stitch-chart .sc-live{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
`

type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }

let mounted = 0

export function mountChart(container: HTMLElement, expanded: Expanded, opts: MountChartOptions = {}): ChartHandle {
  const doc = container.ownerDocument
  const win = doc.defaultView ?? window
  const L = chartLayout(expanded, { ...opts, idPrefix: opts.idPrefix ?? `sc${++mounted}-` })
  const C = L.options.colors
  const ui: ChartUiLabels = { ...DEFAULT_UI, ...opts.ui }
  const maxZoom = opts.maxZoom ?? 6
  const selectOnPick = opts.selectOnPick ?? true
  const ac = new AbortController()
  const on = { signal: ac.signal }
  const active = { signal: ac.signal, passive: false }
  const now = () => win.performance.now()

  // --- 뼈대 ---
  const root = doc.createElement('div')
  root.className = 'stitch-chart'
  const bar =
    opts.controls === false
      ? ''
      : `<div class="sc-bar" role="toolbar" aria-label="${esc(ui.toolbar)}">` +
        `<button type="button" data-a="out" aria-label="${esc(ui.zoomOut)}">−</button>` +
        `<input type="range" min="0" max="1000" value="0" aria-label="${esc(ui.zoomRatio)}">` +
        `<button type="button" data-a="in" aria-label="${esc(ui.zoomIn)}">+</button><output>100%</output><span class="sc-sep"></span>` +
        `<button type="button" data-a="fit">${esc(ui.fit)}</button><button type="button" data-a="width">${esc(ui.fitWidth)}</button>` +
        `<button type="button" data-a="now">${esc(ui.toNow)}</button></div>`
  root.innerHTML =
    `<style>${CSS}</style>${bar}` +
    `<div class="sc-view" tabindex="0" role="application" aria-label="${esc(ui.viewport)}">` +
    `<div class="sc-canvas"><div class="sc-base"></div>` +
    `<svg class="sc-overlay" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(L.width)} ${num(L.height)}" preserveAspectRatio="none" aria-hidden="true" font-family="${esc(L.options.fontFamily)}">` +
    `<g class="sc-ov-progress"></g><g class="sc-ov-rings"></g><g class="sc-ov-marks"></g></svg></div></div>` +
    `<div class="sc-live" aria-live="polite"></div>`

  const need = <T extends Element>(sel: string): T => {
    const el = root.querySelector<T>(sel)
    if (!el) throw new Error(`stitch-chart: ${sel} 요소를 만들지 못했습니다`)
    return el
  }
  const view = need<HTMLDivElement>('.sc-view')
  const canvas = need<HTMLDivElement>('.sc-canvas')
  const base = need<HTMLDivElement>('.sc-base')
  const gProgress = need<SVGGElement>('.sc-ov-progress')
  const gRings = need<SVGGElement>('.sc-ov-rings')
  const gMarks = need<SVGGElement>('.sc-ov-marks')
  const live = need<HTMLDivElement>('.sc-live')
  const range = root.querySelector<HTMLInputElement>('.sc-bar input')
  const output = root.querySelector<HTMLOutputElement>('.sc-bar output')
  const button = (a: string) => root.querySelector<HTMLButtonElement>(`.sc-bar button[data-a="${a}"]`)

  base.innerHTML = renderLayoutSvg(L)
  view.style.background = C.paper
  canvas.style.aspectRatio = `${num(L.width)} / ${num(L.height)}`
  canvas.style.width = `${num(L.width)}px`
  if (opts.height === 'fill') {
    root.style.height = '100%'
    view.style.flex = '1 1 0'
  } else {
    view.style.height = opts.height ?? 'min(80vh, 900px)'
  }
  container.appendChild(root)

  // --- 상태 ---
  let progress: Progress | null = opts.progress ?? null
  let rings: ChartRing[] = opts.rings ?? []
  let selection: ChartHit | null = selectionCell(L, opts.selection ?? null)
  let hover: ChartHit | null = null
  let cursor: ChartHit | null = null
  /** 키보드로 움직이는 중이라 칸 표시를 보여 줄지 */
  let keyboard = false
  let zoom = 1
  let preset: ZoomPreset | null = null
  let ready = false
  let notified = NaN
  let lastGesture = -Infinity

  // --- 위에 얹는 층 ---
  const sameCell = (a: ChartHit | null, b: ChartHit | null) => (a && b ? a.g === b.g && a.x === b.x : a === b)
  const drawProgress = () => {
    gProgress.innerHTML = progressOverlaySvg(L, progress)
    const b = button('now')
    if (b) b.disabled = !progress || !workingPosition(L, progress)
  }
  const drawRings = () => {
    gRings.innerHTML = ringsOverlaySvg(L, rings)
  }
  const drawMarks = () => {
    let o = ''
    if (hover) o += cellOutlineSvg(L, hover.g, hover.x, C.accent, 1.6, 'sc-hover')
    if (keyboard && cursor) o += cellOutlineSvg(L, cursor.g, cursor.x, C.accent, 2.4, 'sc-cursor')
    if (selection) o += cellOutlineSvg(L, selection.g, selection.x, C.selection, 2.6, 'sc-selection')
    gMarks.innerHTML = o
  }

  // --- 확대와 축소 ---
  // 스크롤바가 생겨도 값이 흔들리지 않게, 스크롤바를 뺀 안쪽 크기 대신 테두리만 뺀 크기를 씁니다.
  const inner = () => ({ w: Math.max(0, view.offsetWidth - 2 * view.clientLeft), h: Math.max(0, view.offsetHeight - 2 * view.clientTop) })
  const sized = () => {
    const s = inner()
    return s.w > 0 && s.h > 0
  }
  const fitWidth = () => inner().w / L.width
  // 딱 맞추면 소수점 차이로 스크롤바가 생길 수 있어 1px 여유를 둡니다.
  const fitAll = () => {
    const s = inner()
    return Math.max(0, Math.min((s.w - 1) / L.width, (s.h - 1) / L.height))
  }
  const minZoom = () => {
    if (opts.minZoom) return opts.minZoom
    const f = fitAll()
    return f > 0 ? Math.min(1, f) : 0.1
  }
  const topZoom = () => Math.max(minZoom(), maxZoom)

  const zoomChanged = () => {
    const lo = minZoom()
    const hi = topZoom()
    if (output) output.textContent = `${Math.round(zoom * 100)}%`
    if (range) range.value = String(hi > lo ? Math.round((Math.log(zoom / lo) / Math.log(hi / lo)) * 1000) : 0)
    const zin = button('in')
    const zout = button('out')
    if (zin) zin.disabled = zoom >= hi - 1e-3
    if (zout) zout.disabled = zoom <= lo + 1e-3
    if (zoom !== notified) {
      notified = zoom
      opts.onZoom?.(zoom)
    }
  }

  const measured = () => {
    const w = canvas.getBoundingClientRect().width
    return w > 0 ? w / L.width : zoom
  }

  /** (px, py) 아래의 도안 자리가 그대로 있도록 비율을 바꿉니다. anchor는 도안에서의 고정 비율 자리입니다. */
  const zoomAt = (v: number, px?: number, py?: number, anchor?: { fx: number; fy: number }) => {
    const target = clamp(v, minZoom(), topZoom())
    const vr = view.getBoundingClientRect()
    const cx = px ?? vr.left + view.clientLeft + view.clientWidth / 2
    const cy = py ?? vr.top + view.clientTop + view.clientHeight / 2
    const r0 = canvas.getBoundingClientRect()
    const fx = anchor ? anchor.fx : r0.width ? (cx - r0.left) / r0.width : 0.5
    const fy = anchor ? anchor.fy : r0.height ? (cy - r0.top) / r0.height : 0.5
    preset = null
    zoom = target
    canvas.style.width = `${num(target * L.width)}px`
    const r1 = canvas.getBoundingClientRect()
    view.scrollLeft += r1.left + fx * r1.width - cx
    view.scrollTop += r1.top + fy * r1.height - cy
    zoomChanged()
  }

  const applyPreset = (mode: ZoomPreset) => {
    if (mode === 'width') {
      if (fitWidth() > topZoom()) return zoomAt(topZoom())
      // 폭을 %로 두면 스크롤바가 생기거나 없어질 때 브라우저가 알아서 맞춥니다.
      canvas.style.width = '100%'
      preset = 'width'
      zoom = measured()
    } else {
      const f = fitAll()
      preset = 'fit'
      zoom = clamp(f > 0 ? f : zoom, 0.01, topZoom())
      canvas.style.width = `${num(zoom * L.width)}px`
    }
    zoomChanged()
  }

  const applyInitial = () => {
    ready = true
    const z = opts.zoom
    if (z === 'fit' || z === 'width') applyPreset(z)
    else if (typeof z === 'number') zoomAt(z)
    else if (fitWidth() >= 0.6) applyPreset('width')
    else zoomAt(0.6)
  }

  const ro = new win.ResizeObserver(() => {
    if (!sized()) return
    if (!ready) applyInitial()
    else if (preset === 'width') {
      zoom = measured()
      zoomChanged()
    } else if (preset === 'fit') applyPreset('fit')
    else if (zoom < minZoom() - 1e-6) zoomAt(minZoom())
    else zoomChanged()
  })
  ro.observe(view)

  // --- 자리 옮기기 ---
  const calm = () => {
    try {
      return win.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      return false
    }
  }
  const scale = () => {
    const r = canvas.getBoundingClientRect()
    return { r, k: r.width / L.width }
  }
  const cellRect = (row: number, x: number): DOMRect | null => {
    const at = L.rectOf(row, x)
    if (!at) return null
    const { r, k } = scale()
    return new win.DOMRect(r.left + at.x * k, r.top + at.y * k, at.w * k, at.h * k)
  }
  const scrollToRow = (g: number, to: { x?: number; smooth?: boolean } = {}) => {
    const band = L.rowRect(g)
    if (!band) return
    const at = to.x === undefined ? null : L.rectOf(g, to.x)
    const cx = at ? at.x + at.w / 2 : band.x + band.w / 2
    const { k } = scale()
    view.scrollTo({
      left: canvas.offsetLeft + cx * k - view.clientWidth / 2,
      top: canvas.offsetTop + (band.y + band.h / 2) * k - view.clientHeight / 2,
      behavior: to.smooth && !calm() ? 'smooth' : 'auto',
    })
  }
  const reveal = (hit: ChartHit) => {
    const r = cellRect(hit.g, hit.x)
    if (!r) return
    const vr = view.getBoundingClientRect()
    const left = vr.left + view.clientLeft
    const top = vr.top + view.clientTop
    const padX = Math.min(40, view.clientWidth / 4)
    const padY = Math.min(40, view.clientHeight / 4)
    if (r.left < left + padX) view.scrollLeft -= left + padX - r.left
    else if (r.right > left + view.clientWidth - padX) view.scrollLeft += r.right - (left + view.clientWidth - padX)
    if (r.top < top + padY) view.scrollTop -= top + padY - r.top
    else if (r.bottom > top + view.clientHeight - padY) view.scrollTop += r.bottom - (top + view.clientHeight - padY)
  }
  const toNow = (smooth: boolean) => {
    const at = progress ? workingPosition(L, progress) : null
    if (!at) return
    const c = at.k >= 0 ? L.cellByOrder(at.row, at.k) : null
    scrollToRow(at.row, { x: c?.x, smooth })
  }

  // --- 고르기 ---
  const toChart = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect()
    if (!r.width || !r.height) return null
    return { x: ((clientX - r.left) / r.width) * L.width, y: ((clientY - r.top) / r.height) * L.height }
  }
  const hitAt = (clientX: number, clientY: number): ChartHit | null => {
    const pt = toChart(clientX, clientY)
    return pt ? L.cellAt(pt.x, pt.y) : null
  }
  const pick = (hit: ChartHit) => {
    if (selectOnPick) selection = hit
    drawMarks()
    opts.onPick?.({ row: hit.g, stitch: hit.k + 1, x: hit.x })
  }
  const dismiss = () => {
    if (selectOnPick && selection) {
      selection = null
      drawMarks()
    }
    opts.onDismiss?.()
  }
  const announce = (hit: ChartHit) => {
    const r = L.row(hit.g)
    const c = L.cellOf(hit.g, hit.x)
    if (!r || !c) return
    live.textContent = ui.cell({ row: hit.g, stitch: hit.k + 1, x: hit.x, side: r.side, symbol: c.s, name: SYMBOLS[c.s].name + (c.a ? ' (늘림으로 생긴 코)' : ''), cells: r.cells.length })
  }
  /** 키보드로 처음 들어왔을 때 서 있을 칸: 고른 칸, 지금 뜰 자리, 첫 단의 첫 코 순서 */
  const startCell = (): ChartHit | null => {
    if (selection) return selection
    const at = progress ? workingPosition(L, progress) : null
    const c = at && at.k >= 0 ? L.cellByOrder(at.row, at.k) : null
    if (at && c) return { g: at.row, x: c.x, k: c.k }
    for (const b of expanded.blocks) for (const r of b.rows) if (r.cells.length) return { g: r.g, x: r.cells[0].x, k: r.cells[0].k }
    return null
  }

  canvas.addEventListener(
    'click',
    (ev) => {
      if (now() - lastGesture < 350) return
      const hit = hitAt(ev.clientX, ev.clientY)
      if (!hit) return dismiss()
      cursor = hit
      pick(hit)
    },
    on,
  )

  // 마우스로 가리킨 칸
  let raf = 0
  let hoverAt: { x: number; y: number } | null = null
  canvas.addEventListener(
    'pointermove',
    (ev) => {
      if (ev.pointerType !== 'mouse') return
      hoverAt = { x: ev.clientX, y: ev.clientY }
      if (raf) return
      raf = win.requestAnimationFrame(() => {
        raf = 0
        const hit = hoverAt && !drag?.moved ? hitAt(hoverAt.x, hoverAt.y) : null
        if (sameCell(hit, hover)) return
        hover = hit
        drawMarks()
      })
    },
    on,
  )
  canvas.addEventListener(
    'pointerleave',
    () => {
      hoverAt = null
      if (!hover) return
      hover = null
      drawMarks()
    },
    on,
  )

  // 마우스로 끌어서 옮기기
  let drag: { x: number; y: number; sl: number; st: number; moved: boolean } | null = null
  const dragMove = (e: PointerEvent) => {
    if (!drag) return
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) > 5) {
      drag.moved = true
      view.classList.add('sc-drag')
    }
    if (drag.moved) {
      view.scrollLeft = drag.sl - dx
      view.scrollTop = drag.st - dy
    }
  }
  const dragEnd = () => {
    if (drag?.moved) lastGesture = now()
    drag = null
    view.classList.remove('sc-drag')
    win.removeEventListener('pointermove', dragMove)
    win.removeEventListener('pointerup', dragEnd)
    win.removeEventListener('pointercancel', dragEnd)
  }
  view.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      // 스크롤바를 잡은 것이면 그대로 둡니다.
      const vr = view.getBoundingClientRect()
      if (e.clientX - vr.left - view.clientLeft > view.clientWidth || e.clientY - vr.top - view.clientTop > view.clientHeight) return
      drag = { x: e.clientX, y: e.clientY, sl: view.scrollLeft, st: view.scrollTop, moved: false }
      win.addEventListener('pointermove', dragMove, on)
      win.addEventListener('pointerup', dragEnd, on)
      win.addEventListener('pointercancel', dragEnd, on)
    },
    on,
  )

  // 두 손가락으로 벌리고 오므리기. 페이지가 확대되지 않게 touch 이벤트로 받습니다.
  let pinch: { d: number; z: number; anchor: { fx: number; fy: number } } | null = null
  const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
  const middle = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
  view.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      const m = middle(e.touches)
      const r = canvas.getBoundingClientRect()
      pinch = { d: spread(e.touches) || 1, z: zoom, anchor: { fx: r.width ? (m.x - r.left) / r.width : 0.5, fy: r.height ? (m.y - r.top) / r.height : 0.5 } }
      hover = null
      drawMarks()
    },
    active,
  )
  view.addEventListener(
    'touchmove',
    (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const m = middle(e.touches)
      zoomAt((pinch.z * spread(e.touches)) / pinch.d, m.x, m.y, pinch.anchor)
    },
    active,
  )
  const pinchEnd = (e: TouchEvent) => {
    if (pinch && e.touches.length < 2) {
      pinch = null
      lastGesture = now()
    }
  }
  view.addEventListener('touchend', pinchEnd, on)
  view.addEventListener('touchcancel', pinchEnd, on)

  // Ctrl이나 Cmd를 누른 휠, 그리고 트랙패드 핀치 (Ctrl+휠로 들어옵니다)
  view.addEventListener(
    'wheel',
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomAt(zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0022)), e.clientX, e.clientY)
    },
    active,
  )

  // 사파리의 트랙패드 핀치는 gesture 이벤트로 옵니다.
  let gestureFrom = 0
  view.addEventListener(
    'gesturestart',
    (e) => {
      if (pinch) return
      e.preventDefault()
      gestureFrom = zoom
    },
    active,
  )
  view.addEventListener(
    'gesturechange',
    (e) => {
      if (pinch || !gestureFrom) return
      e.preventDefault()
      const g = e as GestureEvent
      zoomAt(gestureFrom * g.scale, g.clientX, g.clientY)
    },
    active,
  )
  view.addEventListener(
    'gestureend',
    () => {
      if (gestureFrom) lastGesture = now()
      gestureFrom = 0
    },
    on,
  )

  // 키보드
  const focusVisible = () => {
    try {
      return view.matches(':focus-visible')
    } catch {
      return true
    }
  }
  view.addEventListener(
    'focus',
    () => {
      if (!cursor) cursor = startCell()
      keyboard = focusVisible()
      drawMarks()
    },
    on,
  )
  view.addEventListener(
    'blur',
    () => {
      keyboard = false
      drawMarks()
    },
    on,
  )
  view.addEventListener(
    'keydown',
    (e) => {
      if (e.target !== view || e.ctrlKey || e.metaKey || e.altKey) return
      const move = KEY_MOVES[e.key]
      if (move) {
        e.preventDefault()
        const from = cursor ?? startCell()
        if (!from) return
        // 서 있는 칸이 화면에 안 보이던 참이면 먼저 그 자리를 보여 주고, 다음 키부터 움직입니다.
        const shown = cursor !== null && (keyboard || sameCell(cursor, selection))
        cursor = shown ? (moveCursor(L, from, move) ?? from) : from
        keyboard = true
        drawMarks()
        reveal(cursor)
        announce(cursor)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (!cursor) cursor = startCell()
        if (!cursor) return
        keyboard = true
        pick(cursor)
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault()
        zoomAt(zoom * 1.25)
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault()
        zoomAt(zoom / 1.25)
      } else if (e.key === '0') {
        e.preventDefault()
        applyPreset('fit')
        view.scrollTo({ left: 0, top: 0 })
      } else if (e.key === 'Escape') {
        dismiss()
      }
    },
    on,
  )

  // 단추 줄
  root.querySelector('.sc-bar')?.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element | null)?.closest<HTMLButtonElement>('button[data-a]')
      if (!b || b.disabled) return
      const a = b.dataset.a
      if (a === 'in') zoomAt(zoom * 1.5)
      else if (a === 'out') zoomAt(zoom / 1.5)
      else if (a === 'fit') {
        applyPreset('fit')
        view.scrollTo({ left: 0, top: 0 })
      } else if (a === 'width') {
        // 보고 있던 세로 자리를 지킵니다.
        const r = canvas.getBoundingClientRect()
        const vr = view.getBoundingClientRect()
        const fy = r.height ? (vr.top + view.clientTop + view.clientHeight / 2 - r.top) / r.height : 0
        applyPreset('width')
        view.scrollTop = canvas.offsetTop + fy * canvas.getBoundingClientRect().height - view.clientHeight / 2
        view.scrollLeft = 0
      } else if (a === 'now') toNow(true)
    },
    on,
  )
  range?.addEventListener(
    'input',
    () => {
      const lo = minZoom()
      zoomAt(lo * Math.pow(topZoom() / lo, Number(range.value) / 1000))
    },
    on,
  )

  // --- 처음 그리기 ---
  drawProgress()
  drawRings()
  drawMarks()
  if (sized()) applyInitial()

  return {
    setProgress(p) {
      progress = p
      drawProgress()
    },
    setRings(next) {
      rings = next
      drawRings()
    },
    setSelection(sel) {
      selection = selectionCell(L, sel)
      drawMarks()
    },
    setZoom(z) {
      ready = true
      if (z === 'fit' || z === 'width') applyPreset(z)
      else zoomAt(z)
    },
    getZoom: () => zoom,
    scrollToRow,
    cellRect,
    focus: () => view.focus(),
    layout: L,
    destroy() {
      ac.abort()
      ro.disconnect()
      if (raf) win.cancelAnimationFrame(raf)
      root.remove()
    },
  }
}
