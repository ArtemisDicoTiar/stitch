/**
 * 후드(바라클라바) 템플릿.
 *
 * 평면으로 뜬 편물을 이렇게 입힙니다.
 *  - 앞쪽 구간(목): 목을 감싸는 원통. 양 끝이 앞에서 조금 겹칩니다 (단추 여밈).
 *  - 나머지 구간(머리): 가운데 코가 뒤통수, 양 끝이 얼굴 가장자리, 마지막 단이 정수리 솔기가 되도록
 *    머리를 감싸는 타원체 위에 놓습니다.
 *
 * 크기는 모두 Expanded와 게이지에서 나옵니다.
 *  - 목의 높이 = 목 단수 × 단 높이, 목의 둘레 = 목 코 수 × 코 폭 × 고무단이 조이는 정도
 *  - 머리 타원체의 가로·앞뒤 = 머리 편물의 보이는 폭(코 수 × 코 폭)에 비례
 *  - 머리 타원체의 세로 = 머리 편물의 길이(단수 × 단 높이)에 비례
 * 마네킹은 이 편물이 맞는 크기로 배율을 맞춥니다.
 */
import type { Expanded, GaugeSize } from '@stitch/pattern-ir'
import { MANNEQUIN, fitMannequin, type Vec3 } from '../mannequin-dims'
import { clamp, lerp, smooth, type GarmentOptions, type RowInfo, type TemplatePlan } from './types'

// ---- 형태를 정하는 각도 (rad). 길이가 아니어서 크기와 상관없습니다. ----
/** 머리 아래쪽에서 얼굴 가장자리가 뒤통수 가운데로부터 돌아간 각 */
const AZ_BOTTOM = 2.93
/** 그 자리의 높이 (적도 아래) */
const EL_BOTTOM = -0.98
/** 머리 가운데 높이에서 얼굴 가장자리가 돌아간 각 */
const AZ_MID = 2.02
/** 정수리 솔기가 뒤에서 시작하는 각과 앞에서 끝나는 각 */
const SEAM_BACK = 1.12
const SEAM_FRONT = 0.5
/** 목 앞에서 양 끝이 겹치는 각 */
const OVERLAP = 0.4
/** 머리 부분이 목 원통에서 타원체로 넘어가는 구간 (머리 길이에 대한 비율) */
const BLEND = 0.24
/** 그 구간에서 원통이 벌어지는 기울기 */
const FLARE = 0.3

// ---- 배율 1인 마네킹에 맞는 치수 (cm) ----
/** 머리를 감싸는 타원체: 턱선에서 중심까지의 높이, 중심의 z, 반지름 */
const SHELL_RISE = 12.4
const SHELL_Z = 0.2
const SHELL_RADIUS: Vec3 = [10.3, 12.6, 11.6]
/** 그 머리를 감싸는 데 드는 편물: 얼굴 가장자리에서 뒤통수를 돌아 반대쪽까지의 폭, 목 위에서 정수리 솔기까지의 길이 */
const HEAD_WRAP_CM = 50
const HEAD_RISE_CM = 34.6
/** 편물이 목을 파고들지 않게 하는 가장 작은 반지름 (아래, 위) */
const NECK_MIN: [number, number] = [5.9, 5.6]
/** 목 편물이 어깨에 닿지 않는 가장 긴 길이 */
const NECK_MAX_LEN = 11.8
/** 고무단이 조여 드는 정도 (편 폭에 대한 비율) */
const RIB_EASE = 0.79
/** 겹친 끝이 뜨는 높이, 접힌 단의 두께 */
const LIFT = 0.45
const THICK = 0.5

/** 마네킹 배율과 편물 비율의 범위 */
const SCALE_MIN = 0.6
const SCALE_MAX = 1.6
const MAX_LOOSE = 1.5

const EU = 1e-3

type Fold = { xr: number; xl: number }

/**
 * 접는 선 찾기. 머리 구간 내내 양쪽 가장자리에서 같은 거리에 안뜨기 세로줄이 하나씩 있고
 * 그 바깥이 모두 겉뜨기면, 그 줄을 접는 선으로 봅니다.
 */
