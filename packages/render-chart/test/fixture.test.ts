/**
 * 저장소의 연습 도안으로 기호 도안 SVG를 확인합니다.
 * 스냅샷은 @stitch/fixtures 의 도안에서만 만듭니다.
 */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { garterScarf, practiceBall, practiceHood } from '@stitch/fixtures'
import { CROCHET_SYMBOLS, KNIT_SYMBOLS, type Expanded } from '@stitch/pattern-ir'
import { SYMBOLS, SYMBOL_ORDER, chartLayout, renderChartSvg, symbolOrder, symbolSvg } from '../src'
import { at, attr, decodeChartSvg, type Glyph } from './decode'

function index<T extends { x: number; y: number }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const key = at(it.x, it.y)
    const list = map.get(key)
    if (list) list.push(it)
    else map.set(key, [it])
  }
  return map
}

/** 모든 칸이 rectOf 자리에 한 번씩, 맞는 기호로 있는지 */
function checkStructure(expanded: Expanded, opts: Parameters<typeof renderChartSvg>[1] = {}) {
  const layout = chartLayout(expanded, opts)
  const svg = renderChartSvg(expanded, opts)
  const decoded = decodeChartSvg(svg, layout.cell)
  const glyphs = index<Glyph>(decoded.glyphs)
  const none = index(decoded.none)

  let cells = 0
  let empty = 0
  const wrong: string[] = []
  for (const block of expanded.blocks) {
    for (const row of block.rows) {
      const live = new Map(row.cells.map((c) => [c.x, c]))
      for (let x = 0; x < block.W; x++) {
        const rect = layout.rectOf(row.g, x)
        if (!rect) {
          wrong.push(`${row.g}단 ${x}: 자리가 없음`)
          continue
        }
        const key = at(rect.x, rect.y)
        const here = glyphs.get(key) ?? []
        const gap = none.get(key) ?? []
        const cell = live.get(x)
        if (cell) {
          cells++
          if (here.length !== 1 || here[0].s !== cell.s || gap.length !== 0) wrong.push(`${row.g}단 ${x}: ${cell.s} 대신 [${here.map((g) => g.s).join(',')}] 코없음 ${gap.length}`)
        } else {
          empty++
          if (gap.length !== 1 || here.length !== 0) wrong.push(`${row.g}단 ${x}: 코 없음 ${gap.length}개, 기호 [${here.map((g) => g.s).join(',')}]`)
        }
      }
    }
  }
  return { layout, svg, decoded, cells, empty, wrong }
}

