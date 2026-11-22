'use client'

import { useId, useState } from 'react'
import { rowAt } from '@stitch/engine'
import type { Expanded } from '@stitch/pattern-ir'
import { NumberField } from './NumberField'
import { cellsIn, isComplete, localInput, sideFrom, sideName, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

type Props = {
  expanded: Expanded
  /** 입력 칸에 보이는 위치: 고치는 중이면 그 값, 아니면 저장된 지금 위치 */
  pos: Pos
  /** 저장하지 않은 변경이 있는지 */
  dirty: boolean
  /** 저장된 위치가 마지막 단까지 다 뜬 상태인지 */
  complete: boolean
  finishing: { name: string; text: string }[]
  finishingDone: number
  onDraft: (pos: Pos) => void
  onReset: () => void
  /** 지금 뜨던 단을 끝내고 바로 기록 */
  onRowUp: () => void
  /** 입력한 위치를 기록 */
  onSave: (opts: { memo: string; at?: string }) => void
  /** 다음 마무리 단계를 끝낸 것으로 기록 */
  onFinish: (step: number) => void
}

/**
 * 기록하기. 넓은 화면에서는 3D 옆의 패널이고, 휴대폰에서는 엄지가 닿는 아래쪽 막대입니다.
 */
export function RecordPanel({ expanded, pos, dirty, complete, finishing, finishingDone, onDraft, onReset, onRowUp, onSave, onFinish }: Props) {
  const uid = useId()
  const [memo, setMemo] = useState('')
  const [when, setWhen] = useState<string | null>(null)
  const [extra, setExtra] = useState(false)

  const total = Math.max(1, expanded.totalRows)
  const n = cellsIn(expanded, pos.row)
  const done = isComplete(expanded, pos)
  const work = workingPos(expanded, pos)
  const row = rowAt(expanded, work.row)
  const allDone = complete && !dirty
  const nextFinish = allDone && finishingDone < finishing.length ? finishing[finishingDone] : null

  const setRow = (r: number) => onDraft({ row: Math.min(total, Math.max(1, r)), stitch: 0 })
  const setStitch = (s: number) => onDraft({ row: pos.row, stitch: Math.min(n, Math.max(0, s)) })
  const rowPlus = () => (pos.row >= total ? onDraft({ row: total, stitch: cellsIn(expanded, total) }) : setRow(pos.row + 1))

  const save = () => {
    let at: string | undefined
    if (when) {
      const d = new Date(when)
      if (!Number.isNaN(d.getTime())) at = d.toISOString()
    }
    onSave({ memo, at })
    setMemo('')
    setWhen(null)
    setExtra(false)
  }

  return (
    <section className={styles.record} aria-labelledby={`${uid}-h`} data-dirty={dirty || undefined}>
      <h2 id={`${uid}-h`} className={styles.recordTitle}>
        기록하기
      </h2>

      <div className={styles.recordNow}>
        <p className={styles.recordHint} id={`${uid}-hint`}>
          {done ? (
            allDone ? (
              finishing.length > 0 && finishingDone >= finishing.length ? (
                <>
                  <strong>완성</strong> · 모든 단계를 마쳤어요
                </>
              ) : (
                <>
                  <strong>뜨기 완료</strong> · {finishing.length > 0 ? `마무리 ${finishingDone} / ${finishing.length}` : '모든 단을 떴어요'}
                </>
              )
            ) : (
              <>
                <strong>{total}단</strong>까지 모두 뜬 것으로 입력했어요
              </>
            )
          ) : row ? (
            <>
              <strong>{work.row}단</strong> · {sideName(row.side)}, {sideFrom(row.side)} <span className={styles.recordInstr}>· {row.instr}</span>
            </>
          ) : null}
        </p>
        {dirty && (
          <button type="button" className={styles.resetBtn} onClick={onReset}>
            되돌리기
          </button>
        )}
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${uid}-row`} className={styles.fieldLabel}>
            단 <span className={styles.fieldOf}>/ {total}단</span>
          </label>
          <div className={styles.stepper}>
            <button type="button" className={styles.stepBtn} aria-label="단 번호 하나 내리기" disabled={pos.row <= 1 && pos.stitch <= 0} onClick={() => setRow(pos.row - 1)}>
              −
            </button>
            <NumberField id={`${uid}-row`} className={styles.num} value={pos.row} min={1} max={total} onCommit={setRow} />
            <button type="button" className={styles.stepBtn} aria-label="단 번호 하나 올리기" disabled={done} onClick={rowPlus}>
              +
            </button>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor={`${uid}-st`} className={styles.fieldLabel}>
            이 단에서 뜬 코 <span className={styles.fieldOf}>/ {n}코</span>
          </label>
          <div className={styles.stepper}>
            <button type="button" className={styles.stepBtn} aria-label="뜬 코 하나 줄이기" disabled={pos.stitch <= 0} onClick={() => setStitch(pos.stitch - 1)}>
              −
            </button>
            <NumberField id={`${uid}-st`} className={styles.num} value={pos.stitch} min={0} max={n} onCommit={setStitch} />
            <button type="button" className={styles.stepBtn} aria-label="뜬 코 하나 늘리기" disabled={pos.stitch >= n} onClick={() => setStitch(pos.stitch + 1)}>
              +
            </button>
          </div>
        </div>
      </div>

      <div className={styles.extra} id={`${uid}-extra`} data-open={extra}>
        <div className={styles.extraRow}>
          <label htmlFor={`${uid}-memo`} className={styles.fieldLabel}>
            메모
          </label>
          <input id={`${uid}-memo`} className={styles.text} type="text" value={memo} maxLength={140} placeholder="메모 (선택)" onChange={(e) => setMemo(e.target.value)} />
        </div>
        <div className={styles.extraRow}>
          <span className={styles.fieldLabel} id={`${uid}-when-l`}>
            기록 시각
          </span>
          {when === null ? (
            <span className={styles.whenNow}>
              지금
              <button type="button" className={styles.miniBtn} aria-label="기록 시각 바꾸기" onClick={() => setWhen(localInput(new Date()))}>
                바꾸기
              </button>
            </span>
          ) : (
            <span className={styles.whenNow}>
              <input className={styles.text} type="datetime-local" aria-labelledby={`${uid}-when-l`} value={when} max={localInput(new Date())} onChange={(e) => setWhen(e.target.value)} />
              <button type="button" className={styles.miniBtn} aria-label="지금 시각으로 기록" onClick={() => setWhen(null)}>
                지금
              </button>
            </span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {nextFinish ? (
          <button type="button" className={styles.primary} onClick={() => onFinish(finishingDone + 1)}>
            {nextFinish.name} 끝냈어요
          </button>
        ) : (
          <button type="button" className={styles.primary} disabled={done} aria-describedby={`${uid}-up`} onClick={onRowUp}>
            단 올리기
          </button>
        )}
        <button type="button" className={styles.secondary} data-strong={dirty || undefined} disabled={!dirty && memo.trim() === ''} onClick={save}>
          여기까지 떴어요
        </button>
        <button type="button" className={styles.extraToggle} aria-expanded={extra} aria-controls={`${uid}-extra`} aria-label="메모와 기록 시각" onClick={() => setExtra((v) => !v)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16z" />
            <path d="M13.500 6.500l4 4" />
          </svg>
        </button>
      </div>
      <p className="sr-only" id={`${uid}-up`}>
        지금 뜨던 단을 다 뜬 것으로 바로 기록하고 다음 단으로 넘어갑니다.
      </p>
    </section>
  )
}
