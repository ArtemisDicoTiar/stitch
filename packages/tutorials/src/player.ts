/**
 * 캔버스에 뜨는 법을 띄우고 단계를 넘기는 재생기.
 * 프레임워크에 기대지 않습니다. 브라우저 API는 mountTutorial 안에서만 씁니다.
 */
import { STAGE, drawScene } from './draw'
import { isSymbolId, tutorialStates, wrapStep } from './frame'
import { tween } from './scene'
import type { SceneState, TutorialColors, TutorialId, TutorialSize, TutorialStyle } from './types'

/** 한 단계로 넘어가는 움직임의 길이 (ms) */
export const TRANSITION_MS = 1000
/** 자동 재생에서 한 단계에 머무는 시간 (ms). 마지막 단계는 1.4배. */
export const HOLD_MS = 2600

export type MountOptions = {
  /**
   * 보여 주는 단계가 바뀔 때 (자동 재생, setStep, next, prev, setSymbol).
   * 처음 띄울 때는 부르지 않습니다. 처음 값은 handle.getStep()으로 읽으세요 (언제나 0).
   */
  onStep?: (step: number) => void
  /** 재생/멈춤이 바뀔 때. 처음 띄울 때는 부르지 않습니다. 처음 값은 handle.isPlaying(). */
  onPlayState?: (playing: boolean) => void
  /**
   * true면 움직임 없이 단계의 끝 모습만 바꿔 보여 주고, 자동 재생을 켜지 않은 채 시작합니다.
   * 주지 않으면 사용자의 "동작 줄이기" 설정(prefers-reduced-motion)을 따릅니다.
   */
  reducedMotion?: boolean
  /** 띄우자마자 자동 재생할지 (기본 true, reducedMotion이면 false) */
  autoplay?: boolean
  /** 재생 속도 (기본 1). "천천히"는 0.55. */
  speed?: number
  /** 색. 주지 않은 색은 기본값을 씁니다. */
  colors?: Partial<TutorialColors>
  /** 그림 속 글자의 글꼴 */
  fontFamily?: string
  /** devicePixelRatio의 상한 (기본 2) */
  maxPixelRatio?: number
}