describe('연습용 후드: 기호 도안 SVG', () => {
  const expanded = expand(practiceHood)
  const svg = renderChartSvg(expanded)

  it('파일 스냅샷과 같다', async () => {
    await expect(svg).toMatchFileSnapshot('./__snapshots__/practice-hood.svg')
  })

  it('같은 입력이면 글자 하나까지 같다', () => {
    expect(renderChartSvg(expand(practiceHood))).toBe(svg)
  })

  it('모든 코가 rectOf 자리에 한 번씩, 맞는 기호로 그려진다', () => {
    const r = checkStructure(expanded)
    expect(r.wrong).toEqual([])
    expect(r.cells).toBe(expanded.totalStitches)
    // 다른 곳에 남는 기호가 없다
    expect(r.decoded.glyphs.length).toBe(expanded.totalStitches)
  })

  it('코 없음 칸 수 = 폭 × 단 수 − 코 수', () => {
    const r = checkStructure(expanded)
    const slots = expanded.blocks.reduce((a, b) => a + b.W * b.rows.length, 0)
    expect(r.empty).toBe(slots - expanded.totalStitches)
    expect(r.decoded.none.length).toBe(slots - expanded.totalStitches)
    expect(r.empty).toBeGreaterThan(0)
  })

  it('기호 10가지를 모두 그린다', () => {
    const seen = new Set(decodeChartSvg(svg, 12).glyphs.map((g) => g.s))
    expect([...seen].sort()).toEqual([...KNIT_SYMBOLS].sort())
  })

  it('칸마다 도형을 두지 않아 작다', () => {
    const r = checkStructure(expanded)
    expect(Buffer.byteLength(svg, 'utf8')).toBeLessThan(40_000)
    // 겉뜨기와 안뜨기 8,000여 칸이 점선 몇백 줄로 묶인다
    expect(r.decoded.dashRuns).toBeLessThan(expanded.totalStitches / 8)
    expect((svg.match(/<[a-z]/g) ?? []).length).toBeLessThan(500)
  })

  it('게이지로 추정한 단에 띠를 깐다', () => {
    const r = checkStructure(expanded)
    const rows = expanded.blocks.flatMap((b) => b.rows)
    const estimated = rows.filter((row) => row.estimated)
    expect(estimated.length).toBeGreaterThan(0)
    for (const row of rows) {
      const band = r.layout.rowRect(row.g)!
      const covered = r.decoded.estimated.some((e) => e.x <= band.x && e.x + e.w >= band.x + band.w && e.y <= band.y && e.y + e.h >= band.y + band.h)
      expect(covered, `${row.g}단`).toBe(!!row.estimated)
    }
    expect(svg).toContain(`게이지로 추정 ${estimated.length}단`)
    expect(renderChartSvg(expanded, { estimated: false })).not.toContain('sc-estimated')
  })

  it('단 번호: 겉면 단은 오른쪽, 안면 단은 왼쪽', () => {
    const layout = chartLayout(expanded)
    for (const block of expanded.blocks) {
      for (const row of block.rows) {
        const label = layout.rowLabel(row.g)!
        const band = layout.rowRect(row.g)!
        expect(label.text).toBe(String(row.g))
        if (row.side === 'WS') {
          expect(label.anchor).toBe('end')
          expect(label.x).toBeLessThan(band.x)
        } else {
          expect(label.anchor).toBe('start')
          expect(label.x).toBeGreaterThan(band.x + band.w)
        }
        expect(label.y).toBeGreaterThan(band.y)
        expect(label.y).toBeLessThan(band.y + band.h)
        expect(svg).toContain(`>${row.g}</text>`)
      }
    }
  })

  it('구간 이름과 마커 선이 들어간다', () => {
    for (const s of expanded.sections) expect(svg).toContain(`>${s.name}</text>`)
    expect(svg).toContain('class="sc-markers"')
    expect(renderChartSvg(expanded, { markers: false, sections: false })).not.toMatch(/sc-markers|sc-sections/)
  })

  it('마커 선: 마커 바로 앞 코의 변에 긋고, 같은 구간의 다음 마커 단까지 이어 긋는다', () => {
    const layout = chartLayout(expanded)
    const d = attr(/<path class="sc-markers"[^>]*\/>/.exec(svg)![0], 'd') ?? ''

    // 그려진 선을 단마다의 "격자 왼쪽 끝에서 몇 칸째 변"으로 읽습니다.
    const drawn = new Map<number, number[]>()
    let used = 0
    for (const m of d.matchAll(/M(-?[\d.]+),(-?[\d.]+)v(-?[\d.]+)/g)) {
      used += m[0].length
      const x = +m[1]
      const top = +m[2] + 0.5
      const n = Math.round((+m[3] - 1) / 12)
      expect(n * 12 + 1).toBeCloseTo(+m[3], 6)
      for (let i = 0; i < n; i++) {
        const y = top + i * 12 + 6
        const block = layout.blocks.find((b) => y >= b.y && y < b.y + b.h)!
        const row = expanded.blocks[block.index].rows[block.rows - 1 - Math.floor((y - block.y) / 12)]
        const edge = (x - block.x) / 12
        expect(Number.isInteger(edge)).toBe(true)
        drawn.set(row.g, [...(drawn.get(row.g) ?? []), edge].sort((a, z) => a - z))
      }
    }
    expect(used).toBe(d.length)

    const want = new Map<number, number[]>()
    for (const block of expanded.blocks) {
      let last: (typeof block.rows)[number] | null = null
      for (const row of block.rows) {
        if (!row.markers.length) continue
        // 겉면 단은 오른쪽에서 왼쪽으로 뜨므로 마커는 앞 코의 왼쪽 변, 안면 단은 오른쪽 변
        const edges = row.markers.map((x) => (row.side === 'WS' ? x + 1 : x)).sort((a, z) => a - z)
        if (last && last.sectionId === row.sectionId) for (let g = last.g + 1; g < row.g; g++) want.set(g, want.get(last.g)!)
        want.set(row.g, edges)
        last = row
      }
    }
    expect([...drawn].sort((a, z) => a[0] - z[0])).toEqual([...want].sort((a, z) => a[0] - z[0]))

    // 마커를 다룬 단이 실제로 있고, 그 사이 단이 채워졌는지
    const markerRows = expanded.blocks.flatMap((b) => b.rows).filter((r) => r.markers.length)
    expect(markerRows.length).toBeGreaterThan(3)
    expect(drawn.size).toBeGreaterThan(markerRows.length)
    // 길이로 뜨는 구간(마커를 뺀 뒤)에는 선이 없다
    for (const row of expanded.blocks.flatMap((b) => b.rows)) if (row.estimated) expect(drawn.has(row.g), `${row.g}단`).toBe(false)
  })

  it('칸 크기와 표시를 바꿔도 구조가 맞는다', () => {
    const r = checkStructure(expanded, { cell: 20, rowNumbers: false, columnNumbers: false, counts: false, sections: false, padding: 4 })
    expect(r.wrong).toEqual([])
    expect(r.layout.blocks.every((b) => b.w === b.W * 20 && b.h === b.rows * 20)).toBe(true)
  })

  it('구간 이름의 특수 문자를 그대로 넣지 않는다', () => {
    const risky: Expanded = {
      ...expanded,
      blocks: expanded.blocks.map((b) => ({ ...b, rows: b.rows.map((row) => ({ ...row, section: '<b>&"목"</b>' })) })),
    }
    const out = renderChartSvg(risky)
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;b&gt;&amp;&quot;목&quot;&lt;/b&gt;')
  })
})

