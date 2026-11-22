/**
 * 3D 편물의 모양 만들기. three.js나 DOM 없이 숫자 배열만 만들어서 Node에서도 돕니다.
 * (`@stitch/render-3d/garment`)
 *
 * 3D는 도안마다 자동으로 되지 않아서 형태 템플릿을 씁니다: 템플릿을 고르고,
 * Expanded의 코 수와 단수, 게이지(cm)로 크기를 정합니다.
 *
 * 코 하나가 사각형 하나입니다. 사각형은 단 순서, 단 안에서는 뜬 순서로 놓여서
 *   코의 번호 = rowStart[g - 1] + k
 * 이고, 진행 위치 { row, stitch } 까지 뜬 편물은 앞에서부터 `knittedCount()`개의 사각형입니다.
 */
import type { Expanded, GaugeSize, KnitSymbolId, Pattern, Progress, Side, SymbolId, Template } from '@stitch/pattern-ir'
import type { MannequinFit, Vec3 } from './mannequin-dims'
import { planFlat } from './templates/flat'
import { planHood } from './templates/hood'
import type { GarmentDetails, GarmentOptions, RowInfo, TemplatePlan } from './templates/types'

export type { MannequinFit, Vec3 } from './mannequin-dims'
export type { FlatDetails, GarmentDetails, GarmentOptions, HoodDetails } from './templates/types'

/** 지금 3D로 그릴 수 있는 템플릿 */
export const SUPPORTED_TEMPLATES = ['hood', 'flat'] as const
export type SupportedTemplate = (typeof SUPPORTED_TEMPLATES)[number]

export function supportsTemplate(template: Template | null | undefined): template is SupportedTemplate {
  return template === 'hood' || template === 'flat'
}

export class UnsupportedTemplateError extends Error {
  readonly template: string
  constructor(template: string) {
    super(`3D로 그릴 수 없는 형태입니다: ${template}`)
    this.name = 'UnsupportedTemplateError'
    this.template = template
  }
}

/** 게이지를 모를 때 쓰는 값 (10cm에 18코 24단) */
export const DEFAULT_GAUGE: GaugeSize = { stitches: 18, rows: 24 }

/** 기호의 번호. 실 질감 그림에서 칸의 순서이기도 합니다. */
export const SYMBOL_INDEX: Record<KnitSymbolId, number> = { K: 0, P: 1, YO: 2, K2TOG: 3, SSK: 4, SK2P: 5, M1L: 6, M1R: 7, CO: 8, BO: 9 }
export const SYMBOL_ORDER: readonly KnitSymbolId[] = (Object.keys(SYMBOL_INDEX) as KnitSymbolId[]).sort((a, b) => SYMBOL_INDEX[a] - SYMBOL_INDEX[b])

/** 실 질감 그림은 가로로 ATLAS_TILES 칸입니다. uvs가 이 배치를 따릅니다. */
export const ATLAS_TILES = 16
const UV_INSET = 3 / 128

export type GarmentRow = {
  /** 전체에서의 단 번호 (1부터) */
  g: number
  side: Side
  /** 이 단의 첫 코의 번호와 코 수 */
  first: number
  count: number
  /** expanded.sections 에서의 순서. 찾지 못하면 -1 */
  section: number
  /** 단의 가운데: 코 중심의 평균. 코가 없는 단은 앞 단의 값 */
  center: Vec3
}

