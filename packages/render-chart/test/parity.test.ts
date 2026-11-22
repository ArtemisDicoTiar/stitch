/**
 * 프로토타입 도안과 칸 단위 비교.
 * 실제 도안에서 나온 자료는 private/ 와 prototype/ 에만 있어서, 그 폴더가 없으면 건너뜁니다.
 * 읽은 내용은 비교에만 쓰고 스냅샷이나 파일로 남기지 않습니다.
 *
 * 프로토타입 SVG(chart.svg)를 좌표만 보고 "격자, 아래에서 몇째 단, 왼쪽에서 몇째 칸, 기호"로 읽고,
 * 우리 SVG도 같은 방식으로 읽어서 모든 칸이 같은지 봅니다.
 */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { KNIT_SYMBOLS, type SymbolId } from '@stitch/pattern-ir'
import { SYMBOLS, chartLayout, renderChartSvg } from '../src'
import { attr, classify, decodeChartSvg, polyPoints, type Shape } from './decode'
import { loadBalaclava, loadOracle, loadPrototypeChart, loadPrototypeSymbols } from './private'

const pattern = loadBalaclava()
const oracle = loadOracle()
const prototypeSvg = loadPrototypeChart()
const prototypeSymbols = loadPrototypeSymbols()

type CellMap = Map<string, SymbolId | 'NONE'>

/**
 * 건너뛰는 describe 도 본문은 실행되므로(테스트 목록을 모으느라), 자료를 읽어 계산하는 일은
 * 본문에 바로 두지 않고 테스트가 실제로 돌 때 한 번만 하도록 미룹니다.
 */
function lazy<T>(make: () => T): () => T {
  let value: { v: T } | null = null
  return () => (value ??= { v: make() }).v
}
const key = (block: number, rowFromBottom: number, col: number) => `${block}:${rowFromBottom}:${col}`

/** 우리가 그린 SVG를 격자 좌표로 읽습니다. 같은 칸에 둘 이상 그려졌으면 오류 */
function readOurs(svg: string, layout: ReturnType<typeof chartLayout>): CellMap {
  const decoded = decodeChartSvg(svg, layout.cell)
  const map: CellMap = new Map()
  const put = (x: number, y: number, s: SymbolId | 'NONE') => {
    const slot = layout.slotAt(x + layout.cell / 2, y + layout.cell / 2)
    if (!slot) throw new Error('격자 밖에 그려진 칸이 있습니다')
    const origin = layout.rectOf(slot.g, slot.x)!
    if (Math.abs(origin.x - x) > 0.011 || Math.abs(origin.y - y) > 0.011) throw new Error('칸 자리에서 벗어난 기호가 있습니다')
    const block = layout.expanded.blocks[slot.block]
    const k = key(slot.block, slot.g - block.rows[0].g, slot.x)
    if (map.has(k)) throw new Error('같은 칸에 두 번 그렸습니다')
    map.set(k, s)
  }
  for (const g of decoded.glyphs) put(g.x, g.y, g.s)
  for (const n of decoded.none) put(n.x, n.y, 'NONE')
  return map
}

type Frame = { x: number; y: number; w: number; h: number }

/**
 * 프로토타입 SVG를 격자 좌표로 읽습니다.
 * 격자의 자리와 크기는 격자 테두리 사각형에서, 칸 안의 기호는 칸 기호 굵기(1.05)로 그린 도형에서 얻습니다.
 * 범례(굵기 1.8)와 맨 위의 코막음 줄(속이 찬 점)은 이 굵기가 아니라서 들어오지 않습니다.
 */