describe('가터 목도리: 기호 도안 SVG', () => {
  const expanded = expand(garterScarf)
  const svg = renderChartSvg(expanded)

  it('파일 스냅샷과 같다', async () => {
    await expect(svg).toMatchFileSnapshot('./__snapshots__/garter-scarf.svg')
  })

  it('모든 코가 제자리에 맞는 기호로 그려지고 코 없음 칸은 없다', () => {
    const r = checkStructure(expanded)
    expect(r.wrong).toEqual([])
    expect(r.cells).toBe(expanded.totalStitches)
    expect(r.decoded.glyphs.length).toBe(expanded.totalStitches)
    expect(r.decoded.none.length).toBe(0)
  })

  it('한 단 걸러 나오는 겉뜨기도 점선으로 묶인다', () => {
    const r = checkStructure(expanded)
    expect(r.decoded.dashRuns).toBeLessThan(200)
  })
})

describe('빈 도안', () => {
  it('격자가 없어도 SVG가 나온다', () => {
    const empty: Expanded = { blocks: [], sections: [], totalRows: 0, totalStitches: 0, issues: [] }
    const layout = chartLayout(empty)
    const svg = renderChartSvg(empty)
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg.endsWith('</svg>')).toBe(true)
    expect(layout.width).toBeGreaterThan(0)
    expect(layout.height).toBeGreaterThan(0)
    expect(layout.cellAt(10, 10)).toBeNull()
    expect(layout.rectOf(1, 0)).toBeNull()
  })
})

describe('연습용 코바늘 공: 기호 도안 SVG', () => {
  const expanded = expand(practiceBall)
  const svg = renderChartSvg(expanded)

  it('파일 스냅샷과 같다', async () => {
    await expect(svg).toMatchFileSnapshot('./__snapshots__/practice-ball.svg')
  })

  it('모든 코가 rectOf 자리에 한 번씩, 코바늘 기호로 그려진다', () => {
    const r = checkStructure(expanded)
    expect(r.wrong).toEqual([])
    expect(r.cells).toBe(expanded.totalStitches)
    expect(r.decoded.glyphs.length).toBe(expanded.totalStitches)
    const seen = new Set(r.decoded.glyphs.map((g) => g.s))
    expect([...seen].sort()).toEqual(['SC', 'SC2'])
  })

  it('늘어나기 전과 줄어든 뒤의 자리는 코 없음 칸이다', () => {
    const r = checkStructure(expanded)
    const slots = expanded.blocks.reduce((a, b) => a + b.W * b.rows.length, 0)
    expect(expanded.blocks.map((b) => b.W)).toEqual([30])
    expect(r.empty).toBe(slots - expanded.totalStitches)
  })
})