export type Garment = {
  template: SupportedTemplate
  gauge: GaugeSize
  /** 코(사각형) 수. expanded.totalStitches 와 같습니다. */
  stitchCount: number
  rowCount: number

  // ---- 합친 메쉬: 코마다 꼭짓점 4개, 삼각형 2개 ----
  /** 꼭짓점 자리 (cm). 길이 stitchCount × 12 */
  positions: Float32Array
  normals: Float32Array
  /** 실 질감 그림의 좌표. 길이 stitchCount × 8 */
  uvs: Float32Array
  /** 길이 stitchCount × 6. 코 i의 삼각형은 6i부터 */
  indices: Uint32Array

  // ---- 코마다 ----
  /** 코의 중심, 바깥쪽 법선, 단이 쌓이는 방향. 길이 stitchCount × 3 */
  centers: Float32Array
  stitchNormals: Float32Array
  stitchUps: Float32Array
  /** 단 번호 g */
  stitchRow: Uint16Array
  /** 그 단에서 뜬 순서 k (0부터) */
  stitchK: Uint16Array
  /** 기호 도안의 기둥 위치 x */
  stitchX: Uint16Array
  /** 기호 번호 (SYMBOL_ORDER) */
  symbols: Uint8Array

  // ---- 단마다 ----
  /** rowStart[i]가 i번째 단(0부터)의 첫 코. 길이 rowCount + 1 */
  rowStart: Uint32Array
  rows: GarmentRow[]

  bbox: { min: Vec3; max: Vec3; size: Vec3; center: Vec3 }
  /** 마네킹을 놓는 방법. 마네킹에 입히지 않는 템플릿이면 null */
  mannequin: MannequinFit | null
  /** 템플릿이 정한 치수 (cm) */
  details: GarmentDetails
}

function normGauge(g: GaugeSize | null | undefined): GaugeSize {
  const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
  if (!g || !ok(g.stitches) || !ok(g.rows)) return { ...DEFAULT_GAUGE }
  return { stitches: g.stitches, rows: g.rows }
}

function collectRows(expanded: Expanded): RowInfo[] {
  const out: RowInfo[] = []
  expanded.blocks.forEach((b, bi) => {
    for (const row of b.rows) {
      let section = expanded.sections.findIndex((s) => row.g >= s.firstRow && row.g <= s.lastRow)
      if (section < 0) section = expanded.sections.findIndex((s) => s.id === row.sectionId)
      out.push({ row, index: 0, n: row.cells.length, section, block: bi, blockW: b.W })
    }
  })
  out.sort((a, b) => a.row.g - b.row.g)
  out.forEach((r, i) => (r.index = i))
  return out
}

/**
 * Expanded를 템플릿 모양의 편물로 만듭니다.
 * 지원하지 않는 템플릿이면 UnsupportedTemplateError를 던집니다. (`supportsTemplate`으로 먼저 확인하세요.)
 */