function readPrototype(svg: string, blocks: { W: number; rows: number }[]): { map: CellMap; cell: number; frames: Frame[] } {
  const frames: Frame[] = []
  for (const m of svg.matchAll(/<rect\s[^>]*\/>/g)) {
    const tag = m[0]
    if (attr(tag, 'fill') === 'none' && attr(tag, 'stroke') === '#333' && attr(tag, 'stroke-width') === '1.4') {
      frames.push({ x: Number(attr(tag, 'x')), y: Number(attr(tag, 'y')), w: Number(attr(tag, 'width')), h: Number(attr(tag, 'height')) })
    }
  }
  if (frames.length !== blocks.length) throw new Error(`격자 테두리 ${frames.length}개, 격자 ${blocks.length}개`)
  const cell = frames[0].w / blocks[0].W
  frames.forEach((f, i) => {
    if (Math.abs(f.w - blocks[i].W * cell) > 0.06 || Math.abs(f.h - blocks[i].rows * cell) > 0.06) throw new Error(`${i}번째 격자의 크기가 다릅니다`)
  })

  const locate = (px: number, py: number) => {
    for (let b = 0; b < frames.length; b++) {
      const f = frames[b]
      if (px < f.x || px >= f.x + f.w || py < f.y || py >= f.y + f.h) continue
      const col = Math.floor((px - f.x) / cell)
      const fromTop = Math.floor((py - f.y) / cell)
      return { block: b, col, fromTop, ox: f.x + col * cell, oy: f.y + fromTop * cell }
    }
    return null
  }

  // 칸마다 그 안의 도형을 그린 순서대로 모읍니다.
  const shapes = new Map<string, Shape[]>()
  const add = (px: number, py: number, make: (ox: number, oy: number) => Shape) => {
    const at = locate(px, py)
    if (!at) throw new Error('격자 밖에 칸 기호 굵기의 도형이 있습니다')
    const k = key(at.block, blocks[at.block].rows - 1 - at.fromTop, at.col)
    const list = shapes.get(k)
    const shape = make(at.ox, at.oy)
    if (list) list.push(shape)
    else shapes.set(k, [shape])
  }
  for (const m of svg.matchAll(/<(path|ellipse)\s[^>]*\/>/g)) {
    const tag = m[0]
    if (attr(tag, 'stroke-width') !== '1.05') continue
    if (m[1] === 'path') {
      const pts = polyPoints(attr(tag, 'd') ?? '')
      add(pts[0][0], pts[0][1], (ox, oy) => ({ t: 'poly', p: pts.map(([x, y]) => [(x - ox) / cell, (y - oy) / cell] as [number, number]) }))
    } else {
      const cx = Number(attr(tag, 'cx'))
      const cy = Number(attr(tag, 'cy'))
      const r = Number(attr(tag, 'rx')) / cell
      add(cx, cy, (ox, oy) => ({ t: attr(tag, 'fill') === 'none' ? 'circle' : 'dot', c: [(cx - ox) / cell, (cy - oy) / cell], r }))
    }
  }

  const map: CellMap = new Map()
  for (const [k, list] of shapes) {
    const s = classify(list)
    if (!s) throw new Error('프로토타입의 칸 모양이 어떤 기호와도 맞지 않습니다')
    map.set(k, s)
  }
  // 코 없음: 칸 크기의 회색 사각형
  for (const m of svg.matchAll(/<rect\s[^>]*\/>/g)) {
    const tag = m[0]
    if (attr(tag, 'fill') !== '#d0d0d0' || Math.abs(Number(attr(tag, 'width')) - cell) > 0.06) continue
    const at = locate(Number(attr(tag, 'x')) + cell / 2, Number(attr(tag, 'y')) + cell / 2)
    if (!at) continue // 범례의 견본
    const k = key(at.block, blocks[at.block].rows - 1 - at.fromTop, at.col)
    if (map.has(k)) throw new Error('프로토타입에서 코 없음 칸에 기호가 겹칩니다')
    map.set(k, 'NONE')
  }
  return { map, cell, frames }
}

function differences(a: CellMap, b: CellMap): string[] {
  const out: string[] = []
  for (const [k, s] of a) if (b.get(k) !== s) out.push(`${k}: ${s} / ${b.get(k) ?? '없음'}`)
  for (const k of b.keys()) if (!a.has(k)) out.push(`${k}: 없음 / ${b.get(k)}`)
  return out
}

