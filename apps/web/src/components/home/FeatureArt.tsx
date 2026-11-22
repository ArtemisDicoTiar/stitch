import { expand } from '@stitch/engine'
import { practiceHood } from '@stitch/fixtures'
import { STITCHES, type SymbolId } from '@stitch/pattern-ir'
import styles from './FeatureArt.module.css'

/**
 * 랜딩의 기능 카드에 들어가는 그림 두 장.
 * 구매한 도안의 그림 대신, 저장소의 직접 쓴 예시 도안(연습용 후드 워머)에서 바로 그립니다.
 */

const CELL = 24
const GUTTER = 30
const COLS = 30
const ROWS = 11
/** 예시로 보여 줄 지금 위치: 8단(안면)에서 11코까지 뜬 상태 */
const AT = { row: 8, stitch: 11 }
/** 예시 단수링: 단춧구멍 단의 바늘비우기 자리 */
const RING = { row: 9, x: 4 }

function Symbol({ s, cx, cy }: { s: SymbolId; cx: number; cy: number }) {
  const d = CELL * 0.27
  switch (s) {
    case 'P':
      return <path d={`M${cx - d} ${cy}h${d * 2}`} />
    case 'YO':
      return <circle cx={cx} cy={cy} r={d} />
    case 'K2TOG':
      return <path d={`M${cx - d} ${cy + d}L${cx + d} ${cy - d}`} />
    case 'SSK':
      return <path d={`M${cx - d} ${cy - d}L${cx + d} ${cy + d}`} />
    case 'SK2P':
      return <path d={`M${cx - d} ${cy + d}L${cx} ${cy - d}L${cx + d} ${cy + d}M${cx} ${cy - d}V${cy + d}`} />
    default:
      return null
  }
}

/** 예시 도안의 목 고무단 왼쪽 끝을 기호 도안으로 그립니다. 한 칸이 1코 1단입니다. */
export function MiniChart({ label }: { label: string }) {
  const block = expand(practiceHood).blocks[0]
  const rows = (block?.rows ?? []).filter((r) => r.g <= ROWS)
  const width = GUTTER + COLS * CELL + 1
  const height = ROWS * CELL + 1
  const yOf = (g: number) => (ROWS - g) * CELL
  const xOf = (x: number) => GUTTER + x * CELL
  const current = rows.find((r) => r.g === AT.row)?.cells.find((c) => c.k === AT.stitch)

  return (
    <svg className={styles.chart} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMinYMid slice" role="img" aria-label={label}>
      {rows.map((r) => (
        <g key={r.g}>
          <text className={styles.rowNo} x={GUTTER - 8} y={yOf(r.g) + CELL / 2 + 4} textAnchor="end">
            {r.g}
          </text>
          {r.cells
            .filter((c) => c.x < COLS)
            .map((c) => {
              const done = r.g < AT.row || (r.g === AT.row && c.k < AT.stitch)
              return (
                <g key={c.x}>
                  <rect className={done ? styles.cellDone : styles.cell} x={xOf(c.x)} y={yOf(r.g)} width={CELL} height={CELL} />
                  <g className={styles.symbol}>
                    <Symbol s={c.s} cx={xOf(c.x) + CELL / 2} cy={yOf(r.g) + CELL / 2} />
                  </g>
                </g>
              )
            })}
        </g>
      ))}
      {current && current.x < COLS && <rect className={styles.here} x={xOf(current.x) + 1.5} y={yOf(AT.row) + 1.5} width={CELL - 3} height={CELL - 3} rx="3" />}
      <circle className={styles.ring} cx={xOf(RING.x) + CELL / 2} cy={yOf(RING.row) + CELL / 2} r={CELL * 0.42} />
    </svg>
  )
}

/** 왼코 겹치기를 뜨는 순간의 바늘과 실. 코 이름은 코 사전에서 가져옵니다. */
export function StitchSketch({ label }: { label: string }) {
  const name = STITCHES.k2tog?.name.kr ?? '왼코 겹치기'
  const loops = [0, 1, 2, 3, 4, 5]
  // 왼바늘 위의 한 점 (t: 0 = 손잡이 쪽, 1 = 바늘 끝)
  const on = (t: number) => ({ x: 46 + (252 - 46) * t, y: 158 + (112 - 158) * t })
  return (
    <div className={styles.sketch} role="img" aria-label={label}>
      <svg viewBox="0 0 390 260" aria-hidden="true">
        {/* 왼바늘 */}
        <path className={styles.needle} d="M46 158L262 110" />
        <circle className={styles.knob} cx="40" cy="159.5" r="10" />
        {/* 바늘에 걸린 코 */}
        {loops.map((i) => {
          const p = on(0.3 + i * 0.115)
          const active = i >= 4
          return <ellipse key={i} className={active ? styles.loopActive : styles.loop} cx={p.x + 3} cy={p.y + 15} rx="9.5" ry="22" transform={`rotate(-12 ${p.x} ${p.y})`} />
        })}
        {/* 두 코에 한꺼번에 들어간 오른바늘 */}
        <path className={styles.needle} d="M338 222L206 96" />
        <circle className={styles.knob} cx="343" cy="227" r="10" />
        {/* 걸어 올 실 */}
        <path className={styles.yarn} d="M372 58C330 40 262 44 226 82C214 95 208 110 214 122" />
        {/* 바늘이 움직이는 방향 */}
        <path className={styles.arrow} d="M300 132C292 108 276 92 254 84" />
        <path className={styles.arrow} d="M266 80L254 84L260 96" />
      </svg>
      <span className={styles.stitchName}>{name}</span>
      <span className={styles.steps} aria-hidden="true">
        <i data-on="" />
        <i />
        <i />
      </span>
    </div>
  )
}
