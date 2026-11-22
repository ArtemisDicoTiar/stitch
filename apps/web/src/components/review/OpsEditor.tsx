'use client'

import { describeOp } from '@stitch/engine'
import { getStitch, stitchesFor, type Craft, type Op } from '@stitch/pattern-ir'
import { END_KINDS, addOp, endOf, isRepeat, moveOp, newMarker, newRepeat, newStitch, removeOp, setOp, withEnd, type EndKind, type OpPath } from './edit'
import { NumberField } from './NumberField'
import styles from './Review.module.css'

type Change = (mutate: (ops: Op[]) => void) => void

const MARKERS = [
  { id: 'place', name: '마커 걸기' },
  { id: 'slip', name: '마커 넘기기' },
  { id: 'remove', name: '마커 빼기' },
] as const
const UNKNOWN = '__unknown'
/** 읽기 형식(packages/reader의 wire)과 같이 반복은 세 겹까지만 만듭니다. */
const MAX_DEPTH = 3

const Icon = ({ d }: { d: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)

function Tools({ name, path, count, change }: { name: string; path: OpPath; count: number; change: Change }) {
  const i = path[path.length - 1]
  return (
    <span className={styles.opTools}>
      <button type="button" className={styles.iconBtn} aria-label={`${name} 앞으로 옮기기`} disabled={i === 0} onClick={() => change((ops) => moveOp(ops, path, -1))}>
        <Icon d="M12 19V5M6 11l6-6 6 6" />
      </button>
      <button type="button" className={styles.iconBtn} aria-label={`${name} 뒤로 옮기기`} disabled={i === count - 1} onClick={() => change((ops) => moveOp(ops, path, 1))}>
        <Icon d="M12 5v14M6 13l6 6 6-6" />
      </button>
      <button type="button" className={styles.iconBtn} data-danger aria-label={`${name} 지우기`} onClick={() => change((ops) => removeOp(ops, path))}>
        <Icon d="M6 6l12 12M18 6L6 18" />
      </button>
    </span>
  )
}

function OpItem({ op, path, count, craft, change }: { op: Op; path: OpPath; count: number; craft: Craft; change: Change }) {
  const no = path.map((i) => i + 1).join('-')
  const name = `${no}번 조각`

  if ('st' in op) {
    const def = getStitch(op.st)
    const known = def?.id ?? null
    const listed = stitchesFor(craft)
    const options = def && !listed.includes(def) ? [...listed, def] : listed
    return (
      <div className={styles.op}>
        <span className={styles.opNo} aria-hidden="true">
          {no}
        </span>
        <select
          className={styles.select}
          aria-label={`${name} 코 종류`}
          aria-invalid={known ? undefined : true}
          value={known ?? UNKNOWN}
          onChange={(e) => e.target.value !== UNKNOWN && change((ops) => setOp(ops, path, { ...op, st: e.target.value }))}
        >
          {!known && <option value={UNKNOWN}>모르는 코: {op.st}</option>}
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name.kr} ({s.id})
            </option>
          ))}
        </select>
        <span className={styles.opUnit}>
          <NumberField aria-label={`${name} 횟수`} value={op.n} min={1} max={999} onCommit={(n) => n !== undefined && change((ops) => setOp(ops, path, { ...op, n }))} />번
        </span>
        <Tools name={name} path={path} count={count} change={change} />
      </div>
    )
  }

  if ('marker' in op) {
    return (
      <div className={styles.op}>
        <span className={styles.opNo} aria-hidden="true">
          {no}
        </span>
        <select className={styles.select} aria-label={`${name} 마커`} value={op.marker} onChange={(e) => change((ops) => setOp(ops, path, { marker: e.target.value as (typeof MARKERS)[number]['id'] }))}>
          {MARKERS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <Tools name={name} path={path} count={count} change={change} />
      </div>
    )
  }

  const end = endOf(op)
  const kind = END_KINDS.find((k) => k.id === end.kind)!
  return (
    <div className={styles.rep}>
      <div className={styles.op}>
        <span className={styles.opNo} aria-hidden="true">
          {no}
        </span>
        <span className={styles.repWord}>반복</span>
        <select
          className={styles.select}
          aria-label={`${name} 반복을 끝내는 자리`}
          value={end.kind}
          onChange={(e) => change((ops) => setOp(ops, path, withEnd(op, e.target.value as EndKind, end.n)))}
        >
          {END_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
        {kind.unit && (
          <span className={styles.opUnit}>
            <NumberField
              aria-label={`${name} ${kind.name}`}
              value={end.n}
              min={end.kind === 'times' ? 1 : 0}
              max={999}
              onCommit={(n) => n !== undefined && change((ops) => setOp(ops, path, withEnd(op, end.kind, n)))}
            />
            {kind.unit}
          </span>
        )}
        <Tools name={name} path={path} count={count} change={change} />
      </div>
      <OpList ops={op.repeat} parent={path} craft={craft} change={change} />
    </div>
  )
}

function OpList({ ops, parent, craft, change }: { ops: Op[]; parent: OpPath; craft: Craft; change: Change }) {
  const inside = parent.length > 0
  const where = inside ? `${parent.map((i) => i + 1).join('-')}번 반복 안에 ` : ''
  return (
    <div className={inside ? styles.opNest : undefined}>
      {ops.length > 0 && (
        <ol className={styles.ops}>
          {ops.map((op, i) => (
            <li key={i}>
              <OpItem op={op} path={[...parent, i]} count={ops.length} craft={craft} change={change} />
            </li>
          ))}
        </ol>
      )}
      <div className={styles.opAdd}>
        <button type="button" className={styles.addBtn} aria-label={`${where}코 추가`} onClick={() => change((list) => addOp(list, parent, newStitch(craft)))}>
          + 코
        </button>
        {parent.length < MAX_DEPTH - 1 && (
          <button type="button" className={styles.addBtn} aria-label={`${where}반복 추가`} onClick={() => change((list) => addOp(list, parent, newRepeat(craft)))}>
            + 반복
          </button>
        )}
        <button type="button" className={styles.addBtn} aria-label={`${where}마커 추가`} onClick={() => change((list) => addOp(list, parent, newMarker()))}>
          + 마커
        </button>
      </div>
    </div>
  )
}

/** 한 단의 뜨는 순서를 고치는 목록. 코 종류, 횟수, 반복을 끝내는 자리를 고르고 조각을 더하거나 뺍니다. */
export function OpsEditor({ ops, craft, change }: { ops: Op[]; craft: Craft; change: Change }) {
  return <OpList ops={ops} parent={[]} craft={craft} change={change} />
}

/** 읽은 뜨는 순서를 엔진이 이해한 대로 한 줄로 보여 줍니다. */
export function OpsSummary({ ops }: { ops: Op[] }) {
  if (ops.length === 0) return <p className={styles.opsEmpty}>읽은 조각이 없어요.</p>
  return (
    <ol className={styles.chips}>
      {ops.map((op, i) => (
        <li key={i} className={styles.opChip} data-unknown={'st' in op && !getStitch(op.st) ? true : undefined}>
          {describeOp(op)}
        </li>
      ))}
    </ol>
  )
}
