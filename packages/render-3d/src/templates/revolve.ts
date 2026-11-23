/**
 * 둥글게 뜬 조각들 (공, 인형, 원판, 바구니).
 *
 * 조각 하나는 회전체로 그립니다. 단을 뜬 뒤의 코 수가 그 높이에서의 둘레를 정합니다.
 *   반지름 = 코 수 × 코 폭 ÷ 2π
 * 단 하나는 옆선을 따라 단 높이만큼 나아갑니다. 반지름이 그만큼 늘면 평평하게 퍼지고(원판),
 * 그대로면 곧게 올라가고(원통), 줄면 안쪽으로 닫힙니다.
 *
 * 열린 조각(받침, 바구니, 팔처럼 한쪽이 트인 것)은 그렇게 구한 옆선의 모서리만 조금 둥글립니다.
 * 곧은 선(평평한 원판, 곧은 원통)은 둥글려도 그대로입니다.
 *
 * 위에서 다시 오므려 닫는 조각(공, 머리, 몸통)은 솜을 채웁니다. 편물만 놓고 보면 위아래가 평평한 북 모양이지만,
 * 솜을 넣으면 옆선의 길이는 그대로인 채 바깥으로 밀려 둥글어집니다. 이 모양은 옆선을 바깥으로 조금씩 밀면서
 * "단 높이는 그대로, 둘레는 코 수가 허락하는 만큼까지"를 지키게 하는 것을 되풀이해 구합니다.
 *
 * 조각이 여럿이면(머리, 몸, 팔) 조립하지 않고 나란히 놓습니다.
 * 왕복으로 뜬 조각이 섞여 있으면 그 조각은 평면으로 펼쳐 놓습니다.
 */
import type { GaugeSize } from '@stitch/pattern-ir'
import type { Vec3 } from '../mannequin-dims'
import { planFlat } from './flat'
import { rowFactors, type PieceDetails, type RowInfo, type TemplatePlan } from './types'

type PiecePlan = {
  corner(local: number, c: number, top: boolean, pos: Vec3, nrm: Vec3): void
  /** 조각의 가로 폭과 높이 (cm). 조각의 가운데가 x = 0, 바닥이 y = 0 입니다. */
  width: number
  height: number
  kind: PieceDetails['kind']
  maxRadius?: number
}

const TAU = Math.PI * 2
/** 옆선의 모서리를 둥글리는 횟수와 세기 */
const SMOOTH_PASSES = 3
const SMOOTH = 0.5
/** 끝의 코 수가 가장 넓은 곳의 이 비율 아래로 줄면 "오므려 닫는 조각"으로 보고 솜을 채웁니다. */
const CLOSES_BELOW = 0.6
/** 솜 채우기: 되풀이 횟수, 한 번에 미는 거리(단 높이에 대한 비율), 길이 맞추기 횟수 */
const INFLATE_STEPS = 260
const INFLATE_PUSH = 0.03
const INFLATE_RELAX = 6

