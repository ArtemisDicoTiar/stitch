/**
 * 도안 위에 얹는 표시: 진행 상황, 단수링, 고른 칸.
 * 바탕 도안과 따로 그려서 이것만 다시 그릴 수 있게 합니다. 모두 DOM 없이 문자열을 돌려줍니다.
 */
import type { Progress } from '@stitch/pattern-ir'
import { startsRight, type ChartHit, type ChartLayout } from './layout'
import { clamp, esc, num, rectPath } from './util'

/** 사용자가 꽂아 둔 단수링. x는 기둥 위치 */
export type ChartRing = { row: number; x: number; color: string; name?: string }

/** 고른 칸. stitch는 그 단에서 몇 번째로 뜨는 코인지 (1부터) */
export type ChartSelection = { row: number; stitch: number }

/**
 * 지금 뜰 자리. 진행 위치의 단을 다 떴으면 다음 단의 첫 코입니다.
 * 다 뜬 도안이면 null. k는 그 단에서 뜨는 순서(0부터)이고, 코가 없는 단이면 -1입니다.
 */
export function workingPosition(L: ChartLayout, p: Progress): { row: number; k: number } | null {
  const total = L.expanded.totalRows
  if (total < 1) return null
  let row = Math.floor(p.row)
  let k = 0
  if (row < 1) row = 1
  else {
    const n = L.row(row)?.cells.length ?? 0
    const done = clamp(Math.floor(p.stitch), 0, n)
    if (done < n) k = done
    else row += 1
  }
  if (row > total) return null
  const cells = L.row(row)?.cells.length ?? 0
  return { row, k: cells > 0 ? Math.min(k, cells - 1) : -1 }
}

/**
 * 진행 표시. 뜬 칸은 그대로 두고 아직 안 뜬 칸을 옅게 덮습니다.
 * 지금 뜰 단에는 테두리를, 다음에 뜰 코에는 동그라미를 그립니다.
 */
export function progressOverlaySvg(L: ChartLayout, p: Progress | null): string {
  if (!p) return ''
  const { cell: cs, options: o } = L
  const s = L.metrics.scale
  const C = o.colors
  const total = L.expanded.totalRows
  const row = Math.floor(p.row)

  // firstVeiled 단부터는 통째로 덮고, partial 단은 남은 코만 덮습니다.
  let firstVeiled: number
  let partial: { g: number; done: number } | null = null
  if (row < 1) firstVeiled = 1
  else if (row > total) firstVeiled = total + 1
  else {
    const n = L.row(row)?.cells.length ?? 0
    const done = clamp(Math.floor(p.stitch), 0, n)
    if (done <= 0 && n > 0) firstVeiled = row
    else {
      firstVeiled = row + 1
      if (done < n) partial = { g: row, done }
    }
  }

  let veil = ''
  for (const b of L.blocks) {
    if (b.rows === 0 || b.lastRow < firstVeiled) continue
    const bottom = L.rowRect(Math.max(b.firstRow, firstVeiled))
    if (bottom) veil += rectPath(b.x, b.y, b.w, bottom.y + cs - b.y)
  }
  if (partial) {
    const r = L.row(partial.g)
    const band = L.rowRect(partial.g)
    if (r && band) {
      const W = Math.round(band.w / cs)
      const next = L.cellByOrder(partial.g, partial.done)
      const right = startsRight(r.side)
      const covered: boolean[] = new Array(W).fill(false)
      // 코가 없는 칸은 아직 안 뜬 쪽에 있을 때만 덮습니다.
      if (next) for (let x = 0; x < W; x++) covered[x] = right ? x <= next.x : x >= next.x
      for (const c of r.cells) if (c.x >= 0 && c.x < W) covered[c.x] = c.k >= partial.done
      let x = 0
      while (x < W) {
        if (!covered[x]) {
          x++
          continue
        }
        let e = x
        while (e + 1 < W && covered[e + 1]) e++
        veil += rectPath(band.x + x * cs, band.y, (e - x + 1) * cs, cs)
        x = e + 1
      }
    }
  }

  let out = veil ? `<path class="sc-veil" fill="${esc(C.veil)}" fill-opacity="0.66" d="${veil}"/>` : ''

  const now = workingPosition(L, p)
  const band = now ? L.rowRect(now.row) : null
  if (now && band) {
    const accent = esc(C.accent)
    out += `<rect class="sc-now-row" x="${num(band.x - s)}" y="${num(band.y - s)}" width="${num(band.w + 2 * s)}" height="${num(cs + 2 * s)}" fill="none" stroke="${accent}" stroke-width="${num(2.2 * s)}"/>`
    const c = now.k >= 0 ? L.cellByOrder(now.row, now.k) : null
    const at = c ? L.rectOf(now.row, c.x) : null
    if (at) {
      const cx = at.x + cs / 2
      out += `<circle class="sc-now" cx="${num(cx)}" cy="${num(at.y + cs / 2)}" r="${num(cs * 0.62)}" fill="${accent}" fill-opacity="0.35" stroke="${accent}" stroke-width="${num(2.4 * s)}"/>`
      out += `<text class="sc-now-label" x="${num(cx)}" y="${num(at.y - 6 * s)}" text-anchor="middle" font-size="${num(11 * s)}" font-weight="700" fill="#fff" stroke="${accent}" stroke-width="${num(4 * s)}" paint-order="stroke">${esc(o.labels.now)}</text>`
    }
  }
  return out
}

