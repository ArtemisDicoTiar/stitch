/** 도안 위에 얹는 표시: 진행 상황, 단수링, 칸 옮기기 */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { practiceHood } from '@stitch/fixtures'
import type { Progress } from '@stitch/pattern-ir'
import { cellOutlineSvg, chartLayout, moveCursor, progressOverlaySvg, ringsOverlaySvg, selectionCell, workingPosition } from '../src'
import { at, attr, rectsOf, unitSquares } from './decode'

const hood = expand(practiceHood)
const layout = chartLayout(hood)
const rows = hood.blocks.flatMap((b) => b.rows)
const slots = hood.blocks.reduce((a, b) => a + b.W * b.rows.length, 0)

/** 옅게 덮인 칸들 */
function veiled(p: Progress | null): Set<string> {
  const svg = progressOverlaySvg(layout, p)
  const tag = /<path class="sc-veil"[^>]*\/>/.exec(svg)?.[0]
  const out = new Set<string>()
  if (!tag) return out
  expect(attr(tag, 'fill')).toBe('#fffdf9')
  expect(attr(tag, 'fill-opacity')).toBe('0.66')
  for (const r of rectsOf(attr(tag, 'd') ?? '')) {
    for (const u of unitSquares(r, 12)) {
      const key = at(u.x, u.y)
      expect(out.has(key), '같은 칸을 두 번 덮지 않는다').toBe(false)
      out.add(key)
    }
  }
  return out
}

describe('진행 표시', () => {
  it('뜬 코는 그대로, 안 뜬 코는 옅게 덮는다', () => {
    const cases: Progress[] = [
      { row: 0, stitch: 0 },
      { row: 1, stitch: 0 },
      { row: 1, stitch: 1 },
      { row: 9, stitch: 40 },
      { row: 10, stitch: rows[9].cells.length },
      { row: 21, stitch: 47 },
      { row: 22, stitch: 5 },
      { row: 80, stitch: 45 },
      { row: hood.totalRows, stitch: 3 },
    ]
    for (const p of cases) {
      const covered = veiled(p)
      for (const row of rows) {
        for (const c of row.cells) {
          const r = layout.rectOf(row.g, c.x)!
          const done = row.g < p.row || (row.g === p.row && c.k < p.stitch)
          expect(covered.has(at(r.x, r.y)), `${p.row}단 ${p.stitch}코일 때 ${row.g}단 ${c.k}번째`).toBe(!done)
        }
      }
    }
  })

  it('아직 안 뜬 단은 코 없음 칸까지 통째로 덮는다', () => {
    expect(veiled({ row: 0, stitch: 0 }).size).toBe(slots)
    const p = { row: 30, stitch: 0 }
    const covered = veiled(p)
    for (const block of hood.blocks) {
      for (const row of block.rows) {
        for (let x = 0; x < block.W; x++) {
          const r = layout.rectOf(row.g, x)!
          expect(covered.has(at(r.x, r.y))).toBe(row.g >= 30)
        }
      }
    }
  })

  it('다 떴으면 아무것도 덮지 않고 표시도 없다', () => {
    const last = rows[rows.length - 1]
    const done = { row: hood.totalRows, stitch: last.cells.length }
    expect(veiled(done).size).toBe(0)
    expect(progressOverlaySvg(layout, done)).toBe('')
    expect(progressOverlaySvg(layout, { row: hood.totalRows + 5, stitch: 0 })).toBe('')
    expect(progressOverlaySvg(layout, null)).toBe('')
  })

  it('지금 뜰 단에 테두리를, 다음에 뜰 코에 동그라미와 글씨를 둔다', () => {
    const p = { row: 21, stitch: 47 }
    const svg = progressOverlaySvg(layout, p)
    const band = layout.rowRect(21)!
    const rowTag = /<rect class="sc-now-row"[^>]*\/>/.exec(svg)![0]
    expect(Number(attr(rowTag, 'x'))).toBe(band.x - 1)
    expect(Number(attr(rowTag, 'y'))).toBe(band.y - 1)
    expect(Number(attr(rowTag, 'width'))).toBe(band.w + 2)
    expect(attr(rowTag, 'stroke')).toBe('#e8590c')

    const next = rows[20].cells.find((c) => c.k === 47)!
    const cell = layout.rectOf(21, next.x)!
    const dot = /<circle class="sc-now"[^>]*\/>/.exec(svg)![0]
    expect(Number(attr(dot, 'cx'))).toBe(cell.x + 6)
    expect(Number(attr(dot, 'cy'))).toBe(cell.y + 6)
    expect(svg).toContain('>지금 여기</text>')
  })

  it('단을 다 떴으면 다음 단의 첫 코가 지금 뜰 자리', () => {
    expect(workingPosition(layout, { row: 0, stitch: 0 })).toEqual({ row: 1, k: 0 })
    expect(workingPosition(layout, { row: 5, stitch: 0 })).toEqual({ row: 5, k: 0 })
    expect(workingPosition(layout, { row: 5, stitch: 12 })).toEqual({ row: 5, k: 12 })
    expect(workingPosition(layout, { row: 5, stitch: rows[4].cells.length })).toEqual({ row: 6, k: 0 })
    expect(workingPosition(layout, { row: 5, stitch: 9999 })).toEqual({ row: 6, k: 0 })
    expect(workingPosition(layout, { row: hood.totalRows, stitch: rows[rows.length - 1].cells.length })).toBeNull()

    // 격자가 바뀌는 자리에서도 다음 단으로 넘어간다
    const edge = hood.blocks[0].rows[hood.blocks[0].rows.length - 1]
    const svg = progressOverlaySvg(layout, { row: edge.g, stitch: edge.cells.length })
    const band = layout.rowRect(edge.g + 1)!
    expect(Number(attr(/<rect class="sc-now-row"[^>]*\/>/.exec(svg)![0], 'y'))).toBe(band.y - 1)
  })
})

