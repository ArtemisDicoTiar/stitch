/**
 * 둥글게 뜬 조각의 3D (회전체). 직접 쓴 연습용 코바늘 공과 작은 시험 도안으로 확인합니다.
 */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { garterScarf, practiceBall, practiceBear, practiceHood, practicePouch, practiceScarf } from '@stitch/fixtures'
import { parsePattern, type Op, type Pattern, type Row, type Section } from '@stitch/pattern-ir'
import { buildGarment, knittedCount, stitchAt, suggestTemplate, supportsTemplate, symbolOrderOf, type Garment, type RoundDetails } from '../src/garment'

const TAU = Math.PI * 2
const row = (ops: Op[], expect_count: number, side: Row['side'] = 'round'): Row => ({ side, ops, expect_count, text: '' })
const once = (...rows: Row[]) => ({ rows, repeat: { times: 1 } })
const all = (st: string): Op[] => [{ repeat: [{ st, n: 1 }], until: 'end' }]
function crochet(sections: Section[], gauge = { stitches: 20, rows: 20 }): Pattern {
  return parsePattern({ craft: 'crochet', terms: 'kr', title: '시험', materials: [], gauge: { ...gauge, over_cm: 10, in_stitch: '짧은뜨기', tool_mm: 3 }, finished: {}, template: 'round', sections, finishing: [] })
}
const build = (p: Pattern): Garment => buildGarment(expand(p), 'round', { gauge: p.gauge })
const round = (g: Garment): RoundDetails => {
  if (g.details.template !== 'round') throw new Error('round가 아닙니다')
  return g.details
}

/** i번째 코의 네 꼭짓점 */
function quad(g: Garment, i: number): [number, number, number][] {
  return [0, 1, 2, 3].map((c) => [g.positions[i * 12 + c * 3], g.positions[i * 12 + c * 3 + 1], g.positions[i * 12 + c * 3 + 2]])
}
/** 단 ri(0부터)의 위쪽 가장자리가 축에서 떨어진 거리들. 조각의 가운데 x를 빼고 잽니다. */
function topRadii(g: Garment, ri: number, cx = 0): number[] {
  const out: number[] = []
  for (let i = g.rowStart[ri]; i < g.rowStart[ri + 1]; i++) for (const [x, , z] of quad(g, i).slice(2)) out.push(Math.hypot(x - cx, z))
  return out
}
function bottomRadii(g: Garment, ri: number, cx = 0): number[] {
  const out: number[] = []
  for (let i = g.rowStart[ri]; i < g.rowStart[ri + 1]; i++) for (const [x, , z] of quad(g, i).slice(0, 2)) out.push(Math.hypot(x - cx, z))
  return out
}
const spread = (v: number[]) => Math.max(...v) - Math.min(...v)

