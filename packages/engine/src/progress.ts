import type { Expanded, ExpandedRow, Progress } from '@stitch/pattern-ir'
import { allRows } from './verify'

/** g번째 단을 찾습니다. */
export function rowAt(expanded: Expanded, g: number): ExpandedRow | undefined {
  for (const b of expanded.blocks) {
    const first = b.rows[0]?.g
    if (first === undefined) continue
    const r = b.rows[g - first]
    if (r && r.g === g) return r
  }
  return allRows(expanded).find((r) => r.g === g)
}

/** 진행 위치를 도안 범위 안으로 맞춥니다. */
export function clampProgress(expanded: Expanded, p: Progress): Progress {
  if (expanded.totalRows === 0) return { row: 0, stitch: 0 }
  const row = Math.min(Math.max(1, Math.round(p.row)), expanded.totalRows)
  const cells = rowAt(expanded, row)?.cells.length ?? 0
  return { row, stitch: Math.min(Math.max(0, Math.round(p.stitch)), cells) }
}

/** 지금까지 뜬 코 수 */
export function stitchesDone(expanded: Expanded, p: Progress): number {
  if (p.row <= 0) return 0
  let done = 0
  for (const r of allRows(expanded)) {
    if (r.g < p.row) done += r.cells.length
    else if (r.g === p.row) done += Math.min(p.stitch, r.cells.length)
    else break
  }
  return done
}

/** 진행률(0~1). 저장하지 않고 IR의 총 코 수에서 계산합니다. */
export function progressFraction(expanded: Expanded, p: Progress): number {
  if (expanded.totalStitches === 0) return 0
  return Math.min(1, stitchesDone(expanded, p) / expanded.totalStitches)
}

/**
 * 게이지를 다시 계산해 버전이 바뀌었을 때,
 * 기록과 단수링을 새 버전의 같은 구간, 같은 비율 위치로 옮깁니다.
 */
export function mapProgress(from: Expanded, to: Expanded, p: Progress): Progress {
  if (p.row <= 0 || from.totalRows === 0 || to.totalRows === 0) return { row: 0, stitch: 0 }
  const src = from.sections.find((s) => p.row >= s.firstRow && p.row <= s.lastRow)
  const dst = src && to.sections.find((s) => s.id === src.id)
  if (!src || !dst || dst.rows === 0) {
    const row = Math.max(1, Math.min(to.totalRows, Math.round((p.row / from.totalRows) * to.totalRows)))
    return clampProgress(to, { row, stitch: p.stitch })
  }
  const done = p.row - src.firstRow
  const ratio = src.rows > 1 ? done / (src.rows - 1) : 0
  const row = dst.firstRow + Math.round(ratio * (dst.rows - 1))
  const fromCells = rowAt(from, p.row)?.cells.length ?? 0
  const toCells = rowAt(to, row)?.cells.length ?? 0
  const stitch = fromCells > 0 ? Math.round((p.stitch / fromCells) * toCells) : 0
  return clampProgress(to, { row, stitch })
}

/** 단수링의 코 위치(x)를 새 버전의 같은 비율 위치로 옮깁니다. */
export function mapMarker(from: Expanded, to: Expanded, row: number, x: number): { row: number; x: number } {
  const p = mapProgress(from, to, { row, stitch: 0 })
  const fromW = from.blocks.find((b) => b.rows.some((r) => r.g === row))?.W ?? 1
  const toW = to.blocks.find((b) => b.rows.some((r) => r.g === p.row))?.W ?? 1
  return { row: p.row, x: Math.min(toW - 1, Math.max(0, Math.round((x / Math.max(1, fromW - 1)) * (toW - 1)))) }
}
