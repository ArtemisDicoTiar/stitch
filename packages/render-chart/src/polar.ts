/**
 * 원형 기호 도안. 둘러 뜨는 조각을 가운데에서 바깥으로 퍼지는 동심원으로 그립니다.
 * 코바늘 도안책의 원형 도안과 같은 꼴입니다: 가운데가 1단이고, 단마다 바깥 고리 하나를 차지합니다.
 * 기호는 뜨는 순서대로 시계 반대 방향으로 놓이고, 기호의 위쪽이 바깥을 향합니다.
 *
 * 격자 도안(render.ts)과 달리 보기 전용입니다. 칸을 누르거나 단수링을 다는 것은 격자에서 합니다.
 * 왕복으로 뜬 조각은 원형으로 그릴 수 없어 건너뜁니다.
 */
import type { Expanded, ExpandedRow, Progress, SymbolId } from '@stitch/pattern-ir'
import { SYMBOLS, SYMBOL_ORDER, SYMBOL_STROKE, strokeAttrs, symbolGlyph } from './symbols'
import { esc, num, rectPath, textWidth } from './util'

export type PolarOptions = {
  /** 기호 한 칸의 크기 (px). 기본 14 */
  cell?: number
  /** 여기까지 뜬 것으로 보고, 그 뒤의 코는 흐리게 그립니다. 없으면 모두 선명하게 */
  progress?: Progress | null
  fontFamily?: string
  /** defs 안의 id 앞에 붙는 말 */
  idPrefix?: string
  colors?: Partial<PolarColors>
  /** 스크린 리더가 읽을 이름 */
  title?: string
}

export type PolarColors = { paper: string; ink: string; ring: string; number: string; count: string; accent: string; added: string; name: string }

const DEFAULT_POLAR_COLORS: PolarColors = { paper: '#fffdf9', ink: '#262626', ring: '#d6d0c8', number: '#555555', count: '#b5531b', accent: '#e8590c', added: '#d9f2cf', name: '#2f6f4f' }

export type PolarPiece = {
  /** 구간 이름 */
  name: string
  /** 이 조각의 단들 (가운데부터) */
  rows: ExpandedRow[]
  /** 조각 가운데의 좌표와 바깥 반지름 */
  cx: number
  cy: number
  radius: number
  /** 단마다의 가운데 반지름 (기호가 놓이는 원) */
  rowRadius: number[]
}

export type PolarLayout = { width: number; height: number; cell: number; pieces: PolarPiece[] }

const TAU = Math.PI * 2

/** 둘러 뜬 조각만 골라, 조각마다 단을 모읍니다. 조각 번호(piece)가 바뀌는 곳에서 나눕니다. */
function roundPieces(expanded: Expanded): { name: string; rows: ExpandedRow[] }[] {
  const all = expanded.blocks.flatMap((b) => b.rows).sort((a, b) => a.g - b.g)
  const groups: ExpandedRow[][] = []
  let last = -1
  for (const r of all) {
    const id = r.piece ?? 0
    if (groups.length === 0 || id !== last) groups.push([])
    groups[groups.length - 1].push(r)
    last = id
  }
  return groups
    .filter((rows) => rows.every((r) => r.side === 'round') && rows.some((r) => r.cells.length > 0))
    .map((rows) => ({ name: rows[0].section + (rows[0].copy ? ` ${rows[0].copy}` : ''), rows }))
}

/** 원형으로 그릴 수 있는 조각이 있는지 */
export function hasPolarPieces(expanded: Expanded): boolean {
  return roundPieces(expanded).length > 0
}

export function polarLayout(expanded: Expanded, opts: PolarOptions = {}): PolarLayout {
  const cs = opts.cell ?? 14
  const pad = cs * 2.2
  const gap = cs * 2.5
  const pieces: PolarPiece[] = []
  let x = pad
  let tallest = 0
  for (const p of roundPieces(expanded)) {
    // 단의 반지름: 앞 단보다 한 칸 바깥이면서, 그 단의 기호가 서로 겹치지 않을 만큼
    const rowRadius: number[] = []
    let prev = cs * 0.2
    for (const r of p.rows) {
      const need = (Math.max(1, r.cells.length) * cs * 0.98) / TAU
      prev = Math.max(prev + cs, need)
      rowRadius.push(prev)
    }
    const radius = prev + cs * 0.5
    const labelRoom = cs * 1.8
    pieces.push({ name: p.name, rows: p.rows, cx: x + radius + labelRoom, cy: 0, radius, rowRadius })
    x += (radius + labelRoom) * 2 + gap
    tallest = Math.max(tallest, radius)
  }
  const top = pad + cs * 1.6
  for (const p of pieces) p.cy = top + tallest
  return { width: Math.max(pad * 2, x - gap + pad), height: top + tallest * 2 + pad, cell: cs, pieces }
}

/** 그 코가 진행 위치까지 뜬 코인지 */
function knitted(row: ExpandedRow, k: number, progress: Progress | null | undefined): boolean {
  if (!progress) return true
  return row.g < progress.row || (row.g === progress.row && k < progress.stitch)
}