export function buildGarment(expanded: Expanded, template: Template, opts: GarmentOptions = {}): Garment {
  if (!supportsTemplate(template)) throw new UnsupportedTemplateError(String(template))
  const gauge = normGauge(opts.gauge)
  const rows = collectRows(expanded)
  const plan: TemplatePlan = template === 'hood' ? planHood(rows, expanded, gauge, opts) : planFlat(rows, gauge)

  let total = 0
  for (const r of rows) total += r.n

  const positions = new Float32Array(total * 12)
  const normals = new Float32Array(total * 12)
  const uvs = new Float32Array(total * 8)
  const indices = new Uint32Array(total * 6)
  const centers = new Float32Array(total * 3)
  const stitchNormals = new Float32Array(total * 3)
  const stitchUps = new Float32Array(total * 3)
  const stitchRow = new Uint16Array(total)
  const stitchK = new Uint16Array(total)
  const stitchX = new Uint16Array(total)
  const symbols = new Uint8Array(total)
  const rowStart = new Uint32Array(rows.length + 1)
  const outRows: GarmentRow[] = []

  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  const p: Vec3 = [0, 0, 0]
  const nn: Vec3 = [0, 0, 0]
  let q = 0
  let lastCenter: Vec3 = [0, 0, 0]

  for (const r of rows) {
    const n = r.n
    const cells = r.row.cells
    rowStart[r.index] = q

    // 겉면에서 본 순서: x가 큰 칸(도안의 오른쪽)이 0번
    const order = cells.map((_, i) => i).sort((a, b) => cells[b].x - cells[a].x)
    const rank = new Int32Array(n)
    order.forEach((ci, rk) => (rank[ci] = rk))

    // 모서리 0..n 의 아래와 위
    const cp = new Float64Array((n + 1) * 12)
    for (let c = 0; c <= n && n > 0; c++) {
      for (let top = 0; top < 2; top++) {
        plan.corner(r.index, c, top === 1, p, nn)
        const o = c * 12 + top * 6
        cp[o] = p[0]
        cp[o + 1] = p[1]
        cp[o + 2] = p[2]
        cp[o + 3] = nn[0]
        cp[o + 4] = nn[1]
        cp[o + 5] = nn[2]
      }
    }

    let sx = 0
    let sy = 0
    let sz = 0
    for (let j = 0; j < n; j++) {
      const cell = cells[j]
      const rk = rank[j]
      // 꼭짓점: 시작 아래, 끝 아래, 끝 위, 시작 위
      const src = [rk * 12, (rk + 1) * 12, (rk + 1) * 12 + 6, rk * 12 + 6]
      const base = q * 12
      for (let c = 0; c < 4; c++) {
        const o = src[c]
        positions[base + c * 3] = cp[o]
        positions[base + c * 3 + 1] = cp[o + 1]
        positions[base + c * 3 + 2] = cp[o + 2]
      }
      const ax = positions[base]
      const ay = positions[base + 1]
      const az = positions[base + 2]
      const bx = positions[base + 3]
      const by = positions[base + 4]
      const bz = positions[base + 5]
      const cx = positions[base + 6]
      const cy = positions[base + 7]
      const cz = positions[base + 8]
      const dx = positions[base + 9]
      const dy = positions[base + 10]
      const dz = positions[base + 11]
      for (const [x, y, z] of [
        [ax, ay, az],
        [bx, by, bz],
        [cx, cy, cz],
        [dx, dy, dz],
      ]) {
        if (x < min[0]) min[0] = x
        if (y < min[1]) min[1] = y
        if (z < min[2]) min[2] = z
        if (x > max[0]) max[0] = x
        if (y > max[1]) max[1] = y
        if (z > max[2]) max[2] = z
      }

      // 면의 법선: 감기는 방향 (a, c, b) 기준. 대각선 둘의 외적이라 찌그러진 사각형에서도 안정적입니다.
      const e1x = cx - ax
      const e1y = cy - ay
      const e1z = cz - az
      const e2x = bx - dx
      const e2y = by - dy
      const e2z = bz - dz
      let fx = e1y * e2z - e1z * e2y
      let fy = e1z * e2x - e1x * e2z
      let fz = e1x * e2y - e1y * e2x
      const fl = Math.hypot(fx, fy, fz)
      if (fl > 1e-12) {
        fx /= fl
        fy /= fl
        fz /= fl
      } else {
        fx = cp[src[0] + 3]
        fy = cp[src[0] + 4]
        fz = cp[src[0] + 5]
        if (fx === 0 && fy === 0 && fz === 0) fz = 1
      }

      // 꼭짓점 법선: 곡면에서 구한 값. 면과 크게 어긋나면(접는 선 위의 칸 등) 면의 법선을 씁니다.
      for (let c = 0; c < 4; c++) {
        const o = src[c] + 3
        let nx = cp[o]
        let ny = cp[o + 1]
        let nz = cp[o + 2]
        if (nx * fx + ny * fy + nz * fz < 0.5) {
          nx = fx
          ny = fy
          nz = fz
        }
        normals[base + c * 3] = nx
        normals[base + c * 3 + 1] = ny
        normals[base + c * 3 + 2] = nz
      }

      // 코바늘 기호의 질감은 아직 없어 겉뜨기 칸을 씁니다.
      const tile = (SYMBOL_INDEX as Partial<Record<SymbolId, number>>)[cell.s] ?? 0
      const u0 = (tile + UV_INSET) / ATLAS_TILES
      const u1 = (tile + 1 - UV_INSET) / ATLAS_TILES
      uvs.set([u1, 0.02, u0, 0.02, u0, 0.98, u1, 0.98], q * 8)
      const b4 = q * 4
      indices.set([b4, b4 + 2, b4 + 1, b4, b4 + 3, b4 + 2], q * 6)

      const mx = (ax + bx + cx + dx) / 4
      const my = (ay + by + cy + dy) / 4
      const mz = (az + bz + cz + dz) / 4
      centers[q * 3] = mx
      centers[q * 3 + 1] = my
      centers[q * 3 + 2] = mz
      stitchNormals[q * 3] = fx
      stitchNormals[q * 3 + 1] = fy
      stitchNormals[q * 3 + 2] = fz
      // 단이 쌓이는 방향: 아래 변에서 위 변으로, 법선에 수직이 되게
      let ux = dx - ax + cx - bx
      let uy = dy - ay + cy - by
      let uz = dz - az + cz - bz
      const dot = ux * fx + uy * fy + uz * fz
      ux -= dot * fx
      uy -= dot * fy
      uz -= dot * fz
      const ul = Math.hypot(ux, uy, uz)
      if (ul > 1e-12) {
        ux /= ul
        uy /= ul
        uz /= ul
      } else {
        ux = 0
        uy = 1
        uz = 0
      }
      stitchUps[q * 3] = ux
      stitchUps[q * 3 + 1] = uy
      stitchUps[q * 3 + 2] = uz

      stitchRow[q] = r.row.g
      stitchK[q] = j
      stitchX[q] = cell.x
      symbols[q] = tile
      sx += mx
      sy += my
      sz += mz
      q += 1
    }
    if (n > 0) lastCenter = [sx / n, sy / n, sz / n]
    outRows.push({ g: r.row.g, side: r.row.side, first: rowStart[r.index], count: n, section: r.section, center: [...lastCenter] as Vec3 })
  }
  rowStart[rows.length] = q

  if (total === 0) {
    min[0] = min[1] = min[2] = 0
    max[0] = max[1] = max[2] = 0
  }
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]

  return {
    template,
    gauge,
    stitchCount: total,
    rowCount: rows.length,
    positions,
    normals,
    uvs,
    indices,
    centers,
    stitchNormals,
    stitchUps,
    stitchRow,
    stitchK,
    stitchX,
    symbols,
    rowStart,
    rows: outRows,
    bbox: { min, max, size, center },
    mannequin: plan.mannequin,
    details: plan.details,
  }
}

