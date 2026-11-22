import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HOLD_MS, TRANSITION_MS, TUTORIALS, drawTutorialFrame, mountTutorial } from '../src'
import { countOf, lines, recordingContext, type Recorder } from './fake-context'

/** 브라우저 없이 쓰는 캔버스 흉내. CSS 상자 크기는 clientWidth/clientHeight로 정합니다. */
function fakeCanvas(rec: Recorder, cssWidth = 720, cssHeight = 430) {
  return {
    width: 300,
    height: 150,
    clientWidth: cssWidth,
    clientHeight: cssHeight,
    style: {} as Record<string, string>,
    getContext: (kind: string) => (kind === '2d' ? rec.ctx : null),
  }
}
const asCanvas = (c: ReturnType<typeof fakeCanvas>): HTMLCanvasElement => c as unknown as HTMLCanvasElement

/** 화면 그리기 한 번(rAF)을 손으로 넘깁니다. */
function fakeFrames() {
  let clock = 1000
  let queue: { id: number; cb: (t: number) => void }[] = []
  let seq = 0
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    queue.push({ id: ++seq, cb })
    return seq
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    queue = queue.filter((q) => q.id !== id)
  })
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  return {
    pending: () => queue.length,
    /** ms만큼 지난 뒤 기다리던 프레임을 한 번 돌립니다. */
    tick(ms: number): void {
      clock += ms
      const run = queue
      queue = []
      for (const q of run) q.cb(clock)
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('재생기: 동작 줄이기', () => {
  it('띄우면 첫 단계의 끝 모습을 바로 그리고, 자동 재생은 꺼져 있다', () => {
    const rec = recordingContext()
    const onStep = vi.fn()
    const onPlayState = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'K2TOG', { reducedMotion: true, onStep, onPlayState })
    expect(h.getSymbol()).toBe('K2TOG')
    expect(h.getStep()).toBe(0)
    expect(h.stepCount()).toBe(TUTORIALS.K2TOG.steps.length)
    expect(h.isPlaying()).toBe(false)
    expect(onStep).not.toHaveBeenCalled()
    expect(onPlayState).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    const want = recordingContext()
    drawTutorialFrame(want.ctx, 'K2TOG', 0, 1, { width: 720, height: 430 })
    expect(lines(rec.calls)).toEqual(['setTransform(1,0,0,1,0,0)', ...lines(want.calls)])
    h.destroy()
  })

  it('단계를 바꾸면 움직임 없이 끝 모습으로 바뀌고 onStep을 부른다', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const onStep = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'K', { reducedMotion: true, onStep })
    rec.reset()
    h.setStep(3)
    expect(frames.pending()).toBe(0)
    expect(h.getStep()).toBe(3)
    expect(onStep.mock.calls).toEqual([[3]])
    const want = recordingContext()
    drawTutorialFrame(want.ctx, 'K', 3, 1, { width: 720, height: 430 })
    expect(lines(rec.calls).slice(1)).toEqual(lines(want.calls))

    h.next()
    h.next() // 마지막(5단계)에서 처음으로
    h.prev() // 처음에서 마지막으로
    expect(onStep.mock.calls).toEqual([[3], [4], [0], [4]])
    h.destroy()
  })

  it('재생을 누르면 움직임 없이 단계만 넘어간다', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const onStep = vi.fn()
    const onPlayState = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'YO', { reducedMotion: true, onStep, onPlayState })
    h.play()
    h.play()
    expect(onPlayState.mock.calls).toEqual([[true]])
    vi.advanceTimersByTime(HOLD_MS)
    expect(onStep.mock.calls).toEqual([[1]])
    expect(frames.pending()).toBe(0)
    vi.advanceTimersByTime(HOLD_MS * 2)
    expect(h.getStep()).toBe(3)
    h.pause()
    expect(onPlayState.mock.calls).toEqual([[true], [false]])
    vi.advanceTimersByTime(HOLD_MS * 10)
    expect(h.getStep()).toBe(3)
    h.destroy()
  })

  it('기호를 바꾸면 그 기호의 첫 단계를 보여 준다', () => {
    const rec = recordingContext()
    const onStep = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'SK2P', { reducedMotion: true, onStep })
    h.setStep(5)
    rec.reset()
    h.setSymbol('CO')
    expect(h.getSymbol()).toBe('CO')
    expect(h.getStep()).toBe(0)
    expect(h.stepCount()).toBe(TUTORIALS.CO.steps.length)
    expect(onStep.mock.calls).toEqual([[5], [0]])
    const want = recordingContext()
    drawTutorialFrame(want.ctx, 'CO', 0, 1, { width: 720, height: 430 })
    expect(lines(rec.calls).slice(1)).toEqual(lines(want.calls))
    // 모르는 기호는 무시합니다.
    h.setSymbol('SC' as never)
    expect(h.getSymbol()).toBe('CO')
    h.destroy()
  })

  it('모르는 기호로 띄우면 오류', () => {
    expect(() => mountTutorial(asCanvas(fakeCanvas(recordingContext())), 'SC' as never, { reducedMotion: true })).toThrow(RangeError)
  })
})