describe('단수링과 고른 칸', () => {
  it('단수링을 (단, x) 칸 가운데에 그린다', () => {
    const svg = ringsOverlaySvg(layout, [
      { row: 12, x: 30, color: '#e8590c', name: '여기서 길이 재기' },
      { row: 40, x: 3, color: '#1f6fd1' },
      { row: 9999, x: 0, color: '#000' },
      { row: 12, x: 9999, color: '#000' },
    ])
    const circles = [...svg.matchAll(/<circle class="sc-ring"[^>]*\/>/g)].map((m) => m[0])
    expect(circles.length).toBe(2)
    const a = layout.rectOf(12, 30)!
    expect(Number(attr(circles[0], 'cx'))).toBe(a.x + 6)
    expect(Number(attr(circles[0], 'cy'))).toBe(a.y + 6)
    expect(attr(circles[0], 'stroke')).toBe('#e8590c')
    expect(attr(circles[1], 'stroke')).toBe('#1f6fd1')
    expect(svg).toContain('>여기서 길이 재기</text>')
    expect(svg).toContain('>단수링</text>')
    expect(ringsOverlaySvg(layout, [])).toBe('')
  })

  it('색과 이름에 든 특수 문자를 그대로 넣지 않는다', () => {
    const svg = ringsOverlaySvg(layout, [{ row: 1, x: 0, color: '"><script>', name: '<i>&' }])
    expect(svg).not.toContain('<script>')
    expect(svg).not.toContain('<i>')
    expect(svg).toContain('&lt;i&gt;&amp;')
  })

  it('고른 칸: stitch 는 그 단에서 뜨는 순서 (1부터)', () => {
    const row = rows[20]
    const c = row.cells[4]
    expect(selectionCell(layout, { row: 21, stitch: 5 })).toEqual({ g: 21, x: c.x, k: 4 })
    expect(selectionCell(layout, { row: 21, stitch: 0 })).toEqual({ g: 21, x: row.cells[0].x, k: 0 })
    expect(selectionCell(layout, { row: 21, stitch: 9999 })?.k).toBe(row.cells.length - 1)
    expect(selectionCell(layout, { row: 9999, stitch: 1 })).toBeNull()
    expect(selectionCell(layout, null)).toBeNull()

    const r = layout.rectOf(21, c.x)!
    const outline = cellOutlineSvg(layout, 21, c.x, '#1f6fd1', 2.6)
    expect(Number(attr(outline, 'x'))).toBe(r.x - 0.5)
    expect(Number(attr(outline, 'width'))).toBe(13)
    expect(cellOutlineSvg(layout, 9999, 0, '#000', 1)).toBe('')
  })
})