// ---------------------------------------------------------------------------
// (g, k) ↔ 코의 번호
// ---------------------------------------------------------------------------

/** g단이 rows에서 몇 번째인지. 없으면 -1 */
export function rowIndexOf(garment: Garment, g: number): number {
  const i = g - 1
  if (garment.rows[i]?.g === g) return i
  return garment.rows.findIndex((r) => r.g === g)
}

/** g단에서 k번째로 뜬 코의 번호. 없으면 -1 */
export function stitchIndex(garment: Garment, g: number, k: number): number {
  const i = rowIndexOf(garment, g)
  if (i < 0) return -1
  const row = garment.rows[i]
  if (!Number.isInteger(k) || k < 0 || k >= row.count) return -1
  return row.first + k
}

/** g단에서 기호 도안의 x 기둥에 있는 코의 번호. 그 자리에 코가 없으면 가장 가까운 코, 단이 비었으면 -1 */
export function stitchIndexAtColumn(garment: Garment, g: number, x: number): number {
  const i = rowIndexOf(garment, g)
  if (i < 0) return -1
  const row = garment.rows[i]
  let best = -1
  let bestD = Infinity
  for (let q = row.first; q < row.first + row.count; q++) {
    const d = Math.abs(garment.stitchX[q] - x)
    if (d < bestD) {
      bestD = d
      best = q
      if (d === 0) break
    }
  }
  return best
}

export type StitchRef = {
  /** 단 번호 g */
  row: number
  /** 그 단에서 뜬 순서 (0부터) */
  k: number
  /** 기호 도안의 기둥 위치 */
  x: number
  symbol: SymbolId
}

/** 코의 번호가 가리키는 칸 */
export function stitchAt(garment: Garment, index: number): StitchRef | null {
  if (!Number.isInteger(index) || index < 0 || index >= garment.stitchCount) return null
  return { row: garment.stitchRow[index], k: garment.stitchK[index], x: garment.stitchX[index], symbol: SYMBOL_ORDER[garment.symbols[index]] ?? 'K' }
}