describe('연습용 코바늘 공', () => {
  const e = expand(practiceBall)
  const g = build(practiceBall)
  const sw = 10 / practiceBall.gauge!.stitches

  it('코마다 사각형 하나, 코바늘 기호 번호로 만들어진다', () => {
    expect(supportsTemplate('round')).toBe(true)
    expect(g.template).toBe('round')
    expect(g.craft).toBe('crochet')
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(g.rowCount).toBe(14)
    expect(g.mannequin).toBeNull()
    for (const v of g.positions) expect(Number.isFinite(v)).toBe(true)
    expect(stitchAt(g, 0)).toMatchObject({ row: 1, k: 0, symbol: 'SC' })
    expect(stitchAt(g, g.stitchCount - 1)?.symbol).toBe('SC2')
    expect(symbolOrderOf('crochet')[g.symbols[0]]).toBe('SC')
    expect(knittedCount(g, { row: 2, stitch: 6 })).toBe(12)
  })

  it('가장 넓은 곳의 둘레가 코 수 × 코 폭이다', () => {
    const d = round(g)
    expect(d.pieces.length).toBe(1)
    expect(d.pieces[0]).toMatchObject({ kind: 'round', firstRow: 1, lastRow: 14, section: '공' })
    expect(d.pieces[0].maxRadius).toBeCloseTo((30 * sw) / TAU, 6)
    expect(g.bbox.size[0]).toBeCloseTo(((30 * sw) / TAU) * 2, 1)
    // 한 단의 위쪽 가장자리는 축에서 같은 거리에 있습니다 (원).
    for (let ri = 0; ri < g.rowCount; ri++) expect(spread(topRadii(g, ri)), `${ri + 1}단`).toBeLessThan(1e-4)
  })

  it('단 사이가 끊기지 않는다: 아랫단의 위 가장자리와 윗단의 아래 가장자리가 같은 높이, 같은 반지름', () => {
    for (let ri = 1; ri < g.rowCount; ri++) {
      const below = quad(g, g.rowStart[ri - 1])
      const above = quad(g, g.rowStart[ri])
      expect(above[0][1], `${ri + 1}단 높이`).toBeCloseTo(below[2][1], 5)
      expect(bottomRadii(g, ri)[0], `${ri + 1}단 반지름`).toBeCloseTo(topRadii(g, ri - 1)[0], 5)
    }
  })

  it('매직링에서 한 점으로 시작해 불룩해졌다가 위에서 다시 오므라든다', () => {
    const r = Array.from({ length: g.rowCount }, (_, ri) => topRadii(g, ri)[0])
    expect(bottomRadii(g, 0)[0]).toBeLessThan(sw * 0.2)
    const widest = r.indexOf(Math.max(...r))
    expect(widest).toBeGreaterThanOrEqual(4)
    expect(widest).toBeLessThanOrEqual(9)
    for (let i = 1; i <= widest; i++) expect(r[i], `${i + 1}단`).toBeGreaterThanOrEqual(r[i - 1] - 1e-6)
    for (let i = widest + 1; i < r.length; i++) expect(r[i], `${i + 1}단`).toBeLessThanOrEqual(r[i - 1] + 1e-6)
    expect(r[r.length - 1]).toBeLessThan(r[widest] * 0.45)
    // 높이는 단이 쌓이는 만큼. 단 14개가 옆선을 따라가는 길이를 넘지 못합니다.
    const rh = 10 / practiceBall.gauge!.rows
    expect(g.bbox.size[1]).toBeGreaterThan(rh * 4)
    expect(g.bbox.size[1]).toBeLessThanOrEqual(rh * 14 + 1e-6)
  })

  it('겉이 바깥을 본다', () => {
    // 가장 넓은 단의 코는 법선이 축에서 바깥쪽을 향합니다.
    const ri = 7
    for (let i = g.rowStart[ri]; i < g.rowStart[ri + 1]; i++) {
      const [cx, , cz] = [g.centers[i * 3], 0, g.centers[i * 3 + 2]]
      const dot = g.stitchNormals[i * 3] * cx + g.stitchNormals[i * 3 + 2] * cz
      expect(dot, `코 ${i}`).toBeGreaterThan(0)
    }
    // 바닥은 아래를, 꼭대기는 위를 봅니다.
    expect(g.stitchNormals[g.rowStart[0] * 3 + 1]).toBeLessThan(-0.5)
    expect(g.stitchNormals[g.rowStart[13] * 3 + 1]).toBeGreaterThan(0.5)
  })
})