export type TutorialHandle = {
  /** 다른 기호로 바꾸고 첫 단계를 움직임 없이 보여 줍니다. */
  setSymbol(id: TutorialId): void
  getSymbol(): TutorialId
  /** 그 단계로 갑니다. 범위를 벗어나면 돌아서 이어집니다. animate가 false면 바로 바꿉니다. */
  setStep(step: number, animate?: boolean): void
  getStep(): number
  stepCount(): number
  /** 다음 단계. 마지막에서는 처음으로. */
  next(): void
  /** 이전 단계. 처음에서는 마지막으로. */
  prev(): void
  /** 자동으로 단계를 넘깁니다. */
  play(): void
  pause(): void
  isPlaying(): boolean
  /** 재생 속도를 바꿉니다 (1이 보통). */
  setSpeed(speed: number): void
  /** 캔버스의 CSS 크기와 화면 배율을 다시 읽어 맞추고 바로 다시 그립니다. 크기가 바뀌면 저절로 불립니다. */
  resize(): void
  /** 타이머와 관찰자를 모두 정리합니다. 여러 번 불러도 됩니다. */
  destroy(): void
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 캔버스에 기호 id의 뜨는 법을 띄웁니다.
 *
 * 캔버스의 크기는 CSS로 정하세요 (예: `width:100%; height:auto; aspect-ratio:720/430`).
 * 그림은 그 상자 안에 비율을 지켜 가운데에 맞춰 들어가고,
 * 픽셀 수는 상자 크기 × devicePixelRatio로 맞춥니다.
 */
export function mountTutorial(canvas: HTMLCanvasElement, id: TutorialId, opts: MountOptions = {}): TutorialHandle {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('캔버스에서 2D 컨텍스트를 얻지 못했습니다.')
  const g: CanvasRenderingContext2D = ctx
  tutorialStates(id) // 모르는 기호면 여기서 알립니다.

  const style: TutorialStyle = { colors: opts.colors, fontFamily: opts.fontFamily }
  const maxDpr = opts.maxPixelRatio ?? 2
  const reduce = opts.reducedMotion ?? prefersReducedMotion()

  let sym = id
  let i = 0
  /** 움직임이 시작된 장면. null이면 움직이는 중이 아닙니다. */
  let from: SceneState | null = null
  let t0 = 0
  let playing = !reduce && opts.autoplay !== false
  let speed = opts.speed && opts.speed > 0 ? opts.speed : 1
  let visible = true
  let destroyed = false
  let pending: { cancel(): void } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  /** 지금 화면에 그려져 있는 장면 */
  let lastDrawn: SceneState | null = null
  let size: TutorialSize = { ...STAGE }
  let dpr = 1

  const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const states = (): readonly SceneState[] => tutorialStates(sym)

  function paint(state: SceneState): void {
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawScene(g, state, size, style)
    lastDrawn = state
  }

  /** 다음 단계로 넘어갈 시간을 잡습니다. 멈춤이거나 화면 밖이면 잡지 않습니다. */
  function schedule(): void {
    clearTimeout(timer)
    timer = undefined
    if (!playing || !visible || destroyed) return
    const last = i === states().length - 1
    timer = setTimeout(() => go(i + 1, true), (last ? HOLD_MS * 1.4 : HOLD_MS) / speed)
  }

  function frame(time: number): void {
    pending = null
    if (destroyed) return
    const target = states()[i]
    if (from) {
      const t = Math.min(1, Math.max(0, (time - t0) / (TRANSITION_MS / speed)))
      if (t < 1) {
        paint(tween(from, target, t))
        kick()
        return
      }
      from = null
    }
    // 움직임이 끝나면 그 단계의 끝 장면 그대로 둡니다. 사라진 것의 흔적이 다음 움직임에 섞이지 않습니다.
    paint(target)
    schedule()
  }

  function kick(): void {
    if (pending) return
    if (typeof requestAnimationFrame === 'function') {
      const h = requestAnimationFrame(frame)
      pending = { cancel: () => cancelAnimationFrame(h) }
    } else {
      const h = setTimeout(() => frame(now()), 16)
      pending = { cancel: () => clearTimeout(h) }
    }
  }

  function stopFrame(): void {
    pending?.cancel()
    pending = null
  }

  function go(step: number, animate: boolean): void {
    if (destroyed) return
    const all = states()
    // 움직이던 중이면 지금 화면에 있는 모습에서 이어 갑니다.
    const shown = lastDrawn ?? all[i]
    i = wrapStep(step, all.length)
    clearTimeout(timer)
    timer = undefined
    opts.onStep?.(i)
    if (animate && !reduce) {
      from = shown
      t0 = now()
      kick()
    } else {
      from = null
      stopFrame()
      paint(all[i])
      schedule()
    }
  }

  function resize(): void {
    if (destroyed) return
    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const width = cw > 0 ? cw : STAGE.width
    // 높이가 기준 비율(720:430)과 반올림만큼만 다르면 기준 비율로 봅니다.
    // CSS에서 높이를 auto로 둔 캔버스가 크기를 바꿀 때마다 비율이 조금씩 밀리는 것을 막습니다.
    const ideal = (width * STAGE.height) / STAGE.width
    const height = ch > 0 && Math.abs(ch - ideal) > 1.5 ? ch : ideal
    const ratio = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1
    dpr = Math.min(maxDpr, ratio)
    const bw = Math.max(1, Math.round(width * dpr))
    const bh = Math.max(1, Math.round(height * dpr))
    // 그리는 크기는 픽셀 수에 꼭 맞춥니다. 바탕이 마지막 픽셀 줄까지 빈틈없이 칠해집니다.
    size = { width: bw / dpr, height: bh / dpr }
    // 크기를 넣으면 그림이 지워지므로 바뀔 때만 넣고, 곧바로 다시 그립니다.
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    // CSS로 크기를 정하지 않은 캔버스는 픽셀 수를 따라 커집니다. 그러면 잰 크기로 묶어 둡니다.
    if (cw > 0 && Math.abs(canvas.clientWidth - cw) > 1) {
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }
    paint(lastDrawn ?? states()[i])
  }

  // CSS에서 높이를 정하지 않은 캔버스도 기준 비율(720:430)이 되도록 먼저 맞춰 둡니다.
  canvas.width = STAGE.width
  canvas.height = STAGE.height
  resize()
  schedule()

  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => resize())
    ro.observe(canvas)
  }

  // 화면 밖에 있을 때는 자동으로 넘기지 않습니다.
  let io: IntersectionObserver | null = null
  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1]
      if (!e) return
      visible = e.isIntersecting
      if (!from) schedule()
    })
    io.observe(canvas)
  }

  // 화면 배율이 바뀔 때 (다른 모니터로 옮기거나 확대할 때)
  let mq: MediaQueryList | null = null
  const onDpr = (): void => {
    resize()
    watchDpr()
  }
  function watchDpr(): void {
    mq?.removeEventListener?.('change', onDpr)
    mq = null
    if (destroyed || typeof matchMedia !== 'function' || typeof devicePixelRatio !== 'number') return
    mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`)
    mq.addEventListener?.('change', onDpr)
  }
  watchDpr()

  // 글꼴이 늦게 오면 멈춰 있는 그림의 글자가 대체 글꼴로 남으므로 한 번 다시 그립니다.
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      if (!destroyed && !from) paint(lastDrawn ?? states()[i])
    })
  }

  return {
    setSymbol(next) {
      if (destroyed || !isSymbolId(next)) return
      sym = next
      i = 0
      lastDrawn = null
      go(0, false)
    },
    getSymbol: () => sym,
    setStep(step, animate = true) {
      go(step, animate)
    },
    getStep: () => i,
    stepCount: () => states().length,
    next() {
      go(i + 1, true)
    },
    prev() {
      go(i - 1, true)
    },
    play() {
      if (destroyed || playing) return
      playing = true
      opts.onPlayState?.(true)
      if (!from) schedule()
    },
    pause() {
      if (destroyed || !playing) return
      playing = false
      opts.onPlayState?.(false)
      schedule()
    },
    isPlaying: () => playing,
    setSpeed(v) {
      if (destroyed || !(v > 0)) return
      speed = v
      if (!from) schedule()
    },
    resize,
    destroy() {
      if (destroyed) return
      destroyed = true
      stopFrame()
      clearTimeout(timer)
      timer = undefined
      ro?.disconnect()
      io?.disconnect()
      mq?.removeEventListener?.('change', onDpr)
      mq = null
    },
  }
}
