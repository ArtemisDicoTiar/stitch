'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { rowAt } from '@stitch/engine'
import type { Craft, Expanded, SymbolId } from '@stitch/pattern-ir'
import type { ChartRing } from '@stitch/render-chart'
import { TUTORIALS, tutorialFor } from '@stitch/tutorials'
import { ChartView, type ChartViewHandle } from '@/components/knit/ChartView'
import { NumberField } from './NumberField'
import { sectionText, segmentAt, segmentStart, sideName, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

type Props = {
  expanded: Expanded
  craft: Craft
  /** 사용자의 지금 위치 (고치는 중이면 그 값) */
  form: Pos
  /** 화면이 보여 주는 위치. 작은 도안도 같은 값을 씁니다. */
  shown: Pos
  rings: ChartRing[]
  /** 단 재생이 보여 줄 위치. null이면 재생을 끝냅니다. 기록은 저장하지 않습니다. */
  onPlayPos: (pos: Pos | null) => void
  onHowTo: (symbol: SymbolId) => void
}

const MINI_OPTIONS = { controls: false, height: 'fill', zoom: 1.5, sections: false } as const

const TECH_NOTE: Record<string, string> = {
  PAT: '아랫단의 코가 겉이면 겉뜨기, 안이면 안뜨기로 떠요.',
  RIB: '겉뜨기와 안뜨기를 번갈아 뜨는 조각이에요.',
  BH: '바늘비우기와 모아뜨기로 구멍을 만드는 조각이에요.',
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * 단계별 안내. 단의 지시문을 조각으로 나눠 지금 뜨는 조각을 강조하고,
 * "단 재생"으로 그 단의 코가 뜨는 순서대로 채워지는 모습을 도안에서 바로 보여 줍니다.
 */
export function StepGuide({ expanded, craft, form, shown, rings, onPlayPos, onHowTo }: Props) {
  const uid = useId()
  const chart = useRef<ChartViewHandle>(null)
  const reduced = useReducedMotion()
  const work = workingPos(expanded, form)
  /** 둘러보는 단. null이면 지금 뜰 단을 따라갑니다. */
  const [browse, setBrowse] = useState<number | null>(null)
  /** 재생이 보여 주는, 이 단에서 뜬 코 수. null이면 재생하지 않는 중 */
  const [k, setK] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)

  const total = Math.max(1, expanded.totalRows)
  const g = Math.min(total, Math.max(1, browse ?? work.row))
  const row = rowAt(expanded, g)
  const n = row?.cells.length ?? 0

  const latestPlayPos = useRef(onPlayPos)
  latestPlayPos.current = onPlayPos

  const stop = useCallback(() => {
    setPlaying(false)
    setK(null)
  }, [])

  // 그 사이에 기록하거나 위치를 고치면 재생을 끝냅니다. 미리보기가 저장된 위치를 가리지 않게 합니다.
  useEffect(() => {
    stop()
  }, [form.row, form.stitch, stop])

  // 재생 위치를 위로 알립니다. 3D와 큰 도안도 같은 값으로 함께 움직입니다.
  useEffect(() => {
    latestPlayPos.current(k === null ? null : { row: g, stitch: k })
  }, [g, k])
  useEffect(() => () => latestPlayPos.current(null), [])

  // 뜨는 순서대로 한 코씩. 긴 단도 9초쯤에 끝나게 간격을 맞춥니다.
  useEffect(() => {
    if (!playing || reduced || n === 0) return
    const ms = Math.min(220, Math.max(45, 9000 / n))
    const t = setInterval(() => setK((v) => Math.min(n, (v ?? 0) + 1)), ms)
    return () => clearInterval(t)
  }, [playing, reduced, n])
  useEffect(() => {
    if (playing && k !== null && k >= n) setPlaying(false)
  }, [playing, k, n])

  // 작은 도안이 보고 있는 자리를 따라갑니다.
  const cursor = k ?? (g === work.row ? work.stitch : null)
  const followX = row && n > 0 ? row.cells[Math.min(cursor ?? 0, n - 1)].x : undefined
  useEffect(() => {
    const t = requestAnimationFrame(() => chart.current?.scrollToRow(g, { x: followX }))
    return () => cancelAnimationFrame(t)
  }, [g, followX])

  const go = (next: number | null) => {
    stop()
    setBrowse(next === null || next === work.row ? null : Math.min(total, Math.max(1, next)))
  }

  if (!row) return <p className={styles.empty}>이 도안에는 단이 없어요.</p>

  const active = cursor !== null && cursor < n ? segmentAt(row, cursor) : -1
  const rowDone = cursor !== null && cursor >= n
  const withCells = row.segments.map((s, i) => (s.xs.length > 0 ? i : -1)).filter((i) => i >= 0)
  const activeAt = withCells.indexOf(active)
  const seg = active >= 0 ? row.segments[active] : null
  const tut = seg ? tutorialFor(seg.tech) : null

  const stepTo = (dir: 1 | -1) => {
    setPlaying(false)
    if (dir > 0) {
      if (cursor === null || k === null) return setK(withCells.length ? segmentStart(row, withCells[Math.max(0, activeAt)]) : 0)
      const next = withCells[activeAt + 1]
      setK(next === undefined ? n : segmentStart(row, next))
    } else {
      if (k === null) return
      const prev = rowDone ? withCells[withCells.length - 1] : withCells[activeAt - 1]
      setK(prev === undefined ? 0 : segmentStart(row, prev))
    }
  }

  return (
    <div className={styles.steps}>
      <div className={styles.stepNav}>
        <button type="button" className={styles.lightBtn} disabled={g <= 1} onClick={() => go(g - 1)}>
          이전 단
        </button>
        <label htmlFor={`${uid}-g`} className="sr-only">
          안내를 볼 단
        </label>
        <NumberField id={`${uid}-g`} className={styles.lightNum} value={g} min={1} max={total} onCommit={(v) => go(v)} />
        <span className={styles.stepOf}>/ {total}단</span>
        <button type="button" className={styles.lightBtn} disabled={g >= total} onClick={() => go(g + 1)}>
          다음 단
        </button>
        <button type="button" className={styles.lightBtn} disabled={browse === null} onClick={() => go(null)}>
          지금 뜰 단으로
        </button>
      </div>

      <div className={styles.stepGrid}>
        <section className={styles.cardBox} aria-labelledby={`${uid}-h`}>
          <div className={styles.stepHead}>
            <h3 className={styles.stepTitle} id={`${uid}-h`} data-testid="step-row">
              {g}단{row.label && row.label !== `${g}단` ? ` · ${row.label}` : ''}
            </h3>
            <span className={styles.sideChip} data-side={row.side}>
              {row.side === 'WS' ? '안면 → 방향' : row.side === 'RS' ? '겉면 ← 방향' : craft === 'crochet' ? '원형 ← 방향' : '원통 ← 방향'}
            </span>
            {g === work.row && <span className={styles.nowChip}>지금 뜰 단</span>}
            <span className={styles.countPill}>뜬 뒤 {row.count}코</span>
          </div>
          <p className={styles.stepMeta}>
            {[sectionText(expanded, g), sideName(row.side, craft), row.estimated ? '길이로 적힌 구간 (게이지로 추정한 단)' : '', row.markers.length ? `마커 ${row.markers.length}개` : ''].filter(Boolean).join(' · ')}
          </p>
          <blockquote className={styles.instr}>{row.instr}</blockquote>

          <ol className={styles.segs} aria-label="지시문 조각">
            {row.segments.map((s, i) => {
              const start = segmentStart(row, i)
              const state = i === active ? 'now' : cursor !== null && start + s.xs.length <= cursor && s.xs.length > 0 ? 'done' : 'todo'
              return (
                <li key={i}>
                  <button
                    type="button"
                    className={styles.seg}
                    data-state={state}
                    aria-current={i === active ? 'step' : undefined}
                    disabled={s.xs.length === 0}
                    onClick={() => {
                      setPlaying(false)
                      setK(start)
                    }}
                  >
                    <span>{s.text}</span>
                    {s.xs.length > 0 && <small>{s.xs.length}코</small>}
                  </button>
                </li>
              )
            })}
          </ol>

          <div className={styles.segNow} aria-live={playing ? 'off' : 'polite'}>
            {seg ? (
              <>
                <p>
                  <span className={styles.segNowK}>{k === null ? '지금 뜰 조각' : '보고 있는 조각'}</span>
                  <strong>{seg.text}</strong>
                </p>
                {TECH_NOTE[seg.tech.toUpperCase()] && <p className={styles.note}>{TECH_NOTE[seg.tech.toUpperCase()]}</p>}
                {tut && (
                  <button type="button" className={styles.lightBtn} onClick={() => onHowTo(tut)}>
                    {TUTORIALS[tut].label} 뜨는 법 보기
                  </button>
                )}
              </>
            ) : rowDone ? (
              <p>{craft === 'crochet' ? `이 단을 끝까지 떴어요. 이 단은 ${row.count}코예요.` : `이 단을 끝까지 떴어요. 뜬 뒤 바늘에는 ${row.count}코가 걸려 있어요.`}</p>
            ) : (
              <p className={styles.note}>조각을 누르거나 ‘단 재생’을 누르면 그 자리부터 도안에서 보여 줘요.</p>
            )}
          </div>
        </section>

        <section className={styles.cardBox} aria-label="단 재생">
          <div className={styles.cardHead}>
            <h3 className={styles.h3}>단 재생</h3>
            <span className={styles.cardSub} data-testid="play-status">
              {k === null ? '이 단의 코가 뜨는 순서대로 채워져요' : `${g}단 · ${k} / ${n}코 · 기록은 저장하지 않아요`}
            </span>
          </div>
          <div className={styles.miniChart}>
            <ChartView
              ref={chart}
              className={styles.chartHost}
              expanded={expanded}
              progress={shown}
              rings={rings}
              selection={k === null && browse !== null && n > 0 ? { row: g, stitch: 1 } : null}
              onPick={(p) => go(p.row)}
              options={MINI_OPTIONS}
            />
          </div>
          <div className={styles.ctl}>
            {!reduced && (
              <button
                type="button"
                className={styles.lightBtn}
                data-strong=""
                disabled={n === 0}
                onClick={() => {
                  if (playing) return setPlaying(false)
                  if (k === null || k >= n) setK(g === work.row && k === null && work.stitch < n ? work.stitch : 0)
                  setPlaying(true)
                }}
              >
                {playing ? '멈춤' : '단 재생'}
              </button>
            )}
            <button type="button" className={styles.lightBtn} disabled={k === null || k <= 0} onClick={() => stepTo(-1)}>
              이전 조각
            </button>
            <button type="button" className={styles.lightBtn} disabled={n === 0 || (k !== null && k >= n)} onClick={() => stepTo(1)}>
              다음 조각
            </button>
            <button type="button" className={styles.lightBtn} disabled={k === null} onClick={stop}>
              재생 끝내기
            </button>
          </div>
          {reduced && <p className={styles.note}>움직임 줄이기 설정이 켜져 있어서 저절로 넘어가지 않아요. ‘다음 조각’으로 한 조각씩 넘겨 보세요.</p>}
        </section>
      </div>
    </div>
  )
}
