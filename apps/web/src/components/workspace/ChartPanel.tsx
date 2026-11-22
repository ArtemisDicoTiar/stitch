'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { rowAt } from '@stitch/engine'
import type { Craft, Expanded, SymbolId } from '@stitch/pattern-ir'
import { SYMBOLS, symbolSvg, type ChartPick, type ChartRing } from '@stitch/render-chart'
import { tutorialFor } from '@stitch/tutorials'
import { ChartView, type ChartViewHandle, type ChartViewOptions } from '@/components/knit/ChartView'
import { sectionText, sideFrom, sideName, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

type Props = {
  expanded: Expanded
  craft: Craft
  /** 도안에 나온 기호 */
  symbols: SymbolId[]
  shown: Pos
  /** 저장된 지금 위치. 이 값이 바뀌면 그 단이 보이게 따라갑니다. */
  saved: Pos
  rings: ChartRing[]
  pick: ChartPick | null
  /** 고른 칸에 이미 단수링이 있는지 */
  pickHasRing: boolean
  /** 고른 칸의 기호에 맞는 뜨는 법이 있는지 */
  onPick: (pick: ChartPick | null) => void
  onRecordPick: (pick: ChartPick) => void
  onPreviewPick: (pick: ChartPick) => void
  onToggleRing: (pick: ChartPick) => void
  onHowTo: (symbol: SymbolId) => void
  /** 이 탭이 보이는지 */
  active: boolean
}


/** 전체 기호 도안: 확대와 축소, 칸 고르기, 범례 */
export function ChartPanel({ expanded, craft, symbols, shown, saved, rings, pick, pickHasRing, onPick, onRecordPick, onPreviewPick, onToggleRing, onHowTo, active }: Props) {
  const uid = useId()
  const chart = useRef<ChartViewHandle>(null)
  const box = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [full, setFull] = useState(false)
  const jumped = useRef(false)
  // 휴대폰에서는 칸이 손가락으로 누를 만한 크기로 시작합니다. 넓은 화면은 가로에 맞춥니다.
  const options = useMemo<ChartViewOptions>(() => ({ controls: false, height: 'fill', ...(typeof window !== 'undefined' && window.innerWidth < 700 ? { zoom: 1 } : {}) }), [])

  const estimated = useMemo(() => expanded.blocks.reduce((n, b) => n + b.rows.filter((r) => r.estimated).length, 0), [expanded])
  const hasGaps = useMemo(() => expanded.blocks.some((b) => b.rows.some((r) => r.cells.length < b.W)), [expanded])
  /** 늘림으로 생긴 코를 그릴 때 쓰는 기호 (없으면 null) */
  const addedSymbol = useMemo(() => {
    for (const b of expanded.blocks) for (const r of b.rows) for (const c of r.cells) if (c.a) return c.s
    return null
  }, [expanded])

  const toNow = useCallback(
    (smooth: boolean) => {
      const w = workingPos(expanded, shown)
      const r = rowAt(expanded, w.row)
      const cell = r?.cells[Math.min(w.stitch, Math.max(0, r.cells.length - 1))]
      chart.current?.scrollToRow(w.row, { x: cell?.x, smooth })
    },
    [expanded, shown],
  )

  // 처음 보일 때 한 번, 지금 뜰 단이 가운데 오게 합니다.
  useEffect(() => {
    if (!active || jumped.current) return
    const t = requestAnimationFrame(() => {
      jumped.current = true
      toNow(false)
    })
    return () => cancelAnimationFrame(t)
  }, [active, toNow])

  // 기록해서 단이 바뀌면, 그 단이 화면 밖일 때만 세로로 따라갑니다. 가로 자리는 건드리지 않습니다.
  const savedRow = saved.row
  useEffect(() => {
    if (!jumped.current) return
    const view = chart.current?.viewport()
    const r = rowAt(expanded, savedRow)
    const rect = r?.cells.length ? chart.current?.cellRect(savedRow, r.cells[0].x) : null
    if (!view || !rect) return
    const vr = view.getBoundingClientRect()
    if (vr.height === 0) return
    if (rect.top < vr.top + 24 || rect.bottom > vr.bottom - 24) view.scrollTop += rect.top + rect.height / 2 - (vr.top + vr.height / 2)
  }, [savedRow, expanded])

  // 고른 칸 옆에 카드를 둡니다. 도안을 옮기거나 확대하면 따라갑니다.
  // adjust면(칸을 막 골랐을 때) 카드가 칸을 가리지 않게 도안을 조금 옮깁니다.
  const place = useCallback(
    (adjust: boolean) => {
      const b = box.current
      const c = card.current
      if (!b || !c || !pick) return
      const br = b.getBoundingClientRect()
      const cell = chart.current?.cellRect(pick.row, pick.x)
      const cw = c.offsetWidth
      const ch = c.offsetHeight
      const pad = 8
      const gap = 10
      if (!cell) {
        c.style.left = `${Math.max(pad, br.width - cw - pad)}px`
        c.style.top = `${Math.max(pad, br.height - ch - pad)}px`
        return
      }
      let cellTop = cell.top - br.top
      let cellBottom = cell.bottom - br.top
      const fitsBelow = () => cellBottom + gap + ch <= br.height - pad
      const fitsAbove = () => cellTop - gap - ch >= pad
      const view = chart.current?.viewport()
      if (adjust && view && !fitsBelow() && !fitsAbove()) {
        // 칸을 아래로 내려 카드를 위에 둡니다. 맨 위라 못 내리면 칸을 올려 카드를 아래에 둡니다.
        const shift = (by: number) => {
          const before = view.scrollTop
          view.scrollTop = before + by
          const moved = view.scrollTop - before
          cellTop -= moved
          cellBottom -= moved
        }
        shift(-(pad + ch + gap - cellTop))
        if (!fitsAbove()) shift(cellBottom + gap + ch - (br.height - pad))
      }
      const left = Math.min(Math.max(pad, cell.left + cell.width / 2 - br.left - cw / 2), Math.max(pad, br.width - cw - pad))
      let top = cellBottom + gap
      if (!fitsBelow()) top = cellTop - ch - gap
      top = Math.min(Math.max(pad, top), Math.max(pad, br.height - ch - pad))
      c.style.left = `${left}px`
      c.style.top = `${top}px`
    },
    [pick],
  )

  useLayoutEffect(() => {
    place(true)
  }, [place])
  useLayoutEffect(() => {
    place(false)
    // 확대 비율이나 크게 보기가 바뀌면 자리만 다시 잡습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, full])

  useEffect(() => {
    if (!pick) return
    const view = chart.current?.viewport()
    let raf = 0
    const on = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        place(false)
      })
    }
    view?.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => {
      view?.removeEventListener('scroll', on)
      window.removeEventListener('resize', on)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pick, place])

  // 크게 보기: 창을 가득 채웁니다. Escape로 돌아옵니다.
  useEffect(() => {
    if (!full) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pick) setFull(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [full, pick])

  const pickedRow = pick ? rowAt(expanded, pick.row) : undefined
  const pickedCell = pick && pickedRow ? pickedRow.cells.find((c) => c.x === pick.x) : undefined
  const pickedName = pickedCell ? SYMBOLS[pickedCell.s].name : ''
  const crochet = craft === 'crochet'
  const how = pickedCell
    ? pickedRow?.side === 'WS' && pickedCell.s === 'K'
      ? '겉뜨기 기호 (안면에서는 안뜨기로 떠요)'
      : pickedRow?.side === 'WS' && pickedCell.s === 'P'
        ? '안뜨기 기호 (안면에서는 겉뜨기로 떠요)'
        : pickedName
    : ''

  return (
    <div className={styles.chartPane} data-full={full || undefined}>
      <div className={styles.toolbar} role="toolbar" aria-label="도안 확대와 축소">
        <button type="button" className={styles.toolBtn} aria-label="축소" onClick={() => chart.current?.setZoom((chart.current?.getZoom() ?? 1) / 1.5)}>
          −
        </button>
        <output className={styles.zoomOut} aria-label="확대 비율">
          {Math.round(zoom * 100)}%
        </output>
        <button type="button" className={styles.toolBtn} aria-label="확대" onClick={() => chart.current?.setZoom((chart.current?.getZoom() ?? 1) * 1.5)}>
          +
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => {
            chart.current?.setZoom('fit')
            chart.current?.viewport()?.scrollTo({ left: 0, top: 0 })
          }}
        >
          전체 보기
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => chart.current?.setZoom('width')}>
          가로 맞춤
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => toNow(true)}>
          지금 위치로
        </button>
        <button type="button" className={styles.toolBtn} aria-pressed={full} onClick={() => setFull((v) => !v)}>
          {full ? '작게 보기' : '크게 보기'}
        </button>
      </div>

      <div className={styles.chartBox} ref={box}>
        <ChartView
          ref={chart}
          className={styles.chartHost}
          expanded={expanded}
          progress={shown}
          rings={rings}
          selection={pick ? { row: pick.row, stitch: pick.stitch } : null}
          onPick={onPick}
          onDismiss={() => onPick(null)}
          onZoom={setZoom}
          options={options}
        />
        {pick && pickedRow && (
          <div
            className={styles.pickCard}
            ref={card}
            role="group"
            aria-labelledby={`${uid}-pick`}
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return
              e.stopPropagation()
              onPick(null)
              chart.current?.focus()
            }}
          >
            <div className={styles.pickHead}>
              <strong id={`${uid}-pick`}>
                {pick.row}단 · {sideFrom(pickedRow.side)} {pick.stitch}번째 코
              </strong>
              <span>
                {[sectionText(expanded, pick.row), sideName(pickedRow.side, craft), how, pick.stitch === pickedRow.cells.length ? '이 단의 마지막 코' : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
            <button type="button" className={styles.pickPrimary} onClick={() => onRecordPick(pick)}>
              여기까지 떴어요 · 지금 기록
            </button>
            <button type="button" className={styles.pickBtn} onClick={() => onPreviewPick(pick)}>
              기록하기 전에 미리 보기
            </button>
            <button type="button" className={styles.pickBtn} onClick={() => onToggleRing(pick)}>
              {pickHasRing ? '단수링 빼기' : '여기에 단수링 달기'}
            </button>
            {pickedCell && tutorialFor(pickedCell.s) && (
              <button type="button" className={styles.pickBtn} onClick={() => onHowTo(pickedCell.s)}>
                {pickedName} 뜨는 법 보기
              </button>
            )}
            <button type="button" className={styles.pickBtn} onClick={() => onPick(null)}>
              닫기
            </button>
          </div>
        )}
      </div>

      <p className={styles.note}>칸을 누르면 그 코까지 뜬 것으로 기록하거나 단수링을 달 수 있어요. 두 손가락이나 Ctrl + 휠로 확대하고 축소합니다. 끌어서 옮겨 볼 수 있어요.</p>

      <div className={styles.readNote}>
        <h3 className={styles.h3}>도안 읽는 법</h3>
        <p>
          {crochet
            ? '한 칸이 1코이고, 아래에서 위로 올라가며 뜹니다. 원형으로 뜨는 단과 겉면 단은 오른쪽에서 왼쪽으로, 안면 단은 왼쪽에서 오른쪽으로 읽습니다. 늘림으로 생긴 코는 그 단부터 칸이 생기고, 줄임으로 없어진 자리는 회색으로 남습니다. 기록한 곳까지는 선명하게, 아직 안 뜬 곳은 흐리게 보입니다.'
            : '한 칸이 1코 1단이고, 겉면에서 보이는 모양으로 그렸습니다. 아래에서 위로 올라가며 뜨고, 겉면 단은 오른쪽에서 왼쪽으로, 안면 단은 왼쪽에서 오른쪽으로 읽습니다. 기록한 곳까지는 선명하게, 아직 안 뜬 곳은 흐리게 보입니다.'}
          {estimated > 0 && ` 노란 띠로 표시한 ${estimated}단은 길이로 적힌 구간을 게이지로 추정한 단수입니다. 실제로는 길이를 재며 맞춰 주세요.`}
        </p>
        <ul className={styles.legend} aria-label="기호 범례">
          {symbols.map((s) => (
            <li key={s}>
              <span className={styles.legendSym} aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolSvg(s, 24) }} />
              {SYMBOLS[s].name}
            </li>
          ))}
          {addedSymbol && (
            <li>
              <span className={styles.legendSym} aria-hidden="true" dangerouslySetInnerHTML={{ __html: symbolSvg(addedSymbol, 24, { bg: '#d9f2cf' }) }} />
              늘림 (같은 코에 한 번 더 뜬 코)
            </li>
          )}
          {hasGaps && (
            <li>
              <span className={styles.legendSwatch} data-kind="none" aria-hidden="true" />
              {crochet ? '코 없음 (늘기 전이나 줄어든 자리)' : '코 없음 (줄어든 자리)'}
            </li>
          )}
          {estimated > 0 && (
            <li>
              <span className={styles.legendSwatch} data-kind="estimated" aria-hidden="true" />
              게이지로 추정한 단
            </li>
          )}
          <li>
            <span className={styles.legendSwatch} data-kind="now" aria-hidden="true" />
            지금 뜰 단
          </li>
        </ul>
      </div>
    </div>
  )
}
