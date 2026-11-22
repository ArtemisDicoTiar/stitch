'use client'

import { useId, useState, type ReactNode } from 'react'
import type { Craft, Op, Row, Side } from '@stitch/pattern-ir'
import { SIDE_KR, countText, rowDomId, type GroupInfo, type RowInfo } from './model'
import { NumberField } from './NumberField'
import { OpsEditor, OpsSummary } from './OpsEditor'
import styles from './Review.module.css'

type Props = {
  info: RowInfo
  group: GroupInfo
  craft: Craft
  /** 처음 읽은 내용에서 바뀌었는지 */
  changed: boolean
  onRow: (mutate: (row: Row) => void) => void
  onTimes: (times: number) => void
  onRevert: () => void
  /** 좁은 화면에서 이 자리에 놓는 원문 칸 */
  source: ReactNode
}

/** 고른 단 아래에 펼쳐지는 칸: 도안에 적힌 코 수, 뜨는 면, 반복 횟수, 뜨는 순서를 고칩니다. */
export function RowEditor({ info, group, craft, changed, onRow, onTimes, onRevert, source }: Props) {
  const uid = useId()
  const [opsOpen, setOpsOpen] = useState(false)
  const { row } = info
  const repeat = group.group.repeat
  const calc = countText(info)

  return (
    <div className={styles.editor} id={`${rowDomId(info.addr)}-editor`} role="group" aria-label="이 단 고치기">
      {info.issues.length > 0 && (
        <ul className={styles.rowIssues}>
          {info.issues.map((issue, i) => (
            <li key={i} data-level={issue.level}>
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {source}

      <div className={styles.fields}>
        <div className={styles.fieldBox}>
          <label htmlFor={`${uid}-expect`}>도안에 적힌 코 수</label>
          <span className={styles.fieldRow}>
            <NumberField
              id={`${uid}-expect`}
              allowEmpty
              placeholder="없음"
              value={row.expect_count}
              aria-describedby={`${uid}-calc`}
              onCommit={(n) =>
                onRow((r) => {
                  if (n === undefined) delete r.expect_count
                  else r.expect_count = n
                })
              }
            />
            코
          </span>
          <span id={`${uid}-calc`} className={styles.fieldHint}>
            {calc ? `계산한 코 수는 ${calc}예요. ` : ''}도안에 숫자가 없으면 비워 두세요.
          </span>
        </div>

        <div className={styles.fieldBox}>
          <label htmlFor={`${uid}-side`}>뜨는 면</label>
          <select id={`${uid}-side`} className={styles.select} value={row.side} onChange={(e) => onRow((r) => void (r.side = e.target.value as Side))}>
            {(Object.keys(SIDE_KR) as Side[]).map((s) => (
              <option key={s} value={s}>
                {SIDE_KR[s]}
              </option>
            ))}
          </select>
        </div>

        {'times' in repeat && (
          <div className={styles.fieldBox}>
            <label htmlFor={`${uid}-times`}>{group.rows.length > 1 ? `이 ${group.rows.length}단 묶음을 뜨는 횟수` : '이 단을 뜨는 횟수'}</label>
            <span className={styles.fieldRow}>
              <NumberField id={`${uid}-times`} min={1} max={999} value={repeat.times} onCommit={(n) => n !== undefined && onTimes(n)} />번
            </span>
          </div>
        )}
      </div>

      <div className={styles.opsBox}>
        <div className={styles.opsHead}>
          <h4 className={styles.opsTitle}>읽은 뜨는 순서</h4>
          <button type="button" className={styles.linkBtn} aria-expanded={opsOpen} onClick={() => setOpsOpen((o) => !o)}>
            {opsOpen ? '고치기 닫기' : '뜨는 순서 고치기'}
          </button>
        </div>
        <OpsSummary ops={row.ops} />
        {opsOpen && <OpsEditor ops={row.ops} craft={craft} change={(mutate: (ops: Op[]) => void) => onRow((r) => mutate(r.ops))} />}
      </div>

      {changed && (
        <div>
          <button type="button" className="btn" onClick={onRevert}>
            처음 읽은 대로 되돌리기
          </button>
        </div>
      )}
    </div>
  )
}