function detectFold(rows: RowInfo[], W: number): Fold | null {
  const alive = new Uint32Array(W)
  const purl = new Uint32Array(W)
  let counted = 0
  for (const r of rows) {
    if (r.n === 0 || r.row.cells.every((c) => c.s === 'BO')) continue
    counted += 1
    for (const c of r.row.cells) {
      if (c.x < 0 || c.x >= W) continue
      alive[c.x] += 1
      if (c.s === 'P') purl[c.x] += 1
    }
  }
  if (counted < 4) return null
  const isPurl = (x: number) => alive[x] >= counted * 0.6 && purl[x] >= alive[x] * 0.9
  const isPlain = (x: number) => alive[x] === 0 || purl[x] <= alive[x] * 0.1
  const maxH = Math.min(16, Math.floor(W * 0.2))
  for (let h = 3; h <= maxH; h++) {
    const xr = W - 1 - h
    const xl = h
    if (xr - xl < 4) break
    if (!isPurl(xr) || !isPurl(xl)) continue
    let ok = isPlain(xr - 1) && isPlain(xl + 1)
    for (let x = xr + 1; ok && x < W; x++) ok = isPlain(x)
    for (let x = 0; ok && x < xl; x++) ok = isPlain(x)
    if (ok) return { xr, xl }
  }
  return null
}

type PlanRow = { neck: boolean; n: number; v0: number; v1: number; a: number; b: number }