/** 단수링. 이름이 없으면 labels.ring 을 적습니다 (빈 문자열이면 글씨 없이 동그라미만). */
export function ringsOverlaySvg(L: ChartLayout, rings: readonly ChartRing[]): string {
  const { cell: cs, options: o } = L
  const s = L.metrics.scale
  let out = ''
  for (const ring of rings) {
    if (!ring) continue
    const at = L.rectOf(ring.row, ring.x)
    if (!at) continue
    const cx = at.x + cs / 2
    const cy = at.y + cs / 2
    const color = esc(ring.color || o.colors.accent)
    out += `<circle class="sc-ring" cx="${num(cx)}" cy="${num(cy)}" r="${num(cs * 0.72)}" fill="none" stroke="${color}" stroke-width="${num(2.6 * s)}"/>`
    const name = ring.name || o.labels.ring
    if (name) {
      out += `<text class="sc-ring-label" x="${num(cx + cs)}" y="${num(cy + 4 * s)}" font-size="${num(10.5 * s)}" font-weight="700" fill="${color}" stroke="${esc(o.colors.paper)}" stroke-width="${num(3.5 * s)}" paint-order="stroke">${esc(name)}</text>`
    }
  }
  return out
}

/** 칸 하나를 감싸는 테두리 */
export function cellOutlineSvg(L: ChartLayout, g: number, x: number, color: string, width: number, cls = 'sc-outline'): string {
  const at = L.rectOf(g, x)
  if (!at) return ''
  const s = L.metrics.scale
  return `<rect class="${cls}" x="${num(at.x - 0.5 * s)}" y="${num(at.y - 0.5 * s)}" width="${num(at.w + s)}" height="${num(at.h + s)}" fill="none" stroke="${esc(color)}" stroke-width="${num(width * s)}"/>`
}

/** 고른 칸(ChartSelection)이 가리키는 코 */
export function selectionCell(L: ChartLayout, sel: ChartSelection | null): ChartHit | null {
  if (!sel) return null
  const r = L.row(sel.row)
  if (!r || r.cells.length === 0) return null
  const c = L.cellByOrder(sel.row, clamp(Math.floor(sel.stitch) - 1, 0, r.cells.length - 1))
  return c ? { g: sel.row, x: c.x, k: c.k } : null
}

export type CursorMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'pageup' | 'pagedown'

/**
 * 키보드로 칸을 옮깁니다. 화면에서 보이는 방향대로 움직입니다.
 * 좌우는 같은 단에서 그쪽으로 가장 가까운 코, 위아래는 윗단과 아랫단에서 가로 위치가 가장 가까운 코입니다.
 * 코가 없는 칸은 건너뜁니다. 더 갈 곳이 없으면 제자리입니다.
 */
export function moveCursor(L: ChartLayout, from: { g: number; x: number }, move: CursorMove): ChartHit | null {
  const here = L.row(from.g)
  const at = L.rectOf(from.g, from.x)
  if (!here || !at) return null
  const stay = (): ChartHit | null => {
    const c = L.cellOf(from.g, from.x)
    return c ? { g: from.g, x: c.x, k: c.k } : null
  }

  if (move === 'left' || move === 'right' || move === 'home' || move === 'end') {
    let best: ChartHit | null = null
    for (const c of here.cells) {
      const better =
        move === 'left'
          ? c.x < from.x && (!best || c.x > best.x)
          : move === 'right'
            ? c.x > from.x && (!best || c.x < best.x)
            : move === 'home'
              ? !best || c.x < best.x
              : !best || c.x > best.x
      if (better) best = { g: from.g, x: c.x, k: c.k }
    }
    return best ?? stay()
  }

  const dir = move === 'up' || move === 'pageup' ? 1 : -1
  const total = L.expanded.totalRows
  let g = from.g + dir * (move === 'pageup' || move === 'pagedown' ? 10 : 1)
  g = clamp(g, 1, total)
  // 코가 없는 단이면 같은 방향으로 더 갑니다.
  while (g >= 1 && g <= total && g !== from.g) {
    const r = L.row(g)
    if (r && r.cells.length > 0) {
      let best: ChartHit | null = null
      let bestD = Infinity
      for (const c of [...r.cells].sort((a, z) => a.x - z.x)) {
        const rect = L.rectOf(g, c.x)
        if (!rect) continue
        const d = Math.abs(rect.x - at.x)
        if (d < bestD) {
          bestD = d
          best = { g, x: c.x, k: c.k }
        }
      }
      if (best) return best
    }
    g += dir
  }
  return stay()
}