export function planRevolve(rows: RowInfo[], sw: number, rh: number): PiecePlan {
  const m = rows.length
  const factor = rowFactors(rows)
  // 단 경계 0..m 에서의 반지름과 높이
  const R = new Float64Array(m + 1)
  const Y = new Float64Array(m + 1)
  const radiusOf = (count: number) => (Math.max(1, count) * sw) / TAU
  if (m > 0) {
    const first = radiusOf(rows[0].row.count)
    // 매직링은 한 점에서 시작합니다. 그 밖에는 처음부터 그 둘레의 원통입니다.
    R[0] = rows[0].row.opens === 'ring' ? Math.min(first, sw * 0.12) : first
  }
  /** 단마다 옆선을 따라 나아가는 길이 */
  const along = Float64Array.from(factor, (f) => rh * f)
  for (let i = 0; i < m; i++) R[i + 1] = radiusOf(rows[i].row.count)
  // 매직링에 뜬 첫 단은 링을 조이면 납작하게 눕습니다. 단 높이만큼 서 있다고 보면 끝이 뾰족해집니다.
  if (m > 0 && rows[0].row.opens === 'ring') along[0] = Math.min(along[0], Math.max(sw * 0.05, R[1] - R[0]))
  for (let i = 0; i < m; i++) {
    const dR = R[i + 1] - R[i]
    Y[i + 1] = Y[i] + Math.sqrt(Math.max(0, along[i] * along[i] - dR * dR))
  }
  let maxR = 0
  for (let j = 0; j <= m; j++) maxR = Math.max(maxR, R[j])

  const closes = m >= 3 && R[m] < maxR * CLOSES_BELOW
  if (closes) {
    inflate(R, Y, along)
  } else {
    // 모서리 둥글리기. 양 끝은 그대로 둡니다.
    for (let pass = 0; pass < SMOOTH_PASSES && m >= 2; pass++) {
      const r0 = Float64Array.from(R)
      const y0 = Float64Array.from(Y)
      for (let j = 1; j < m; j++) {
        R[j] = r0[j] + SMOOTH * ((r0[j - 1] + r0[j + 1]) / 2 - r0[j])
        Y[j] = y0[j] + SMOOTH * ((y0[j - 1] + y0[j + 1]) / 2 - y0[j])
      }
    }
  }
  // 가장 넓은 곳의 둘레가 코 수와 맞도록 맞춥니다. 솜을 채운 조각은 모양이 찌그러지지 않게 높이도 같은 비율로 늘립니다
  // (솜이 편물을 당겨 단이 조금 길어지는 것과 같습니다).
  let shapedMax = 0
  for (let j = 0; j <= m; j++) shapedMax = Math.max(shapedMax, R[j])
  if (shapedMax > 1e-9) {
    const k = maxR / shapedMax
    for (let j = 0; j <= m; j++) {
      R[j] *= k
      if (closes) Y[j] *= k
    }
  }
  // 바닥을 y = 0 에 놓습니다.
  let minY = Infinity
  for (let j = 0; j <= m; j++) minY = Math.min(minY, Y[j])
  if (Number.isFinite(minY)) for (let j = 0; j <= m; j++) Y[j] -= minY

  // 단마다의 바깥쪽 법선 (옆선에 수직), 그리고 경계마다 이웃한 두 단의 평균
  const nr = new Float64Array(m)
  const ny = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const dR = R[i + 1] - R[i]
    const dY = Y[i + 1] - Y[i]
    const len = Math.hypot(dR, dY)
    nr[i] = len > 1e-9 ? dY / len : 1
    ny[i] = len > 1e-9 ? -dR / len : 0
  }
  const bnr = new Float64Array(m + 1)
  const bny = new Float64Array(m + 1)
  for (let j = 0; j <= m; j++) {
    const a = Math.max(0, j - 1)
    const b = Math.min(m - 1, j)
    let x = (nr[a] ?? 1) + (nr[b] ?? 1)
    let y = (ny[a] ?? 0) + (ny[b] ?? 0)
    const len = Math.hypot(x, y)
    if (len > 1e-9) {
      x /= len
      y /= len
    } else {
      x = 1
      y = 0
    }
    bnr[j] = x
    bny[j] = y
  }

  return {
    corner(local, c, top, pos, nrm) {
      const n = Math.max(1, rows[local].n)
      const j = local + (top ? 1 : 0)
      // 단의 시작(이음 자리)을 뒤쪽에 둡니다. 겉이 바깥을 보도록 각이 커지는 쪽으로 돕니다.
      const a = -Math.PI / 2 + (TAU * c) / n
      const cos = Math.cos(a)
      const sin = Math.sin(a)
      pos[0] = R[j] * cos
      pos[1] = Y[j]
      pos[2] = R[j] * sin
      nrm[0] = bnr[j] * cos
      nrm[1] = bny[j]
      nrm[2] = bnr[j] * sin
    },
    width: maxR * 2,
    height: Math.max(0, ...Y),
    kind: 'round',
    maxRadius: maxR,
  }
}

/**
 * 솜 채우기. 옆선의 점 (R, Y)를 바깥으로 밀어 둥글게 만듭니다. 들어온 값을 그 자리에서 고칩니다.
 * - 옆선의 마디 길이(along)는 그대로 지킵니다: 단 높이는 늘거나 줄지 않습니다.
 * - 반지름은 들어온 값(코 수가 정한 둘레)을 넘지 못합니다. 더 작아질 수는 있습니다 (편물이 오므라듦).
 * - 양 끝은 축 위에 그대로 둡니다 (높이만 움직입니다).
 */
