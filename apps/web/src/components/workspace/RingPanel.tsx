'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { rowAt } from '@stitch/engine'
import type { Expanded } from '@stitch/pattern-ir'
import type { RingMarker } from '@/server/patterns'
import type { RingInput } from './useKnitLog'
import { sideFrom } from './position'
import styles from './Workspace.module.css'

const COLOR_NAMES = ['주황', '파랑', '초록', '자주', '노랑', '보라']

export function ringColorName(colors: readonly string[], color: string): string {
  const i = colors.findIndex((c) => c.toLowerCase() === color.toLowerCase())
  return i >= 0 && i < COLOR_NAMES.length ? COLOR_NAMES[i] : color
}

/** "29단 · 오른쪽부터 5번째 코" */
export function ringWhere(expanded: Expanded, row: number, x: number): string {
  const r = rowAt(expanded, row)
  const cell = r?.cells.find((c) => c.x === x)
  return r && cell ? `${row}단 · ${sideFrom(r.side)} ${cell.k + 1}번째 코` : `${row}단`
}

export type RingTarget = { row: number; x: number; from: 'pick' | 'now' }

type Props = {
  expanded: Expanded
  rings: RingMarker[]
  colors: readonly string[]
  /** 새 단수링을 달 자리: 도안에서 고른 칸, 없으면 지금 뜰 코 */
  target: RingTarget | null
  onAdd: (input: RingInput) => void
  onPatch: (id: string, patch: { color?: string; name?: string }) => void
  onRemove: (id: string) => void
}

/** 단수링: 달기, 이름과 색 바꾸기, 빼기. 기호 도안과 3D의 같은 자리에 보입니다. */
export function RingPanel({ expanded, rings, colors, target, onAdd, onPatch, onRemove }: Props) {
  const uid = useId()
  const [color, setColor] = useState<string | null>(null)
  const [name, setName] = useState('')
  const picked = color ?? colors[rings.length % colors.length]
  const sorted = [...rings].sort((a, b) => a.row - b.row || a.x - b.x)
  const taken = target ? rings.some((r) => r.row === target.row && r.x === target.x) : false

  return (
    <section className={styles.ringPanel} aria-labelledby={`${uid}-h`}>
      <div className={styles.panelHead}>
        <h2 id={`${uid}-h`} className={styles.panelTitle}>
          단수링
        </h2>
        <span className={styles.panelCount}>{rings.length}개</span>
      </div>

      {sorted.length === 0 ? (
        <p className={styles.panelEmpty}>아직 단 단수링이 없어요. 길이를 재기 시작한 단이나 몇 단마다 표시해 두면 세기 쉬워요.</p>
      ) : (
        <ul className={styles.ringList}>
          {sorted.map((r) => (
            <RingItem key={r.id} ring={r} where={ringWhere(expanded, r.row, r.x)} colors={colors} onPatch={onPatch} onRemove={onRemove} />
          ))}
        </ul>
      )}

      <form
        className={styles.ringForm}
        onSubmit={(e) => {
          e.preventDefault()
          if (!target || taken) return
          onAdd({ row: target.row, x: target.x, color: picked, name })
          setName('')
          setColor(null)
        }}
      >
        <p className={styles.ringTarget}>
          <span className={styles.fieldLabel}>달 자리</span>
          <span>
            {target ? ringWhere(expanded, target.row, target.x) : '달 수 있는 코가 없어요'}
            <small>{target ? (target.from === 'pick' ? ' (도안에서 고른 칸)' : ' (지금 뜰 코)') : ''}</small>
          </span>
        </p>
        <div className={styles.swatches} role="radiogroup" aria-labelledby={`${uid}-color-l`}>
          <span className={styles.fieldLabel} id={`${uid}-color-l`}>
            색
          </span>
          {colors.map((c) => (
            <label key={c} className={styles.swatch} data-on={picked === c || undefined}>
              <input type="radio" name={`${uid}-color`} className="sr-only" checked={picked === c} onChange={() => setColor(c)} />
              <span className={styles.ringDot} style={{ borderColor: c }} aria-hidden="true" />
              <span className="sr-only">{ringColorName(colors, c)}</span>
            </label>
          ))}
        </div>
        <div className={styles.ringNameRow}>
          <label htmlFor={`${uid}-name`} className="sr-only">
            새 단수링 이름
          </label>
          <input id={`${uid}-name`} className={styles.text} type="text" maxLength={40} value={name} placeholder="이름 (선택)" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className={styles.miniBtn} disabled={!target || taken}>
            단수링 달기
          </button>
        </div>
        {taken && <p className={styles.panelEmpty}>이 자리에는 이미 단수링이 있어요.</p>}
      </form>
    </section>
  )
}

function RingItem({ ring, where, colors, onPatch, onRemove }: { ring: RingMarker; where: string; colors: readonly string[]; onPatch: Props['onPatch']; onRemove: Props['onRemove'] }) {
  const uid = useId()
  const [name, setName] = useState(ring.name)
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 다른 곳에서 이름이 바뀌면(되돌리기 등) 따라갑니다.
  useEffect(() => setName(ring.name), [ring.name])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const commit = () => {
    if (name.trim() !== ring.name) onPatch(ring.id, { name })
  }
  const next = colors[(Math.max(0, colors.findIndex((c) => c.toLowerCase() === ring.color.toLowerCase())) + 1) % colors.length]
  return (
    <li className={styles.ringItem}>
      <button
        type="button"
        className={styles.ringColorBtn}
        aria-label={`${ring.name || where} 색 바꾸기 (지금 ${ringColorName(colors, ring.color)})`}
        onClick={() => onPatch(ring.id, { color: next })}
      >
        <span className={styles.ringDot} style={{ borderColor: ring.color }} aria-hidden="true" />
      </button>
      <div className={styles.ringBody}>
        <label htmlFor={`${uid}-n`} className="sr-only">
          {where} 단수링 이름
        </label>
        <input
          id={`${uid}-n`}
          className={styles.ringName}
          type="text"
          maxLength={40}
          value={name}
          placeholder="이름 없음"
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
          }}
        />
        <span className={styles.ringWhere}>{where}</span>
      </div>
      <button
        type="button"
        className={styles.miniBtn}
        data-warn={armed || undefined}
        aria-label={armed ? `${ring.name || where} 단수링 정말 빼기` : `${ring.name || where} 단수링 빼기`}
        onClick={() => {
          if (armed) return onRemove(ring.id)
          setArmed(true)
          timer.current = setTimeout(() => setArmed(false), 3000)
        }}
      >
        {armed ? '정말 뺄까요?' : '빼기'}
      </button>
    </li>
  )
}