describe('키보드로 칸 옮기기', () => {
  it('좌우: 같은 단에서 코가 없는 칸을 건너 가장 가까운 코로', () => {
    // 21단은 가운데에 코 없는 칸이 있다
    const row = rows[20]
    const xs = row.cells.map((c) => c.x).sort((a, b) => a - b)
    for (let i = 0; i < xs.length; i++) {
      const left = moveCursor(layout, { g: 21, x: xs[i] }, 'left')!
      const right = moveCursor(layout, { g: 21, x: xs[i] }, 'right')!
      expect(left.x).toBe(i > 0 ? xs[i - 1] : xs[0])
      expect(right.x).toBe(i < xs.length - 1 ? xs[i + 1] : xs[xs.length - 1])
      expect(left.g).toBe(21)
      expect(layout.cellOf(21, left.x)!.k).toBe(left.k)
    }
    expect(xs.some((x, i) => i > 0 && x - xs[i - 1] > 1)).toBe(true)
    expect(moveCursor(layout, { g: 21, x: xs[10] }, 'home')!.x).toBe(xs[0])
    expect(moveCursor(layout, { g: 21, x: xs[10] }, 'end')!.x).toBe(xs[xs.length - 1])
  })

  it('위아래: 윗단과 아랫단에서 가로 위치가 가장 가까운 코로', () => {
    const up = moveCursor(layout, { g: 30, x: 20 }, 'up')!
    expect(up).toEqual({ g: 31, x: 20, k: layout.cellOf(31, 20)!.k })
    expect(moveCursor(layout, { g: 30, x: 20 }, 'down')!.g).toBe(29)
    expect(moveCursor(layout, { g: 1, x: 20 }, 'down')).toEqual({ g: 1, x: 20, k: layout.cellOf(1, 20)!.k })
    expect(moveCursor(layout, { g: hood.totalRows, x: 20 }, 'up')!.g).toBe(hood.totalRows)
    expect(moveCursor(layout, { g: 30, x: 20 }, 'pageup')!.g).toBe(40)
    expect(moveCursor(layout, { g: 30, x: 20 }, 'pagedown')!.g).toBe(20)
    expect(moveCursor(layout, { g: 3, x: 20 }, 'pagedown')!.g).toBe(1)
  })

  it('격자가 바뀌는 자리에서는 화면에서 가장 가까운 칸으로 간다', () => {
    const [lower, upper] = hood.blocks
    const from = lower.rows[lower.rows.length - 1]
    const x = from.cells[Math.floor(from.cells.length / 2)].x
    const to = moveCursor(layout, { g: from.g, x }, 'up')!
    expect(to.g).toBe(upper.rows[0].g)
    const a = layout.rectOf(from.g, x)!
    const b = layout.rectOf(to.g, to.x)!
    const nearest = Math.min(...upper.rows[0].cells.map((c) => Math.abs(layout.rectOf(to.g, c.x)!.x - a.x)))
    expect(Math.abs(b.x - a.x)).toBe(nearest)
    expect(moveCursor(layout, { g: to.g, x: to.x }, 'down')!.g).toBe(from.g)
  })

  it('없는 칸에서는 움직이지 않는다', () => {
    expect(moveCursor(layout, { g: 9999, x: 0 }, 'left')).toBeNull()
  })
})