describe.skipIf(!pattern || !prototypeSvg)('프로토타입 도안(chart.svg)과 칸 단위로 일치', () => {
  const setup = lazy(() => {
    const expanded = expand(pattern!)
    const layout = chartLayout(expanded)
    const svg = renderChartSvg(expanded)
    const ours = readOurs(svg, layout)
    const dims = expanded.blocks.map((b) => ({ W: b.W, rows: b.rows.length }))
    const proto = readPrototype(prototypeSvg!, dims)
    const slots = dims.reduce((a, b) => a + b.W * b.rows, 0)
    return { layout, svg, ours, dims, proto, slots }
  })

  it('두 그림 모두 격자의 모든 칸을 빠짐없이 채운다', () => {
    const { ours, proto, slots } = setup()
    expect(ours.size).toBe(slots)
    expect(proto.map.size).toBe(slots)
  })

  it('모든 단의 모든 칸에 같은 기호(또는 코 없음)가 있다', () => {
    const { ours, proto } = setup()
    const diff = differences(proto.map, ours)
    expect(diff.length, diff.slice(0, 5).join(' | ')).toBe(0)
  })

  it('기호별 칸 수가 같다', () => {
    const { ours, proto } = setup()
    const tally = (m: CellMap) => {
      const t: Record<string, number> = {}
      for (const s of m.values()) t[s] = (t[s] ?? 0) + 1
      return t
    }
    expect(tally(ours)).toEqual(tally(proto.map))
    expect(Object.keys(tally(ours)).length).toBeGreaterThan(5)
  })

  it('격자의 놓임새가 같다: 뒤 격자가 위, 좁은 격자는 가운데 맞춤, 칸 크기 12', () => {
    const { layout, proto, dims } = setup()
    expect(proto.cell).toBeCloseTo(layout.cell, 6)
    const ourCenters = layout.blocks.map((b) => b.x + b.w / 2 - layout.grid.x)
    const protoLeft = Math.min(...proto.frames.map((f) => f.x))
    const protoCenters = proto.frames.map((f) => f.x + f.w / 2 - protoLeft)
    ourCenters.forEach((c, i) => expect(c).toBeCloseTo(protoCenters[i], 6))
    for (let i = 1; i < dims.length; i++) {
      expect(layout.blocks[i].y).toBeLessThan(layout.blocks[i - 1].y)
      expect(proto.frames[i].y).toBeLessThan(proto.frames[i - 1].y)
    }
  })

  it('프로토타입(약 1.9MB)보다 훨씬 작다', () => {
    const size = Buffer.byteLength(setup().svg, 'utf8')
    expect(size).toBeLessThan(60_000)
    expect(size).toBeLessThan(Buffer.byteLength(prototypeSvg!, 'utf8') / 20)
  })
})

describe.skipIf(!pattern || !oracle)('프로토타입이 펼친 결과(pattern.json)와 칸 단위로 일치', () => {
  const setup = lazy(() => {
    const expanded = expand(pattern!)
    const layout = chartLayout(expanded)
    return { expanded, layout, ours: readOurs(renderChartSvg(expanded), layout) }
  })

  it('모든 단에서 같은 칸에 같은 기호를 그린다', () => {
    const { ours } = setup()
    const want: CellMap = new Map()
    oracle!.blocks.forEach((b, bi) => {
      b.rows.forEach((row, ri) => {
        for (let x = 0; x < b.W; x++) want.set(key(bi, ri, x), 'NONE')
        for (const c of row.cells) want.set(key(bi, ri, c.x), c.s as SymbolId)
      })
    })
    const diff = differences(want, ours)
    expect(diff.length, diff.slice(0, 5).join(' | ')).toBe(0)
    expect(ours.size).toBe(want.size)
  })

  it('눌린 칸 찾기가 프로토타입의 칸과 맞는다', () => {
    const { expanded, layout } = setup()
    let n = 0
    oracle!.blocks.forEach((b) => {
      for (const row of b.rows) {
        for (const c of row.cells) {
          const r = layout.rectOf(row.g, c.x)!
          expect(layout.cellAt(r.x + 6, r.y + 6)).toEqual({ g: row.g, x: c.x, k: c.k })
          n++
        }
      }
    })
    expect(n).toBe(expanded.totalStitches)
  })
})

describe.skipIf(!prototypeSymbols)('프로토타입의 기호 모양(symbols.json)과 일치', () => {
  it('기호 10가지의 바탕색과 모양이 같다', () => {
    expect(Object.keys(prototypeSymbols!).sort()).toEqual([...KNIT_SYMBOLS].sort())
    for (const id of KNIT_SYMBOLS) {
      const want = prototypeSymbols![id]
      const got = SYMBOLS[id]
      expect(got.bg, id).toBe(want.bg)
      expect(got.prims.length, id).toBe(want.prims.length)
      got.prims.forEach((p, i) => {
        const w = want.prims[i] as { t: string; p?: number[][]; c?: number[]; r?: number }
        expect(p.t, id).toBe(w.t)
        if (p.t === 'poly') {
          expect(p.p.length, id).toBe(w.p!.length)
          p.p.forEach((pt, j) => {
            expect(pt[0]).toBeCloseTo(w.p![j][0], 12)
            expect(pt[1]).toBeCloseTo(w.p![j][1], 12)
          })
        } else {
          expect(p.c[0]).toBeCloseTo(w.c![0], 12)
          expect(p.c[1]).toBeCloseTo(w.c![1], 12)
          expect(p.r).toBeCloseTo(w.r!, 12)
        }
      })
    }
  })
})