function inflate(R: Float64Array, Y: Float64Array, along: Float64Array): void {
  const m = along.length
  const cap = Float64Array.from(R)
  let rh = 0
  for (const a of along) rh += a
  rh /= Math.max(1, m)
  const push = rh * INFLATE_PUSH
  const clamp = (j: number) => {
    if (j === 0 || j === m) R[j] = cap[j]
    else R[j] = Math.min(cap[j], Math.max(0, R[j]))
  }
  for (let step = 0; step < INFLATE_STEPS; step++) {
    // 바깥으로 밀기: 이웃 두 점을 잇는 선에 수직인 쪽
    const r0 = Float64Array.from(R)
    const y0 = Float64Array.from(Y)
    // 양 끝은 직접 밀지 않습니다. 이웃한 점이 끌고 갑니다. (끝을 밀면 뾰족하게 솟습니다.)
    for (let j = 1; j < m; j++) {
      const tr = r0[j + 1] - r0[j - 1]
      const ty = y0[j + 1] - y0[j - 1]
      const len = Math.hypot(tr, ty)
      if (len < 1e-12) continue
      R[j] += (push * ty) / len
      Y[j] += (push * -tr) / len
      clamp(j)
    }
    // 마디 길이 맞추기
    for (let relax = 0; relax < INFLATE_RELAX; relax++) {
      for (let i = 0; i < m; i++) {
        const dr = R[i + 1] - R[i]
        const dy = Y[i + 1] - Y[i]
        const d = Math.hypot(dr, dy)
        if (d < 1e-12) continue
        const diff = (d - along[i]) / d
        R[i] += dr * diff * 0.5
        Y[i] += dy * diff * 0.5
        R[i + 1] -= dr * diff * 0.5
        Y[i + 1] -= dy * diff * 0.5
        clamp(i)
        clamp(i + 1)
      }
    }
  }
}

function planFlatPiece(rows: RowInfo[], gauge: GaugeSize): PiecePlan {
  // 평면 템플릿은 넘겨받은 순서를 단 번호로 씁니다.
  const local = rows.map((r, i) => ({ ...r, index: i }))
  const flat = planFlat(local, gauge)
  const d = flat.details
  return {
    corner: (li, c, top, pos, nrm) => flat.corner(li, c, top, pos, nrm),
    width: d.template === 'flat' ? d.width : 0,
    height: d.template === 'flat' ? d.height : 0,
    kind: 'flat',
  }
}

/** 조각마다 그려서 왼쪽부터 나란히 놓습니다. */
export function planPieces(rows: RowInfo[], gauge: GaugeSize): TemplatePlan {
  const sw = 10 / gauge.stitches
  const rh = 10 / gauge.rows

  // 조각으로 나누기: 단에 적힌 조각 번호가 바뀌는 곳
  const groups: RowInfo[][] = []
  let last = -1
  for (const r of rows) {
    const id = r.row.piece ?? 0
    if (groups.length === 0 || id !== last) groups.push([])
    groups[groups.length - 1].push(r)
    last = id
  }

  const plans = groups.map((g) => (g.every((r) => r.row.side === 'round') ? planRevolve(g, sw, rh) : planFlatPiece(g, gauge)))
  const widest = Math.max(0, ...plans.map((p) => p.width))
  const gap = Math.max(1, widest * 0.25)
  const total = plans.reduce((w, p) => w + p.width, 0) + gap * Math.max(0, plans.length - 1)

  // 단 번호 → (조각, 조각 안에서의 순서)
  const pieceOf = new Int32Array(rows.length)
  const localOf = new Int32Array(rows.length)
  const offset: number[] = []
  let x = -total / 2
  groups.forEach((g, pi) => {
    offset.push(x + plans[pi].width / 2)
    x += plans[pi].width + gap
    g.forEach((r, li) => {
      pieceOf[r.index] = pi
      localOf[r.index] = li
    })
  })

  const pieces: PieceDetails[] = groups.map((g, pi) => ({
    kind: plans[pi].kind,
    firstRow: g[0].row.g,
    lastRow: g[g.length - 1].row.g,
    section: g[0].row.section,
    x: offset[pi],
    width: plans[pi].width,
    height: plans[pi].height,
    ...(plans[pi].maxRadius !== undefined ? { maxRadius: plans[pi].maxRadius } : {}),
  }))

  return {
    corner(ri, c, top, pos, nrm) {
      const pi = pieceOf[ri]
      plans[pi].corner(localOf[ri], c, top, pos, nrm)
      pos[0] += offset[pi]
    },
    mannequin: null,
    details: { template: 'round', stitchWidth: sw, rowHeight: rh, pieces, width: total, height: Math.max(0, ...plans.map((p) => p.height)) },
  }
}