describe('재생기: 움직임', () => {
  it('자동 재생: 머문 뒤 다음 단계로 움직이고, 마지막에서 처음으로 돌아간다', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const onStep = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'YO', { reducedMotion: false, onStep })
    expect(h.isPlaying()).toBe(true)
    expect(onStep).not.toHaveBeenCalled()

    vi.advanceTimersByTime(HOLD_MS - 1)
    expect(h.getStep()).toBe(0)
    vi.advanceTimersByTime(1)
    expect(onStep.mock.calls).toEqual([[1]])
    expect(frames.pending()).toBe(1)

    // 움직임의 가운데: (YO, 2단계, t=0.5)와 같은 그림
    rec.reset()
    frames.tick(TRANSITION_MS / 2)
    const mid = recordingContext()
    drawTutorialFrame(mid.ctx, 'YO', 1, 0.5, { width: 720, height: 430 })
    expect(lines(rec.calls).slice(1)).toEqual(lines(mid.calls))
    expect(frames.pending()).toBe(1)
    // 움직이는 동안에는 다음 단계로 넘어갈 시간을 재지 않습니다.
    expect(vi.getTimerCount()).toBe(0)

    // 움직임의 끝: 2단계의 끝 모습
    rec.reset()
    frames.tick(TRANSITION_MS / 2)
    const end = recordingContext()
    drawTutorialFrame(end.ctx, 'YO', 1, 1, { width: 720, height: 430 })
    expect(lines(rec.calls).slice(1)).toEqual(lines(end.calls))
    expect(frames.pending()).toBe(0)
    expect(vi.getTimerCount()).toBe(1)

    // 3단계, 4단계(마지막)로
    for (const step of [2, 3]) {
      vi.advanceTimersByTime(HOLD_MS)
      expect(h.getStep()).toBe(step)
      frames.tick(TRANSITION_MS)
    }
    // 마지막 단계에서는 1.4배 머뭅니다.
    vi.advanceTimersByTime(HOLD_MS)
    expect(h.getStep()).toBe(3)
    vi.advanceTimersByTime(HOLD_MS * 0.4)
    expect(h.getStep()).toBe(0)
    h.destroy()
  })

  it('움직이는 중에 단계를 바꾸면 지금 보이는 모습에서 이어 간다', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'K', { reducedMotion: false, autoplay: false })
    expect(h.isPlaying()).toBe(false)
    h.setStep(1)
    frames.tick(400)
    rec.reset()
    h.setStep(2)
    frames.tick(0) // 새 움직임의 t=0: 방금 화면에 있던 모습 그대로
    const atSwitch = recordingContext()
    drawTutorialFrame(atSwitch.ctx, 'K', 1, 0.4, { width: 720, height: 430 })
    // 새로 생기는 실(막 그리기 시작한 토막)을 빼면 바늘과 고리는 그대로입니다.
    const needles = (r: Recorder): string[] => lines(r.calls.filter((c) => c.op === 'createLinearGradient'))
    expect(needles(rec)).toEqual(needles(atSwitch))
    frames.tick(TRANSITION_MS)
    expect(frames.pending()).toBe(0)
    expect(h.getStep()).toBe(2)
    h.destroy()
  })

  it('멈춤과 재생, 속도', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const onStep = vi.fn()
    const onPlayState = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'K', { onStep, onPlayState, reducedMotion: false })
    h.pause()
    expect(h.isPlaying()).toBe(false)
    vi.advanceTimersByTime(HOLD_MS * 3)
    expect(onStep).not.toHaveBeenCalled()
    h.play()
    h.setSpeed(0.5) // 절반 속도: 두 배 오래 머물고 두 배 천천히 움직입니다.
    vi.advanceTimersByTime(HOLD_MS * 2 - 1)
    expect(onStep).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onStep.mock.calls).toEqual([[1]])
    frames.tick(TRANSITION_MS)
    expect(frames.pending()).toBe(1)
    frames.tick(TRANSITION_MS)
    expect(frames.pending()).toBe(0)
    expect(onPlayState.mock.calls).toEqual([[false], [true]])
    h.destroy()
  })

  it('destroy는 타이머와 프레임을 모두 거두고, 여러 번 불러도 된다', () => {
    const rec = recordingContext()
    const frames = fakeFrames()
    const onStep = vi.fn()
    const h = mountTutorial(asCanvas(fakeCanvas(rec)), 'K', { onStep, reducedMotion: false })
    h.setStep(1)
    expect(frames.pending()).toBe(1)
    h.destroy()
    h.destroy()
    expect(frames.pending()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    rec.reset()
    h.setStep(2)
    h.next()
    h.play()
    h.resize()
    vi.advanceTimersByTime(HOLD_MS * 5)
    expect(onStep.mock.calls).toEqual([[1]])
    expect(rec.calls).toEqual([])
  })
})