/** 진행 위치까지 뜬 코의 수. 앞에서부터 이만큼의 사각형이 뜬 부분입니다. null이면 전부 */
export function knittedCount(garment: Garment, progress: Progress | null | undefined): number {
  if (!progress) return garment.stitchCount
  const row = Math.floor(progress.row)
  if (!(row >= 1) || garment.rows.length === 0) return 0
  const last = garment.rows[garment.rows.length - 1]
  if (row > last.g) return garment.stitchCount
  let i = rowIndexOf(garment, row)
  if (i < 0) {
    // 번호가 건너뛴 경우: 그 앞 단까지
    i = garment.rows.findIndex((r) => r.g > row)
    return i < 0 ? garment.stitchCount : garment.rows[i].first
  }
  const r = garment.rows[i]
  const st = Number.isFinite(progress.stitch) ? Math.max(0, Math.min(r.count, Math.floor(progress.stitch))) : 0
  return r.first + st
}

/** 단의 중심선: 그 단의 코 중심을 뜬 순서대로 이은 점들 (x, y, z 반복). centers 를 그대로 가리킵니다. */
export function rowLine(garment: Garment, g: number): Float32Array {
  const i = rowIndexOf(garment, g)
  if (i < 0) return new Float32Array(0)
  const row = garment.rows[i]
  return garment.centers.subarray(row.first * 3, (row.first + row.count) * 3)
}

// ---------------------------------------------------------------------------
// 템플릿 고르기
// ---------------------------------------------------------------------------

const HINTS: [Template, RegExp][] = [
  ['hood', /후드|바라클라바|balaclava|hood/i],
  ['hat', /모자|비니|베레|버킷|hat|beanie|beret/i],
  ['tube', /넥워머|넥 워머|워머|토시|cowl|snood|tube|sleeve/i],
  ['flat', /목도리|스카프|머플러|숄|담요|블랭킷|수세미|행주|scarf|shawl|blanket|cloth|swatch/i],
]

const DECREASES = new Set(['k2tog', 'ssk', 'sk2p', 'k3tog', 'p2tog', 'cdd', 'sc2tog'])

function countDecreases(ops: Pattern['sections'][number]['groups'][number]['rows'][number]['ops']): number {
  let n = 0
  for (const op of ops) {
    if ('st' in op) {
      if (DECREASES.has(op.st.toLowerCase())) n += 1
    } else if ('repeat' in op) n += countDecreases(op.repeat)
  }
  return n
}

/**
 * 도안에 맞는 템플릿을 고릅니다. IR에 template이 있으면 그 값이 그대로 나옵니다.
 * 없을 때만 제목과 뜨는 방식으로 짐작하고, 짐작한 템플릿을 그릴 수 있는지는 `supportsTemplate`으로 확인하세요.
 */
export function suggestTemplate(pattern: Pattern): Template {
  if (pattern.template) return pattern.template
  if (pattern.craft !== 'knit' || pattern.sections.length === 0) return 'none'

  const shapes = pattern.sections.map((s) => s.shape)
  const allFlat = shapes.every((s) => s === 'flat')
  const allRound = shapes.every((s) => s !== 'flat')

  for (const [template, re] of HINTS) {
    if (!re.test(pattern.title)) continue
    // 제목이 말하는 형태가 뜨는 방식과 어긋나면 넘어갑니다.
    if (template === 'flat' && !allFlat) continue
    if (template === 'tube' && !allRound) continue
    return template
  }

  if (allFlat) return 'flat'
  if (allRound) {
    // 원통으로 뜨다가 마지막 구간에서 줄이면 모자, 아니면 통
    const last = pattern.sections[pattern.sections.length - 1]
    const dec = last.groups.reduce((n, g) => n + g.rows.reduce((m, r) => m + countDecreases(r.ops), 0), 0)
    return dec > 0 ? 'hat' : 'tube'
  }
  return 'none'
}