describe('원판, 원통, 조각 여러 개', () => {
  const inc: Op[] = all('inc')
  const flatDisc = crochet([{ id: 'd', name: '받침', shape: 'spiral', start: { kind: 'ring', count: 6 }, groups: [once(row(inc, 12)), once(row([{ repeat: [{ st: 'sc', n: 1 }, { st: 'inc', n: 1 }], times: 6 }], 18)), once(row([{ repeat: [{ st: 'sc', n: 2 }, { st: 'inc', n: 1 }], times: 6 }], 24))] }])

  it('단마다 고르게 늘리면 평평한 원판이다', () => {
    const g = build(flatDisc)
    // 코 폭과 단 높이가 같을 때 한 단에 6코씩 늘면 반지름이 단 높이만큼(조금 못 미치게) 늘어 거의 평평합니다.
    expect(g.bbox.size[1]).toBeLessThan(g.bbox.size[0] * 0.2)
    expect(g.bbox.size[0]).toBeCloseTo(((24 * 0.5) / TAU) * 2, 1)
  })

  it('코 수가 그대로면 곧은 원통이다', () => {
    const tube = crochet([{ id: 't', name: '통', shape: 'round', start: { kind: 'ring', count: 12 }, groups: [{ rows: [row(all('sc'), 12)], repeat: { times: 6 } }] }])
    const g = build(tube)
    const r = Array.from({ length: g.rowCount }, (_, ri) => topRadii(g, ri)[0])
    // 바닥에서 옆면으로 넘어가는 모서리는 둥글려지고, 그 위는 곧게 올라갑니다.
    const full = (12 * 0.5) / TAU
    expect(r[r.length - 1]).toBeCloseTo(full, 5)
    for (const v of r.slice(4)) expect(Math.abs(v - full)).toBeLessThan(full * 0.03)
    for (const v of r) expect(v).toBeLessThanOrEqual(full + 1e-6)
    // 첫 단(링에 12코)을 빼면 단마다 단 높이쯤 올라갑니다.
    expect(g.bbox.size[1]).toBeGreaterThan(0.5 * 5)
  })

  it('조각이 여럿이면 겹치지 않게 나란히 놓고, 같은 조각 두 개는 같은 모양이다', () => {
    const piece = (id: string, name: string, n: number, copies?: number): Section => ({ id, name, shape: 'spiral', start: { kind: 'ring', count: n }, ...(copies ? { copies } : {}), groups: [once(row(inc, n * 2)), { rows: [row(all('sc'), n * 2)], repeat: { times: 3 } }] })
    const doll = crochet([piece('head', '머리', 6), piece('arm', '팔', 4, 2)])
    const g = build(doll)
    const d = round(g)
    expect(d.pieces.map((p) => p.section)).toEqual(['머리', '팔 ', '팔 '].map((s) => s.trim()))
    expect(d.pieces.length).toBe(3)
    // 왼쪽부터 놓이고 서로 떨어져 있습니다.
    for (let i = 1; i < d.pieces.length; i++) {
      const a = d.pieces[i - 1]
      const b = d.pieces[i]
      expect(b.x - b.width / 2).toBeGreaterThan(a.x + a.width / 2 + 0.5)
    }
    expect(d.pieces[1].width).toBeCloseTo(d.pieces[2].width, 6)
    expect(d.pieces[1].height).toBeCloseTo(d.pieces[2].height, 6)
    // 조각의 코는 그 조각의 자리 안에 있습니다.
    const e = expand(doll)
    const rows = e.blocks.flatMap((b) => b.rows).sort((a, b) => a.g - b.g)
    rows.forEach((r, ri) => {
      const p = d.pieces[r.piece ?? 0]
      for (let i = g.rowStart[ri]; i < g.rowStart[ri + 1]; i++) {
        const x = g.centers[i * 3]
        expect(x, `${r.g}단`).toBeGreaterThanOrEqual(p.x - p.width / 2 - 1e-6)
        expect(x, `${r.g}단`).toBeLessThanOrEqual(p.x + p.width / 2 + 1e-6)
      }
    })
    expect(g.bbox.size[0]).toBeCloseTo(d.width, 3)
  })
})

describe('연습용 코바늘 곰 인형', () => {
  const e = expand(practiceBear)
  const g = build(practiceBear)
  const d = round(g)

  it('조각 여섯 개를 왼쪽부터 나란히 놓는다: 머리, 몸통, 팔 둘, 귀 둘', () => {
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(d.pieces.map((p) => p.section)).toEqual(['머리', '몸통', '팔', '팔', '귀', '귀'])
    for (let i = 1; i < d.pieces.length; i++) expect(d.pieces[i].x - d.pieces[i].width / 2).toBeGreaterThan(d.pieces[i - 1].x + d.pieces[i - 1].width / 2)
    // 머리가 가장 크고, 팔은 길쭉하고, 귀는 얕은 그릇입니다.
    const [head, body, arm, , ear] = d.pieces
    expect(head.width).toBeGreaterThan(body.width)
    expect(arm.height).toBeGreaterThan(arm.width)
    expect(ear.height).toBeLessThan(ear.width)
    // 코는 12각형처럼 꺾인 선으로 둘러 놓이므로, 상자는 조각들의 폭보다 조금 작습니다.
    expect(g.bbox.size[0]).toBeLessThanOrEqual(d.width + 1e-6)
    expect(g.bbox.size[0]).toBeGreaterThan(d.width * 0.98)
  })

  it('솜을 채우는 조각(머리, 몸통)은 둥글고, 열린 조각(팔)은 곧은 통이다', () => {
    const [head, , arm] = d.pieces
    // 머리: 너비와 높이가 비슷합니다.
    expect(head.height / head.width).toBeGreaterThan(0.7)
    expect(head.height / head.width).toBeLessThan(1.2)
    // 팔: 끝까지 같은 둘레
    const rows = e.blocks.flatMap((b) => b.rows).sort((a, b) => a.g - b.g)
    const last = rows.findIndex((r) => r.sectionId === 'arm' && r.copy === 1 && r.g === arm.lastRow)
    expect(topRadii(g, last, arm.x)[0]).toBeCloseTo(arm.maxRadius!, 5)
  })
})