export function planHood(rows: RowInfo[], expanded: Expanded, gauge: GaugeSize, opts: GarmentOptions): TemplatePlan {
  const sw = 10 / gauge.stitches
  const rh = 10 / gauge.rows
  const nSec = expanded.sections.length
  const neckSections = clamp(Math.round(opts.neckSections ?? (nSec >= 2 ? 1 : 0)), 0, Math.max(0, nSec - 1))
  const isNeck = (r: RowInfo) => r.section >= 0 && r.section < neckSections
  const neckRows = rows.filter(isNeck)
  const bodyRows = rows.filter((r) => !isNeck(r))

  // ---- 얼굴 가장자리의 접는 단 ----
  const hemOpt = opts.faceHem ?? 'auto'
  const folds = new Map<number, Fold>()
  if (hemOpt === 'auto') {
    const byBlock = new Map<number, RowInfo[]>()
    for (const r of bodyRows) {
      const list = byBlock.get(r.block)
      if (list) list.push(r)
      else byBlock.set(r.block, [r])
    }
    for (const [block, list] of byBlock) {
      const f = detectFold(list, list[0].blockW)
      if (f) folds.set(block, f)
    }
  }
  const fixedHem = typeof hemOpt === 'number' && hemOpt > 0 ? Math.floor(hemOpt) : 0
  let hemRight = 0
  let hemLeft = 0
  const edges = (r: RowInfo): [number, number] => {
    const n = r.n
    let a = 0
    let b = n
    const f = folds.get(r.block)
    if (f) {
      let right = 0
      let left = 0
      let foldR = false
      let foldL = false
      for (const c of r.row.cells) {
        if (c.x > f.xr) right += 1
        else if (c.x === f.xr) foldR = true
        if (c.x < f.xl) left += 1
        else if (c.x === f.xl) foldL = true
      }
      a = right + (foldR ? 0.5 : 0)
      b = n - left - (foldL ? 0.5 : 0)
      if (b - a >= Math.max(2, n * 0.4)) {
        hemRight = Math.max(hemRight, right)
        hemLeft = Math.max(hemLeft, left)
      }
    } else if (fixedHem > 0 && n >= 2 * fixedHem + 4) {
      a = fixedHem + 0.5
      b = n - fixedHem - 0.5
      hemRight = hemLeft = fixedHem
    }
    return b - a >= Math.max(2, n * 0.4) ? [a, b] : [0, n]
  }

  // ---- 단마다의 높이와 접는 자리 ----
  const scaleOf = (wrap: number, rise: number) => clamp(Math.min(wrap / HEAD_WRAP_CM, rise / HEAD_RISE_CM), SCALE_MIN, SCALE_MAX)
  const bodyEdges = new Map<RowInfo, [number, number]>()
  let spanMax = 0
  for (const r of bodyRows) {
    const e = edges(r)
    bodyEdges.set(r, e)
    spanMax = Math.max(spanMax, e[1] - e[0])
  }
  const hasBody = bodyRows.length > 0 && spanMax > 0
  const wrapWidth = hasBody ? spanMax * sw : HEAD_WRAP_CM
  const bodyLength = hasBody ? bodyRows.length * rh : HEAD_RISE_CM
  const s = scaleOf(wrapWidth, bodyLength)
  // 편물이 머리보다 작게 그려지지 않게 하고, 한쪽으로만 지나치게 커지지 않게 합니다.
  const sx = clamp(wrapWidth / HEAD_WRAP_CM, s, s * MAX_LOOSE)
  const sy = clamp(bodyLength / HEAD_RISE_CM, s, s * MAX_LOOSE)

  const neckLen = neckRows.length * rh
  const vRib = Math.min(neckLen, NECK_MAX_LEN * s)
  const rhNeck = neckRows.length > 0 ? vRib / neckRows.length : 0
  const headLen = Math.max(bodyRows.length * rh, 1e-6)

  const ribRadius = (n: number) => (n * sw * RIB_EASE) / (2 * Math.PI + 2 * OVERLAP)
  const firstCount = (list: RowInfo[]) => list.find((r) => r.n > 0)?.n ?? 0
  const lastCount = (list: RowInfo[]) => {
    for (let i = list.length - 1; i >= 0; i--) if (list[i].n > 0) return list[i].n
    return 0
  }
  const topCount = neckRows.length > 0 ? lastCount(neckRows) : firstCount(bodyRows)
  const rTop = Math.max(ribRadius(topCount), NECK_MIN[1] * s)
  const rBottom = neckRows.length > 0 ? Math.max(ribRadius(firstCount(neckRows)), NECK_MIN[0] * s) : rTop

  const center: Vec3 = [0, vRib + SHELL_RISE * sy, SHELL_Z * sx]
  const radius: Vec3 = [SHELL_RADIUS[0] * sx, SHELL_RADIUS[1] * sy, SHELL_RADIUS[2] * sx]
  const zOff = MANNEQUIN.neckZ * s
  const lift = LIFT * s
  const thick = THICK * s

  const prow: PlanRow[] = []
  {
    let iNeck = 0
    let iBody = 0
    for (const r of rows) {
      if (isNeck(r)) {
        prow.push({ neck: true, n: r.n, v0: iNeck * rhNeck, v1: (iNeck + 1) * rhNeck, a: 0, b: r.n })
        iNeck += 1
      } else {
        const [a, b] = bodyEdges.get(r) ?? [0, r.n]
        prow.push({ neck: false, n: r.n, v0: vRib + iBody * rh, v1: vRib + (iBody + 1) * rh, a, b })
        iBody += 1
      }
    }
  }

  // ---- 곡면 ----
  const d0: Vec3 = [0, 0, 0]
  const d1: Vec3 = [0, 0, 0]
  const hd: Vec3 = [0, 0, 0]
  const dirAz = (az: number, el: number, o: Vec3) => {
    const ce = Math.cos(el)
    o[0] = ce * Math.sin(az)
    o[1] = Math.sin(el)
    o[2] = -ce * Math.cos(az)
  }
  /** s: 뒤통수 가운데(0)에서 얼굴 가장자리(1)까지, t: 목 위(0)에서 정수리 솔기(1)까지. 머리 중심에서 본 방향을 줍니다. */
  const headDir = (ss: number, t: number, o: Vec3) => {
    dirAz(ss * AZ_BOTTOM, EL_BOTTOM, d0)
    dirAz(ss * AZ_MID, lerp(0.12, 0.02, ss), d1)
    const g = lerp(SEAM_BACK, Math.PI - SEAM_FRONT, ss)
    const d2y = Math.sin(g)
    const d2z = -Math.cos(g)
    // 가운데(t = 0.5)에서 d1을 지나는 이차 곡선
    const cx = 2 * d1[0] - 0.5 * d0[0]
    const cy = 2 * d1[1] - 0.5 * d0[1] - 0.5 * d2y
    const cz = 2 * d1[2] - 0.5 * d0[2] - 0.5 * d2z
    const a = (1 - t) * (1 - t)
    const b = 2 * t * (1 - t)
    const c = t * t
    const x = a * d0[0] + b * cx
    const y = a * d0[1] + b * cy + c * d2y
    const z = a * d0[2] + b * cz + c * d2z
    const len = Math.hypot(x, y, z) || 1
    o[0] = x / len
    o[1] = y / len
    o[2] = z / len
  }
  /** u: 단에서의 자리 (-1 = 도안 오른쪽 끝, 0 = 가운데, 1 = 왼쪽 끝), v: 높이(cm), inner: 안으로 접힌 단 */
  const place = (u: number, v: number, inner: boolean, o: Vec3) => {
    const au = Math.abs(u)
    const ss = Math.min(au, 1)
    const side = u >= 0 ? 1 : -1
    if (v <= vRib + 1e-6) {
      const a = au * (Math.PI + OVERLAP)
      let r = vRib > 0 ? lerp(rBottom, rTop, clamp(v / vRib, 0, 1)) : rTop
      if (side > 0) r += lift * smooth(0.8, 0.93, au)
      o[0] = side * r * Math.sin(a)
      o[1] = v
      o[2] = -r * Math.cos(a) + zOff
      return
    }
    const t = (v - vRib) / headLen
    headDir(ss, t, hd)
    hd[0] *= side
    let x = center[0] + hd[0] * radius[0]
    let y = center[1] + hd[1] * radius[1]
    let z = center[2] + hd[2] * radius[2]
    const w = smooth(0, BLEND, t)
    if (w < 1) {
      const a = ss * Math.PI * 1.01
      const r = rTop + (v - vRib) * FLARE
      x = lerp(side * r * Math.sin(a), x, w)
      y = lerp(v, y, w)
      z = lerp(-r * Math.cos(a) + zOff, z, w)
    }
    if (inner) {
      // 접힌 단은 편물 두께만큼 안쪽에 놓습니다.
      let nx = x
      let nz = z - zOff
      const l0 = Math.hypot(nx, nz) || 1
      nx /= l0
      nz /= l0
      let mx = lerp(nx, hd[0], w)
      let my = lerp(0, hd[1], w)
      let mz = lerp(nz, hd[2], w)
      const l1 = Math.hypot(mx, my, mz) || 1
      mx /= l1
      my /= l1
      mz /= l1
      x -= mx * thick
      y -= my * thick
      z -= mz * thick
    }
    o[0] = x
    o[1] = y
    o[2] = z
  }

  const pa: Vec3 = [0, 0, 0]
  const pb: Vec3 = [0, 0, 0]
  const pc: Vec3 = [0, 0, 0]
  const pd: Vec3 = [0, 0, 0]

  return {
    corner(ri, c, top, pos, nrm) {
      const r = prow[ri]
      let u = 0
      let inner = false
      if (r.n > 0) {
        const span = r.b - r.a
        if (c < r.a) {
          u = -1 + ((r.a - c) * 2) / span
          inner = true
        } else if (c > r.b) {
          u = 1 - ((c - r.b) * 2) / span
          inner = true
        } else u = -1 + ((c - r.a) * 2) / span
      }
      const v = top ? r.v1 : r.v0
      place(u, v, inner, pos)
      // 법선 = (단의 위쪽 방향) × (단을 따라가는 방향)
      place(u, r.v0, inner, pa)
      place(u, r.v1, inner, pb)
      place(Math.max(u - EU, -1), v, inner, pc)
      place(Math.min(u + EU, 1), v, inner, pd)
      const vx = pb[0] - pa[0]
      const vy = pb[1] - pa[1]
      const vz = pb[2] - pa[2]
      const ux = pd[0] - pc[0]
      const uy = pd[1] - pc[1]
      const uz = pd[2] - pc[2]
      let nx = vy * uz - vz * uy
      let ny = vz * ux - vx * uz
      let nz = vx * uy - vy * ux
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-12) {
        nx = 0
        ny = 0
        nz = 0
      } else {
        // 접힌 단은 겉면이 머리 쪽을 봅니다.
        const k = (inner ? -1 : 1) / len
        nx *= k
        ny *= k
        nz *= k
      }
      nrm[0] = nx
      nrm[1] = ny
      nrm[2] = nz
    },
    mannequin: fitMannequin(s, [0, vRib - MANNEQUIN.chinY * s, 0]),
    details: {
      template: 'hood',
      stitchWidth: sw,
      rowHeight: rh,
      neckRows: neckRows.length,
      bodyRows: bodyRows.length,
      neckHeight: vRib,
      bodyLength: bodyRows.length * rh,
      wrapWidth: hasBody ? wrapWidth : 0,
      neckRadius: [rBottom, rTop],
      shell: { center, radius },
      hem: hemRight > 0 || hemLeft > 0 ? { right: hemRight, left: hemLeft } : null,
    },
  }
}
