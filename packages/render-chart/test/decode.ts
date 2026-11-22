/**
 * 그려진 SVG 문자열을 다시 "어느 자리에 어떤 기호"로 읽어 냅니다.
 * 그리는 코드를 거치지 않고 도형의 좌표만 보고 판단합니다. 점선은 화면에 그려지는 대로
 * 점 하나하나로 풀고, 기호는 SYMBOLS의 모양과 맞춰 봐서 알아냅니다.
 */
import { KNIT_SYMBOLS, type SymbolId } from '@stitch/pattern-ir'
import { SYMBOLS, type SymbolPrim } from '../src'

export type Shape =
  | { t: 'poly'; p: [number, number][] }
  | { t: 'circle'; c: [number, number]; r: number }
  | { t: 'dot'; c: [number, number]; r: number }

const TOL = 0.012

const near = (a: number, b: number, tol = TOL) => Math.abs(a - b) <= tol

function samePrim(a: Shape, b: SymbolPrim): boolean {
  if (a.t === 'poly') {
    if (b.t !== 'poly' || a.p.length !== b.p.length) return false
    return a.p.every((pt, i) => near(pt[0], b.p[i][0]) && near(pt[1], b.p[i][1]))
  }
  if (b.t !== a.t) return false
  return near(a.c[0], b.c[0]) && near(a.c[1], b.c[1]) && near(a.r, b.r)
}

/** 한 칸(0~1 좌표) 안의 도형들이 어떤 기호인지 */
export function classify(shapes: Shape[]): SymbolId | null {
  for (const id of KNIT_SYMBOLS) {
    const prims = SYMBOLS[id].prims
    if (prims.length === shapes.length && prims.every((p, i) => samePrim(shapes[i], p))) return id
  }
  return null
}

export function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)
  return m ? m[1] : null
}

/** "M1,2L3,4" 꼴의 꺾은선 */
export function polyPoints(d: string): [number, number][] {
  return d
    .replace(/^\s*M\s*/, '')
    .split(/\s*L\s*/)
    .map((pair) => {
      const [x, y] = pair.trim().split(/[\s,]+/).map(Number)
      return [x, y] as [number, number]
    })
}

/** 사각형 조각 "Mx,yhWvHh-Wz" 들 */
export function rectsOf(d: string): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = []
  const re = /M(-?[\d.]+),(-?[\d.]+)h(-?[\d.]+)v(-?[\d.]+)h(-?[\d.]+)z/g
  let m: RegExpExecArray | null
  let used = 0
  while ((m = re.exec(d))) {
    out.push({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] })
    if (!near(+m[3], -+m[5], 1e-6)) throw new Error(`사각형이 닫히지 않습니다: ${m[0]}`)
    used += m[0].length
  }
  if (used !== d.length) throw new Error('사각형이 아닌 조각이 섞여 있습니다')
  return out
}

/** 사각형을 칸 크기 정사각형들로 나눕니다. */
export function unitSquares(r: { x: number; y: number; w: number; h: number }, cell: number): { x: number; y: number }[] {
  const nx = Math.round(r.w / cell)
  const ny = Math.round(r.h / cell)
  if (!near(nx * cell, r.w, 1e-6) || !near(ny * cell, r.h, 1e-6) || nx < 1 || ny < 1) throw new Error(`칸 크기에 맞지 않는 사각형: ${JSON.stringify(r)}`)
  const out: { x: number; y: number }[] = []
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) out.push({ x: r.x + i * cell, y: r.y + j * cell })
  return out
}

export type Glyph = { s: SymbolId; x: number; y: number }
export type Decoded = {
  /** 기호와 그 칸의 왼쪽 위 좌표 */
  glyphs: Glyph[]
  /** 코 없음 칸의 왼쪽 위 좌표 */
  none: { x: number; y: number }[]
  /** 추정 단 띠의 사각형 */
  estimated: { x: number; y: number; w: number; h: number }[]
  uses: number
  dashRuns: number
}

/** 좌표를 맵의 키로 */
export const at = (x: number, y: number) => `${Math.round(x * 100)},${Math.round(y * 100)}`

