'use client'

/**
 * 기호별 뜨는 법(@stitch/tutorials)의 재생기를 React에 얹는 얇은 포장.
 * 재생기는 올릴 때 콜백을 부르지 않으므로, 처음 상태는 손잡이에서 읽어 알려 줍니다.
 */
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import type { SymbolId } from '@stitch/pattern-ir'
import { mountTutorial, type TutorialHandle } from '@stitch/tutorials'

export type TutorialPlayerHandle = {
  next(): void
  prev(): void
  setStep(step: number): void
  play(): void
  pause(): void
}

export type TutorialState = { step: number; count: number; playing: boolean }

type Props = {
  symbol: SymbolId
  /** 1이 보통, 0.55가 "천천히" */
  speed?: number
  onState?: (state: TutorialState) => void
  /** 스크린 리더가 읽는 그림 설명 */
  label: string
  className?: string
  ref?: Ref<TutorialPlayerHandle>
}

export function TutorialPlayer({ symbol, speed = 1, onState, label, className, ref }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const handle = useRef<TutorialHandle | null>(null)
  const latest = useRef({ symbol, speed, onState })
  latest.current = { symbol, speed, onState }

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const report = () => {
      const h = handle.current
      if (h) latest.current.onState?.({ step: h.getStep(), count: h.stepCount(), playing: h.isPlaying() })
    }
    const h = mountTutorial(el, latest.current.symbol, { speed: latest.current.speed, onStep: report, onPlayState: report })
    handle.current = h
    report()
    return () => {
      handle.current = null
      h.destroy()
    }
  }, [])

  useEffect(() => {
    const h = handle.current
    if (!h || h.getSymbol() === symbol) return
    h.setSymbol(symbol)
    // 단계 수가 기호마다 다르므로 한 번 더 알립니다.
    latest.current.onState?.({ step: h.getStep(), count: h.stepCount(), playing: h.isPlaying() })
  }, [symbol])

  useEffect(() => {
    handle.current?.setSpeed(speed)
  }, [speed])

  useImperativeHandle(
    ref,
    () => ({
      next: () => handle.current?.next(),
      prev: () => handle.current?.prev(),
      setStep: (s) => handle.current?.setStep(s),
      play: () => handle.current?.play(),
      pause: () => handle.current?.pause(),
    }),
    [],
  )

  return <canvas ref={canvas} className={className} role="img" aria-label={label} style={{ width: '100%', aspectRatio: '720 / 430', display: 'block' }} />
}