describe('연습용 코바늘 목도리 (평면)', () => {
  const e = expand(practiceScarf)
  const g = buildGarment(e, 'flat', { gauge: practiceScarf.gauge })

  it('코바늘 기호로 만들어지고, 폭은 시작 사슬 폭이다', () => {
    expect(g.craft).toBe('crochet')
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(g.bbox.size[0]).toBeCloseTo(26 * (10 / 16), 3)
  })

  it('단 높이는 코를 따른다: 사슬 단은 낮고, 한길긴뜨기 80단이 게이지대로 100cm다', () => {
    const rh = 10 / 8
    const height = (ri: number) => quad(g, g.rowStart[ri])[2][1] - quad(g, g.rowStart[ri])[0][1]
    expect(height(0)).toBeCloseTo(rh * 0.4, 5)
    expect(height(1)).toBeCloseTo(rh, 5)
    expect(g.bbox.size[1]).toBeCloseTo(rh * 80 + rh * 0.4, 3)
  })

  it('대바늘 평면은 그대로다: 단마다 같은 높이', () => {
    const k = buildGarment(expand(garterScarf), 'flat', { gauge: garterScarf.gauge })
    expect(k.craft).toBe('knit')
    expect(k.bbox.size[1]).toBeCloseTo(k.rowCount * (10 / garterScarf.gauge!.rows), 4)
  })
})

describe('연습용 코바늘 파우치 (타원 바닥, 닫는 원형단)', () => {
  const e = expand(practicePouch)
  const g = build(practicePouch)
  const d = round(g)
  const sw = 10 / practicePouch.gauge!.stitches

  it('한 조각이고, 가로가 세로(앞뒤)보다 긴 타원 통이다', () => {
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(d.pieces.length).toBe(1)
    // 곧은 변은 시작 사슬 길이(11코 폭), 그 양 끝에 반원이 붙습니다.
    expect(g.bbox.size[0] - g.bbox.size[2]).toBeCloseTo(11 * sw, 1)
    expect(g.bbox.size[0]).toBeGreaterThan(g.bbox.size[2] * 2)
    // 맨 윗단의 둘레는 코 수 × 코 폭입니다.
    const last = g.rowCount - 1
    let perimeter = 0
    for (let i = g.rowStart[last]; i < g.rowStart[last + 1]; i++) {
      const q = quad(g, i)
      perimeter += Math.hypot(q[2][0] - q[3][0], q[2][2] - q[3][2])
    }
    expect(perimeter).toBeGreaterThan(32 * sw * 0.97)
    expect(perimeter).toBeLessThanOrEqual(32 * sw + 1e-6)
  })

  it('바닥은 평평하고 옆면은 곧게 올라간다', () => {
    const y = (ri: number) => quad(g, g.rowStart[ri])[2][1]
    // 옆면 14단이 단 높이(0.5cm)쯤씩 올라갑니다.
    expect(g.bbox.size[1]).toBeGreaterThan(14 * 0.5 * 0.85)
    expect(y(2)).toBeLessThan(1.2)
    for (let ri = 4; ri < g.rowCount; ri++) expect(y(ri) - y(ri - 1)).toBeGreaterThan(0.4)
  })
})

describe('대바늘 원통', () => {
  it('둘러 뜬 대바늘 통도 같은 방법으로 그린다', () => {
    const tube = parsePattern({ craft: 'knit', terms: 'kr', title: '넥워머', materials: [], gauge: { stitches: 20, rows: 20, over_cm: 10, in_stitch: '메리야스뜨기', tool_mm: 4 }, finished: {}, template: 'tube', finishing: [], sections: [{ id: 'a', name: '통', shape: 'round', start: { kind: 'cast_on', count: 40 }, groups: [{ rows: [{ side: 'round', ops: [{ repeat: [{ st: 'k', n: 1 }], until: 'end' }], text: '' }], repeat: { times: 10 } }] }] })
    const g = buildGarment(expand(tube), 'tube', { gauge: tube.gauge })
    expect(g.craft).toBe('knit')
    expect(g.mannequin).toBeNull()
    expect(g.bbox.size[0]).toBeCloseTo((40 * 0.5) / Math.PI, 1)
    expect(g.bbox.size[1]).toBeCloseTo(10 * 0.5, 3)
  })
})

describe('형태 고르기', () => {
  const bare = (p: Pattern, over: Partial<Pattern> = {}): Pattern => {
    const { template: _t, ...rest } = p
    return { ...rest, ...over }
  }
  it('둥글게 뜨는 코바늘은 round, 왕복으로만 뜨는 코바늘은 flat', () => {
    expect(suggestTemplate(bare(practiceBall))).toBe('round')
    expect(suggestTemplate(bare(garterScarf, { craft: 'crochet' }))).toBe('flat')
    expect(suggestTemplate(practiceBall)).toBe('round')
  })
  it('대바늘 도안의 짐작은 그대로다', () => {
    expect(suggestTemplate(bare(practiceHood))).toBe('hood')
    expect(suggestTemplate(bare(garterScarf))).toBe('flat')
  })
})