describe('재생기: 크기와 화면 배율', () => {
  it('픽셀 수는 CSS 크기 × 배율이고, 배율은 2까지만 쓴다', () => {
    vi.stubGlobal('devicePixelRatio', 3)
    const rec = recordingContext()
    const canvas = fakeCanvas(rec, 600, 358)
    const h = mountTutorial(asCanvas(canvas), 'K', { reducedMotion: true })
    // 600 × 430/720 = 358.33…: 상자 높이 358은 반올림된 값이므로 기준 비율로 맞춥니다.
    expect([canvas.width, canvas.height]).toEqual([1200, 717])
    expect(lines(rec.calls)[0]).toBe('setTransform(2,0,0,2,0,0)')
    expect(lines(rec.calls)[1]).toBe('clearRect(0,0,600,358.5)')
    expect(canvas.style).toEqual({})
    h.destroy()

    const rec3 = recordingContext()
    const canvas3 = fakeCanvas(rec3, 600, 358)
    mountTutorial(asCanvas(canvas3), 'K', { reducedMotion: true, maxPixelRatio: 3 }).destroy()
    expect([canvas3.width, canvas3.height]).toEqual([1800, 1075])
  })

  it('비율이 다른 상자에서는 그 상자를 다 칠하고 그림은 비율을 지켜 가운데에 둔다', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const rec = recordingContext()
    const canvas = fakeCanvas(rec, 320, 480)
    mountTutorial(asCanvas(canvas), 'K', { reducedMotion: true }).destroy()
    expect([canvas.width, canvas.height]).toEqual([640, 960])
    const want = recordingContext()
    drawTutorialFrame(want.ctx, 'K', 0, 1, { width: 320, height: 480 })
    expect(lines(rec.calls)).toEqual(['setTransform(2,0,0,2,0,0)', ...lines(want.calls)])
  })

  it('배율이 정수가 아니어도 그리는 크기가 픽셀 수와 꼭 맞는다', () => {
    vi.stubGlobal('devicePixelRatio', 1.5)
    const rec = recordingContext()
    const canvas = fakeCanvas(rec, 601, 359)
    mountTutorial(asCanvas(canvas), 'K', { reducedMotion: true }).destroy()
    expect([canvas.width, canvas.height]).toEqual([902, 538])
    const clear = rec.calls.find((c) => c.op === 'clearRect')
    expect((clear?.args[2] as number) * 1.5).toBeCloseTo(902, 9)
    expect((clear?.args[3] as number) * 1.5).toBeCloseTo(538, 9)
  })

  it('resize는 바뀐 상자 크기에 맞추고 바로 다시 그린다', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const rec = recordingContext()
    const canvas = fakeCanvas(rec, 720, 430)
    const h = mountTutorial(asCanvas(canvas), 'P', { reducedMotion: true })
    h.setStep(2)
    canvas.clientWidth = 360
    canvas.clientHeight = 215
    rec.reset()
    h.resize()
    expect([canvas.width, canvas.height]).toEqual([720, 430])
    const want = recordingContext()
    drawTutorialFrame(want.ctx, 'P', 2, 1, { width: 360, height: 215 })
    expect(lines(rec.calls)).toEqual(['setTransform(2,0,0,2,0,0)', ...lines(want.calls)])
    expect(countOf(rec.calls, 'clearRect')).toBe(1)
    h.destroy()
  })

  it('크기를 잴 수 없으면 (아직 화면에 없으면) 기준 크기 720×430으로 그린다', () => {
    const rec = recordingContext()
    const canvas = fakeCanvas(rec, 0, 0)
    mountTutorial(asCanvas(canvas), 'K', { reducedMotion: true }).destroy()
    expect([canvas.width, canvas.height]).toEqual([720, 430])
    expect(lines(rec.calls)[1]).toBe('clearRect(0,0,720,430)')
  })

  it('CSS로 크기를 정하지 않아 픽셀 수를 따라 커지는 캔버스는 잰 크기로 묶는다', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const rec = recordingContext()
    const canvas = fakeCanvas(rec)
    // CSS 크기가 없는 캔버스: 보이는 크기가 곧 width/height 속성입니다.
    Object.defineProperty(canvas, 'clientWidth', { get: () => canvas.width })
    Object.defineProperty(canvas, 'clientHeight', { get: () => canvas.height })
    const h = mountTutorial(asCanvas(canvas), 'K', { reducedMotion: true })
    expect([canvas.width, canvas.height]).toEqual([1440, 860])
    expect(canvas.style).toEqual({ width: '720px', height: '430px' })
    h.destroy()
  })
})