describe('기호', () => {
  it('대바늘 10가지와 코바늘 9가지 기호에 이름, 바탕색, 모양이 있다', () => {
    expect([...SYMBOL_ORDER].sort()).toEqual([...KNIT_SYMBOLS, ...CROCHET_SYMBOLS].sort())
    expect([...symbolOrder('knit')].sort()).toEqual([...KNIT_SYMBOLS].sort())
    expect([...symbolOrder('crochet')].sort()).toEqual([...CROCHET_SYMBOLS].sort())
    for (const id of SYMBOL_ORDER) {
      const def = SYMBOLS[id]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.en.length).toBeGreaterThan(0)
      expect(def.bg).toMatch(/^#[0-9a-f]{6}$/)
      expect(def.prims.length).toBeGreaterThan(0)
      for (const p of def.prims) {
        const pts = p.t === 'poly' ? p.p : [p.c]
        for (const [x, y] of pts) {
          expect(x).toBeGreaterThanOrEqual(0)
          expect(x).toBeLessThanOrEqual(1)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(y).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('코바늘 기호는 서로 다른 모양이고, 이어진 칸을 점선으로 묶지 않는다', () => {
    const shapes = CROCHET_SYMBOLS.map((id) => JSON.stringify(SYMBOLS[id].prims))
    expect(new Set(shapes).size).toBe(CROCHET_SYMBOLS.length)
    // 한 줄짜리 기호만 점선으로 묶입니다. 짧은뜨기(×)가 묶이면 줄로 뭉개집니다.
    for (const id of CROCHET_SYMBOLS) {
      const p = SYMBOLS[id].prims
      expect(p.length === 1 && p[0].t === 'poly' && p[0].p.length === 2, id).toBe(false)
    }
    // 긴 코는 실을 감은 횟수만큼 빗금이 늘어납니다.
    expect(SYMBOLS.DC.prims.length).toBe(SYMBOLS.HDC.prims.length + 1)
    expect(SYMBOLS.TR.prims.length).toBe(SYMBOLS.HDC.prims.length + 2)
  })

  it('모양: 겉뜨기는 세로선, 안뜨기는 가로선, 줄임과 늘림은 좌우가 서로 거울상', () => {
    const lines = (id: (typeof KNIT_SYMBOLS)[number]) => SYMBOLS[id].prims.map((p) => (p.t === 'poly' ? p.p : []))
    const [k] = lines('K')
    const [p] = lines('P')
    expect(k.length).toBe(2)
    expect(k[0][0]).toBe(k[1][0])
    expect(k[0][1]).not.toBe(k[1][1])
    expect(p[0][1]).toBe(p[1][1])
    expect(p[0][0]).not.toBe(p[1][0])

    // 왼코 겹치기(k2tog)는 긴 선이 오른쪽 위에서 왼쪽 아래로 내려온다. 오른코 겹치기(ssk)는 그 반대
    const k2tog = lines('K2TOG')
    const ssk = lines('SSK')
    expect(k2tog[0][0][0]).toBeGreaterThan(k2tog[0][1][0])
    expect(k2tog[0][0][1]).toBeLessThan(k2tog[0][1][1])
    expect(ssk[0][0][0]).toBeLessThan(ssk[0][1][0])
    const mirrored = (a: (readonly [number, number])[][], b: (readonly [number, number])[][]) => {
      expect(a.length).toBe(b.length)
      a.forEach((line, i) =>
        line.forEach((pt, j) => {
          expect(pt[0]).toBeCloseTo(1 - b[i][j][0], 12)
          expect(pt[1]).toBeCloseTo(b[i][j][1], 12)
        }),
      )
    }
    mirrored(k2tog, ssk)
    // M1L과 M1R은 고리는 같고 다리만 거울상
    const m1l = lines('M1L')
    const m1r = lines('M1R')
    expect(m1l[0]).toEqual(m1r[0])
    mirrored(m1l.slice(1), m1r.slice(1))
    expect(m1l[1][1][0]).toBeGreaterThan(0.5)
    expect(m1r[1][1][0]).toBeLessThan(0.5)

    expect(SYMBOLS.YO.prims).toEqual([{ t: 'circle', c: [0.5, 0.5], r: 0.26 }])
    expect(SYMBOLS.BO.prims).toEqual([{ t: 'dot', c: [0.5, 0.5], r: 0.2 }])
    expect(SYMBOLS.SK2P.prims.length).toBe(3)
    expect(SYMBOLS.CO.prims.length).toBe(1)
  })

  it('symbolSvg 는 범례에 바로 넣을 수 있는 SVG를 준다', () => {
    for (const id of KNIT_SYMBOLS) {
      const svg = symbolSvg(id, 26)
      expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 26" width="26" height="26"')).toBe(true)
      expect(svg.endsWith('</svg>')).toBe(true)
      expect(svg).toContain(`aria-label="${SYMBOLS[id].name}"`)
      expect(svg).toContain(`fill="${SYMBOLS[id].bg}"`)
    }
    expect(symbolSvg('K')).toContain('viewBox="0 0 24 24"')
    expect(symbolSvg('K', 24, { bg: null, border: null })).not.toContain('<rect')
    expect(symbolSvg('YO', 24, { ink: '#000' })).toContain('stroke="#000"')
  })
})