export function decodeChartSvg(svg: string, cell: number): Decoded {
  const glyphs: Glyph[] = []

  // defs: id마다 그려 둔 모양을 읽어 어떤 기호인지 알아냅니다.
  const defs = new Map<string, SymbolId>()
  const defsBody = /<defs>([\s\S]*?)<\/defs>/.exec(svg)?.[1] ?? ''
  for (const m of defsBody.matchAll(/<g id="([^"]+)">([\s\S]*?)<\/g>/g)) {
    const shapes: Shape[] = []
    for (const el of m[2].matchAll(/<(path|circle)\s[^>]*\/>/g)) {
      const tag = el[0]
      if (el[1] === 'path') {
        const d = attr(tag, 'd') ?? ''
        if (attr(tag, 'stroke') === 'none') continue // 칸 바탕
        shapes.push({ t: 'poly', p: polyPoints(d).map(([x, y]) => [x / cell, y / cell] as [number, number]) })
      } else {
        const c: [number, number] = [Number(attr(tag, 'cx')) / cell, Number(attr(tag, 'cy')) / cell]
        const r = Number(attr(tag, 'r')) / cell
        shapes.push(attr(tag, 'stroke') === 'none' ? { t: 'dot', c, r } : { t: 'circle', c, r })
      }
    }
    const id = classify(shapes)
    if (!id) throw new Error(`defs의 ${m[1]} 모양이 어떤 기호와도 맞지 않습니다`)
    defs.set(m[1], id)
  }

  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/, '')

  let uses = 0
  for (const m of body.matchAll(/<use\s[^>]*\/>/g)) {
    const id = (attr(m[0], 'href') ?? '').replace(/^#/, '')
    const s = defs.get(id)
    if (!s) throw new Error(`use가 가리키는 ${id} 가 defs에 없습니다`)
    glyphs.push({ s, x: Number(attr(m[0], 'x')), y: Number(attr(m[0], 'y')) })
    uses++
  }

  // 점선: 조각마다 점선이 새로 시작합니다. 켜진 구간 하나가 칸 하나의 선입니다.
  let dashRuns = 0
  for (const m of body.matchAll(/<path\s[^>]*stroke-dasharray="([^"]+)"[^>]*\/>/g)) {
    const [on, off] = m[1].split(/[\s,]+/).map(Number)
    const period = on + off
    const d = attr(m[0], 'd') ?? ''
    let used = 0
    for (const sub of d.matchAll(/M(-?[\d.]+),(-?[\d.]+)([vh])(-?[\d.]+)/g)) {
      used += sub[0].length
      dashRuns++
      const x0 = +sub[1]
      const y0 = +sub[2]
      const dir = sub[3] as 'v' | 'h'
      const len = +sub[4]
      const n = Math.round((len - on) / period) + 1
      if (n < 1 || !near((n - 1) * period + on, len, 0.011)) throw new Error(`점선 길이가 칸에 맞지 않습니다: ${sub[0]} (${m[1]})`)
      for (let i = 0; i < n; i++) {
        const sx = dir === 'h' ? x0 + i * period : x0
        const sy = dir === 'v' ? y0 + i * period : y0
        const ex = dir === 'h' ? sx + on : sx
        const ey = dir === 'v' ? sy + on : sy
        // 선이 놓인 칸의 왼쪽 위를 0으로 본 좌표로 바꿔 기호를 알아냅니다.
        let found: Glyph | null = null
        for (const id of KNIT_SYMBOLS) {
          const prims = SYMBOLS[id].prims
          if (prims.length !== 1 || prims[0].t !== 'poly' || prims[0].p.length !== 2) continue
          const [a, b] = prims[0].p
          const ox = sx - Math.min(a[0], b[0]) * cell
          const oy = sy - Math.min(a[1], b[1]) * cell
          const shape: Shape = { t: 'poly', p: [[(sx - ox) / cell, (sy - oy) / cell], [(ex - ox) / cell, (ey - oy) / cell]] }
          const flipped: Shape = { t: 'poly', p: [shape.p[1], shape.p[0]] }
          if (samePrim(shape, prims[0]) || samePrim(flipped, prims[0])) {
            found = { s: id, x: ox, y: oy }
            break
          }
        }
        if (!found) throw new Error(`점선 조각이 어떤 기호와도 맞지 않습니다: ${sub[0]}`)
        glyphs.push(found)
      }
    }
    if (used !== d.length) throw new Error('점선 path에 읽지 못한 조각이 있습니다')
  }

  const pathOf = (cls: string) => {
    const tag = new RegExp(`<path class="${cls}"[^>]*/>`).exec(body)?.[0]
    return tag ? rectsOf(attr(tag, 'd') ?? '') : []
  }
  const none = pathOf('sc-none').flatMap((r) => unitSquares(r, cell))
  return { glyphs, none, estimated: pathOf('sc-estimated'), uses, dashRuns }
}
