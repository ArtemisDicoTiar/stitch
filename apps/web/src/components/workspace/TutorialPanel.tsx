'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { allRows } from '@stitch/engine'
import type { Expanded, SymbolId } from '@stitch/pattern-ir'
import { symbolSvg } from '@stitch/render-chart'
import { TUTORIALS, TUTORIAL_LEGEND } from '@stitch/tutorials'
import { TutorialPlayer, type TutorialPlayerHandle, type TutorialState } from '@/components/knit/TutorialPlayer'
import { onTabKey } from './tabs'
import styles from './Workspace.module.css'

type Props = {
  expanded: Expanded
  /** 도안에 나온 기호 */
  symbols: SymbolId[]
  symbol: SymbolId
  onSymbol: (symbol: SymbolId) => void
  /** 지금 뜰 단 */
  workRow: number
}

/** 이어진 단은 "25–60"처럼 묶어 적습니다. */
function compactRows(rows: number[], max = 8): string {
  const runs: [number, number][] = []
  for (const g of rows) {
    const last = runs[runs.length - 1]
    if (last && g === last[1] + 1) last[1] = g
    else runs.push([g, g])
  }
  const shown = runs.slice(0, max).map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  const rest = runs.slice(max).reduce((n, [a, b]) => n + (b - a + 1), 0)
  return `${shown.join(', ')}단${rest > 0 ? ` 외 ${rest}단` : ''}`
}

/** 기호별 뜨는 법: 도안에 나온 기호만 탭으로 보여 줍니다. */
export function TutorialPanel({ expanded, symbols, symbol, onSymbol, workRow }: Props) {
  const uid = useId()
  const player = useRef<TutorialPlayerHandle>(null)
  const [state, setState] = useState<TutorialState>({ step: 0, count: TUTORIALS[symbol].steps.length, playing: false })
  const [slow, setSlow] = useState(false)
  const tut = TUTORIALS[symbol]
  const step = tut.steps[Math.min(state.step, tut.steps.length - 1)]

  const where = useMemo(() => {
    const rows = allRows(expanded)
      .filter((r) => r.cells.some((c) => c.s === symbol))
      .map((r) => r.g)
    if (rows.length === 0) return null
    const often = rows.length > expanded.totalRows * 0.6
    const next = rows.includes(workRow) ? workRow : (rows.find((g) => g > workRow) ?? null)
    return { text: often ? '거의 모든 단에 나와요.' : `${compactRows(rows)}에 나와요.`, next, here: next === workRow, often }
  }, [expanded, symbol, workRow])

  return (
    <div className={styles.howto}>
      <p className={styles.note}>
        도안에 나오는 기호를 고르면 바늘과 실이 어떻게 움직이는지 한 단계씩 보여 줘요. 각 단계에서 왼손과 오른손이 할 일도 함께 적었어요. {TUTORIAL_LEGEND}
      </p>
      <div className={styles.symTabs} role="tablist" aria-label="기호 고르기" onKeyDown={(e) => onTabKey(e, symbols, symbol, onSymbol)}>
        {symbols.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            id={`${uid}-tab-${s}`}
            aria-selected={s === symbol}
            aria-controls={`${uid}-panel`}
            tabIndex={s === symbol ? 0 : -1}
            className={styles.symTab}
            onClick={() => onSymbol(s)}
          >
            <span className={styles.legendSym} aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolSvg(s, 30) }} />
            {TUTORIALS[s].label}
          </button>
        ))}
      </div>

      <div className={styles.howGrid} role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-tab-${symbol}`}>
        <div className={styles.howFig}>
          <TutorialPlayer ref={player} symbol={symbol} speed={slow ? 0.55 : 1} onState={setState} label={`${tut.title} 뜨는 법 그림. ${state.step + 1}단계: ${step.text}`} />
        </div>
        <div className={styles.howSide}>
          <div>
            <h3 className={styles.howTitle}>{tut.title}</h3>
            <p className={styles.note}>{tut.summary}</p>
          </div>
          <div className={styles.cap} aria-live={state.playing ? 'off' : 'polite'}>
            <p className={styles.capN}>
              <strong>
                {state.step + 1} / {tut.steps.length}
              </strong>{' '}
              단계
            </p>
            <p className={styles.capText}>{step.text}</p>
            <dl className={styles.hands}>
              <div>
                <dt>왼손</dt>
                <dd>{step.left}</dd>
              </div>
              <div>
                <dt>오른손</dt>
                <dd>{step.right}</dd>
              </div>
            </dl>
          </div>
          <div className={styles.dots} role="group" aria-label="단계 고르기">
            {tut.steps.map((_, i) => (
              <button key={i} type="button" className={styles.dot} aria-current={i === state.step ? 'step' : undefined} aria-label={`${i + 1}단계`} onClick={() => player.current?.setStep(i)}>
                {i + 1}
              </button>
            ))}
          </div>
          <div className={styles.ctl}>
            <button type="button" className={styles.lightBtn} onClick={() => player.current?.prev()}>
              이전
            </button>
            <button type="button" className={styles.lightBtn} data-strong="" onClick={() => (state.playing ? player.current?.pause() : player.current?.play())}>
              {state.playing ? '일시정지' : '재생'}
            </button>
            <button type="button" className={styles.lightBtn} onClick={() => player.current?.next()}>
              다음
            </button>
            <button type="button" className={styles.lightBtn} aria-pressed={slow} onClick={() => setSlow((v) => !v)}>
              천천히
            </button>
          </div>
          {where && (
            <p className={styles.where}>
              이 도안에서는 {where.text}
              {where.next !== null && (where.here ? <> 지금 뜰 <strong>{where.next}단</strong>에도 있어요.</> : !where.often && <> 다음은 <strong>{where.next}단</strong>이에요.</>)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
