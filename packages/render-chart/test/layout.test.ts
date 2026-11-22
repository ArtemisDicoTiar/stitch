/** 자리 계산: 칸 좌표와 눌린 칸 찾기가 서로 맞는지 */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { garterScarf, practiceHood } from '@stitch/fixtures'
import { chartLayout } from '../src'

const hood = expand(practiceHood)
const scarf = expand(garterScarf)

describe('chartLayout', () => {
  const layout = chartLayout(hood)

  it('전체 크기 안에 모든 격자가 들어간다', () => {
    expect(layout.cell).toBe(12)
    expect(Number.isInteger(layout.width)).toBe(true)
    expect(Number.isInteger(layout.height)).toBe(true)
    for (const b of layout.blocks) {
      expect(b.x).toBeGreaterThan(0)
      expect(b.y).toBeGreaterThan(0)
      expect(b.x + b.w).toBeLessThan(layout.width)
      expect(b.y + b.h).toBeLessThan(layout.height)
      expect(b.w).toBe(b.W * 12)
      expect(b.h).toBe(b.rows * 12)
    }
  })

  it('뒤에 뜨는 격자가 위에 놓이고 서로 겹치지 않는다', () => {
    expect(layout.blocks.length).toBe(hood.blocks.length)
    for (let i = 1; i < layout.blocks.length; i++) {
      expect(layout.blocks[i].y + layout.blocks[i].h).toBeLessThanOrEqual(layout.blocks[i - 1].y)
    }
  })

  it('폭이 다른 격자는 가운데를 맞춘다 (프로토타입의 반 칸 밀기와 같은 규칙)', () => {
    const maxW = Math.max(...hood.blocks.map((b) => b.W))
    const centers = layout.blocks.map((b) => b.x + b.w / 2)
    for (const c of centers) expect(c).toBeCloseTo(centers[0], 9)
    for (const b of layout.blocks) {
      expect(b.shift).toBe((maxW - b.W) / 2)
      expect(b.x).toBe(layout.grid.x + b.shift * 12)
    }
  })

  it('단은 아래에서 위로 쌓인다', () => {
    for (const block of hood.blocks) {
      for (let i = 1; i < block.rows.length; i++) {
        const below = layout.rowRect(block.rows[i - 1].g)!
        const above = layout.rowRect(block.rows[i].g)!
        expect(above.y).toBe(below.y - 12)
      }
    }
  })

  it('x가 0인 기둥이 왼쪽 끝이다', () => {
    for (const block of hood.blocks) {
      const g = block.rows[0].g
      const b = layout.blocks[hood.blocks.indexOf(block)]
      expect(layout.rectOf(g, 0)!.x).toBe(b.x)
      expect(layout.rectOf(g, block.W - 1)!.x).toBe(b.x + (block.W - 1) * 12)
      expect(layout.rectOf(g, block.W)).toBeNull()
      expect(layout.rectOf(g, -1)).toBeNull()
      expect(layout.rectOf(g, 0.5)).toBeNull()
    }
    expect(layout.rectOf(0, 0)).toBeNull()
    expect(layout.rectOf(hood.totalRows + 1, 0)).toBeNull()
  })
})

describe('rectOf 와 cellAt 이 서로 맞는다', () => {
  for (const [name, expanded, opts] of [
    ['연습용 후드', hood, {}],
    ['가터 목도리', scarf, {}],
    ['연습용 후드, 칸 17', hood, { cell: 17, sections: false }],
  ] as const) {
    it(`${name}: 모든 코`, () => {
      const layout = chartLayout(expanded, opts)
      const cs = layout.cell
      let n = 0
      for (const block of expanded.blocks) {
        for (const row of block.rows) {
          for (const c of row.cells) {
            const r = layout.rectOf(row.g, c.x)!
            const want = { g: row.g, x: c.x, k: c.k }
            // 가운데, 왼쪽 위 모서리(포함), 오른쪽 아래 모서리 바로 안쪽
            expect(layout.cellAt(r.x + cs / 2, r.y + cs / 2)).toEqual(want)
            expect(layout.cellAt(r.x, r.y)).toEqual(want)
            expect(layout.cellAt(r.x + cs - 0.01, r.y + cs - 0.01)).toEqual(want)
            expect(layout.cellOf(row.g, c.x)).toBe(c)
            expect(layout.cellByOrder(row.g, c.k)).toBe(c)
            n++
          }
        }
      }
      expect(n).toBe(expanded.totalStitches)
    })
  }

  it('코가 없는 칸은 자리는 있지만 cellAt 은 null', () => {
    const layout = chartLayout(hood)
    let empty = 0
    for (const block of hood.blocks) {
      for (const row of block.rows) {
        const live = new Set(row.cells.map((c) => c.x))
        for (let x = 0; x < block.W; x++) {
          if (live.has(x)) continue
          const r = layout.rectOf(row.g, x)!
          expect(layout.cellAt(r.x + 6, r.y + 6)).toBeNull()
          expect(layout.slotAt(r.x + 6, r.y + 6)).toEqual({ g: row.g, x, block: hood.blocks.indexOf(block) })
          expect(layout.cellOf(row.g, x)).toBeNull()
          empty++
        }
      }
    }
    expect(empty).toBe(hood.blocks.reduce((a, b) => a + b.W * b.rows.length, 0) - hood.totalStitches)
  })

  it('격자 밖은 null', () => {
    const layout = chartLayout(hood)
    expect(layout.cellAt(-5, -5)).toBeNull()
    expect(layout.cellAt(layout.width + 1, layout.height + 1)).toBeNull()
    for (const b of layout.blocks) {
      expect(layout.slotAt(b.x - 0.01, b.y + 1)).toBeNull()
      expect(layout.slotAt(b.x + b.w, b.y + 1)).toBeNull()
      expect(layout.slotAt(b.x + 1, b.y - 0.01)?.block ?? -1).not.toBe(b.index)
      expect(layout.slotAt(b.x + 1, b.y + b.h)?.block ?? -1).not.toBe(b.index)
    }
    // 격자 사이의 틈
    const [lower, upper] = layout.blocks
    expect(layout.slotAt(upper.x + 30, (upper.y + upper.h + lower.y) / 2)).toBeNull()
  })

  it('구간과 추정 단의 세로 범위가 단 자리와 맞는다', () => {
    const layout = chartLayout(hood)
    expect(layout.sections.map((s) => [s.id, s.firstRow, s.lastRow])).toEqual(hood.sections.map((s) => [s.id, s.firstRow, s.lastRow]))
    for (const s of layout.sections) {
      expect(s.y1).toBe(layout.rowRect(s.lastRow)!.y)
      expect(s.y2).toBe(layout.rowRect(s.firstRow)!.y + 12)
    }
    const rows = hood.blocks.flatMap((b) => b.rows)
    expect(layout.estimated.reduce((a, e) => a + e.rows, 0)).toBe(rows.filter((r) => r.estimated).length)
    for (const e of layout.estimated) {
      expect(e.y1).toBe(layout.rowRect(e.lastRow)!.y)
      expect(e.y2).toBe(layout.rowRect(e.firstRow)!.y + 12)
    }
  })
})