export function renderPolarSvg(expanded: Expanded, opts: PolarOptions = {}): string {
  const L = polarLayout(expanded, opts)
  const C = { ...DEFAULT_POLAR_COLORS, ...opts.colors }
  const cs = L.cell
  const prefix = opts.idPrefix ?? 'pc-'
  const font = opts.fontFamily ?? '"IBM Plex Sans KR","Noto Sans KR",sans-serif'
  const used = new Set<SymbolId>()
  const usedAdded = new Set<SymbolId>()
  const rings: string[] = []
  const now: string[] = []
  const uses: string[] = []
  const faint: string[] = []
  const texts: string[] = []
  const text = (x: number, y: number, body: string, attrs: string) => `<text x="${num(x)}" y="${num(y)}" ${attrs}>${esc(body)}</text>`

  for (const p of L.pieces) {
    texts.push(text(p.cx, p.cy - p.radius - cs * 0.9, p.name, `text-anchor="middle" font-size="${num(cs * 0.95)}" font-weight="700" fill="${esc(C.name)}"`))
    p.rows.forEach((row, i) => {
      const r = p.rowRadius[i]
      const outer = r + cs / 2
      rings.push(`<circle cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(outer)}"/>`)
      if (opts.progress && row.g === opts.progress.row) now.push(`<circle cx="${num(p.cx)}" cy="${num(p.cy)}" r="${num(r)}" stroke-width="${num(cs)}"/>`)
      const n = row.cells.length
      // 단의 시작은 아래쪽(6시)이고, 시계 반대 방향으로 뜹니다.
      row.cells
        .slice()
        .sort((a, b) => a.k - b.k)
        .forEach((cell, k) => {
          const a = Math.PI / 2 - (TAU * (k + 0.5)) / n
          const x = p.cx + r * Math.cos(a)
          const y = p.cy + r * Math.sin(a)
          // 기호의 위쪽이 바깥을 향하게 돌립니다.
          const deg = (a * 180) / Math.PI + 90
          const id = prefix + cell.s + (cell.a ? '-a' : '')
          ;(cell.a ? usedAdded : used).add(cell.s)
          const use = `<use href="#${esc(id)}" transform="translate(${num(x)},${num(y)}) rotate(${num(deg)}) translate(${num(-cs / 2)},${num(-cs / 2)})"/>`
          ;(knitted(row, k, opts.progress) ? uses : faint).push(use)
        })
      // 단 번호는 시작 자리 바로 아래 줄에, 코 수는 바깥 고리에만
      texts.push(text(p.cx, p.cy + r + cs * 0.32, String(i + 1), `text-anchor="middle" font-size="${num(cs * 0.6)}" fill="${esc(C.number)}" paint-order="stroke" stroke="${esc(C.paper)}" stroke-width="${num(cs * 0.22)}"`))
    })
    const last = p.rows[p.rows.length - 1]
    const label = `${p.rows.length}단 · ${last.count}코`
    texts.push(text(p.cx, p.cy + p.radius + cs * 1.25, label, `text-anchor="middle" font-size="${num(cs * 0.8)}" font-weight="600" fill="${esc(C.count)}"`))
  }

  const w = num(L.width)
  const h = num(L.height)
  const def = (id: SymbolId, suffix: string, bg: string) => {
    const white = bg.toLowerCase() === '#ffffff'
    return `<g id="${esc(prefix + id + suffix)}">${white ? '' : `<path d="${rectPath(0, 0, cs, cs)}" fill="${esc(bg)}" stroke="none"/>`}${symbolGlyph(id, 0, 0, cs, C.ink)}</g>`
  }
  const defs = [...SYMBOL_ORDER.filter((id) => used.has(id)).map((id) => def(id, '', SYMBOLS[id].bg)), ...SYMBOL_ORDER.filter((id) => usedAdded.has(id)).map((id) => def(id, '-a', C.added))]
  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${esc(font)}" role="img" aria-label="${esc(opts.title ?? '원형 기호 도안')}">`)
  if (defs.length) out.push(`<defs>${defs.join('')}</defs>`)
  out.push(`<rect class="pc-paper" width="${w}" height="${h}" fill="${esc(C.paper)}"/>`)
  if (rings.length) out.push(`<g class="pc-rings" fill="none" stroke="${esc(C.ring)}" stroke-width="0.8">${rings.join('')}</g>`)
  if (now.length) out.push(`<g class="pc-now" fill="none" stroke="${esc(C.accent)}" stroke-opacity="0.18">${now.join('')}</g>`)
  const sw = Math.max(SYMBOL_STROKE, cs * 0.085)
  if (faint.length) out.push(`<g class="pc-todo" opacity="0.28" ${strokeAttrs(C.ink, sw)}>${faint.join('')}</g>`)
  if (uses.length) out.push(`<g class="pc-done" ${strokeAttrs(C.ink, sw)}>${uses.join('')}</g>`)
  out.push(`<g class="pc-text">${texts.join('')}</g>`)
  out.push('</svg>')
  return out.join('')
}

/** 조각 이름이 차지할 폭 (px). 도안을 담는 쪽에서 여백을 잡을 때 씁니다. */
export function polarNameWidth(name: string, cell = 14): number {
  return textWidth(name, cell * 0.95, true)
}
