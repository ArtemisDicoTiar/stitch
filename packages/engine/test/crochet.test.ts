import { describe, expect, it } from 'vitest'
import { practiceBall, practiceBallExpected, practiceHood } from '@stitch/fixtures'
import { parsePattern, type Op, type Pattern, type Row, type Section } from '@stitch/pattern-ir'
import { allRows, describeOp, expand, normalizeStarts, progressFraction, regauge, stitchesDone, verify } from '../src'

/** 테스트용 작은 코바늘 도안 */
function crochet(sections: Section[]): Pattern {
  return parsePattern({ craft: 'crochet', terms: 'kr', title: '테스트', materials: [], gauge: null, finished: {}, template: 'none', sections, finishing: [] })
}
const row = (side: Row['side'], ops: Op[], expect_count?: number, text = ''): Row => ({ side, ops, text, ...(expect_count === undefined ? {} : { expect_count }) })
const once = (...rows: Row[]) => ({ rows, repeat: { times: 1 } })
const sc = (n: number): Op => ({ st: 'sc', n })
const codes = (p: Pattern) => verify(p).expanded.issues.map((i) => i.code)

describe('연습용 코바늘 공 (직접 쓴 도안)', () => {
  const v = verify(parsePattern(practiceBall))
  const rows = allRows(v.expanded)

  it('검산을 통과한다', () => {
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('단수와 단별 코 수가 기대와 같다', () => {
    expect(v.expanded.totalRows).toBe(practiceBallExpected.totalRows)
    expect(v.expanded.totalStitches).toBe(practiceBallExpected.totalStitches)
    expect(rows.map((r) => r.count)).toEqual(practiceBallExpected.counts)
    expect(v.expanded.sections[0]).toMatchObject({ startCount: 0, endCount: 6, rows: 14 })
  })

  it('코바늘 기호로 그려지고, 모든 단이 원형이며 단 높이가 1이다', () => {
    const seen = new Set(rows.flatMap((r) => r.cells.map((c) => c.s)))
    expect([...seen].sort()).toEqual([...practiceBallExpected.symbols].sort())
    for (const r of rows) {
      expect(r.side, `${r.g}단`).toBe('round')
      expect(r.h, `${r.g}단`).toBe(1)
      expect(r.start).toBeUndefined()
    }
  })

  it('한 칸에 코가 하나씩만 놓이고, 칸 수가 그 단에서 뜬 코 수와 같다', () => {
    for (const b of v.expanded.blocks) {
      for (const r of b.rows) {
        const xs = r.cells.map((c) => c.x)
        expect(new Set(xs).size, `${r.g}단`).toBe(xs.length)
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...xs)).toBeLessThan(b.W)
      }
    }
    // 늘림 단은 뜬 뒤의 코 수만큼, 줄임 단도 뜬 뒤의 코 수만큼 칸이 생깁니다.
    expect(rows.map((r) => r.cells.length)).toEqual(practiceBallExpected.counts)
  })

  it('늘림으로 생긴 코에 표시가 붙는다', () => {
    const added = rows.map((r) => r.cells.filter((c) => c.a).length)
    // 2~5단에서 6코씩 늘고, 나머지 단에는 없습니다. 매직링에 처음 뜨는 6코는 늘림이 아닙니다.
    expect(added).toEqual([0, 6, 6, 6, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    // 대바늘 도안에는 이 표시가 없습니다.
    expect(allRows(verify(practiceHood).expanded).some((r) => r.cells.some((c) => c.a))).toBe(false)
  })

  it('진행률은 뜬 코 수를 따른다', () => {
    expect(stitchesDone(v.expanded, { row: 2, stitch: 6 })).toBe(12)
    expect(progressFraction(v.expanded, { row: 14, stitch: 6 })).toBe(1)
  })

  it('게이지 다시 계산이 멈추지 않고 결과를 돌려준다', () => {
    expect(() => regauge(practiceBall, { stitches: 24, rows: 26 })).not.toThrow()
  })
})

describe('매직링', () => {
  const round2: Row = row('round', [{ repeat: [{ st: 'inc', n: 1 }], until: 'end' }], 12, '2단')

  it('코 수가 적혀 있으면 "링에 짧은뜨기 n코"를 1단으로 만들어 넣는다', () => {
    const v = verify(crochet([{ id: 'a', name: '조각', shape: 'spiral', start: { kind: 'ring', count: 6 }, groups: [once(round2)] }]))
    const rows = allRows(v.expanded)
    expect(v.errors).toEqual([])
    expect(rows.map((r) => r.count)).toEqual([6, 12])
    expect(rows[0]).toMatchObject({ start: 'ring', label: '1단(원형)', instr: '매직링에 짧은뜨기 6코', ref: { section: 0, group: -1, row: -1, rep: 0 } })
    expect(rows[0].cells.map((c) => c.s)).toEqual(Array(6).fill('SC'))
    expect(rows[1].label).toBe('2단(원형)')
    expect(v.expanded.sections[0]).toMatchObject({ startCount: 6, endCount: 12, rows: 2 })
  })

  it('첫 단을 직접 적으면 링 안에 뜨고, into를 빼먹어도 링 안에 뜬 것으로 본다', () => {
    for (const first of [row('round', [{ st: 'sc', n: 6, into: 'space' }], 6), row('round', [sc(6)], 6)]) {
      const v = verify(crochet([{ id: 'a', name: '조각', shape: 'spiral', start: { kind: 'ring', count: 0 }, groups: [once(first, round2)] }]))
      expect(v.errors).toEqual([])
      expect(v.warnings).toEqual([])
      expect(allRows(v.expanded).map((r) => r.count)).toEqual([6, 12])
    }
  })

  it('따로 시작하는 조각마다 새 격자가 된다', () => {
    const piece = (id: string, n: number): Section => ({ id, name: id, shape: 'spiral', start: { kind: 'ring', count: n }, groups: [once(row('round', [{ repeat: [{ st: 'inc', n: 1 }], until: 'end' }], n * 2))] })
    const v = verify(crochet([piece('head', 6), piece('arm', 5)]))
    expect(v.errors).toEqual([])
    expect(v.expanded.blocks.map((b) => b.W)).toEqual([12, 10])
    expect(v.expanded.sections.map((s) => s.block)).toEqual([0, 1])
  })

  it('그래니 스퀘어 첫 단처럼 기둥코, 사슬, 코 묶음을 섞어 링 안에 뜬다', () => {
    const first = row(
      'round',
      [
        { st: 'tch', n: 1, into: 'space' },
        { st: 'dc', n: 2, into: 'same' },
        { st: 'ch', n: 2 },
        { repeat: [{ st: 'dc', n: 3, into: 'space' }, { st: 'ch', n: 2 }], times: 3 },
        { st: 'join', n: 1 },
      ],
      12,
      '사슬 3(한길긴뜨기 1코로 셈), 링에 한길긴뜨기 2, 사슬 2, (링에 한길긴뜨기 3, 사슬 2) 3번, 첫 코에 빼뜨기',
    )
    const v = verify(crochet([{ id: 'sq', name: '모티브', shape: 'round', start: { kind: 'ring', count: 0 }, groups: [once(first)] }]))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    const r = allRows(v.expanded)[0]
    // 한길긴뜨기 12코(기둥코 포함)와 사슬 8코. 도안의 12코는 사슬을 뺀 수입니다.
    expect(r.cells.length).toBe(20)
    expect(r.count).toBe(20)
    expect(r.h).toBe(3)
  })
})

describe('시작 사슬과 평면 단', () => {
  const flat = (rows: Row[], count = 10): Pattern => crochet([{ id: 'a', name: '판', shape: 'flat', start: { kind: 'chain', count }, groups: [once(...rows)] }])

  it('시작 사슬을 사슬 단으로 펼치고, 1단은 그 위의 첫 단이다', () => {
    const v = verify(flat([row('RS', [{ st: 'tch0', n: 1 }, sc(10)], 10), row('WS', [{ st: 'tch0', n: 1 }, sc(10)], 10)]))
    const rows = allRows(v.expanded)
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    expect(rows.map((r) => r.label)).toEqual(['시작 사슬', '1단(겉면)', '2단(안면)'])
    expect(rows[0]).toMatchObject({ start: 'chain', side: 'WS', count: 10, h: 0 })
    expect(rows[0].cells.map((c) => c.s)).toEqual(Array(10).fill('CH'))
    expect(rows.map((r) => r.count)).toEqual([10, 10, 10])
    expect(v.expanded.totalStitches).toBe(30)
    // 사슬 단과 첫 단은 뜨는 방향이 반대입니다.
    expect(rows[0].cells[0].x).not.toBe(rows[1].cells[0].x)
  })

  it('코로 세는 기둥코는 첫 코 자리를 차지하고, 세지 않는 기둥코는 자리를 쓰지 않는다', () => {
    const counted = verify(flat([row('RS', [{ st: 'tch', n: 1 }, { st: 'dc', n: 9 }], 10), row('WS', [{ st: 'tch', n: 1 }, { st: 'dc', n: 9 }], 10)]))
    expect(counted.errors).toEqual([])
    expect(allRows(counted.expanded).map((r) => r.count)).toEqual([10, 10, 10])
    expect(allRows(counted.expanded)[1].h).toBe(3)

    const wrong = verify(flat([row('RS', [{ st: 'tch', n: 1 }, { st: 'dc', n: 10 }], 10)]))
    expect(wrong.errors.map((e) => e.code)).toContain('overrun')
  })

  it('기둥코를 그냥 사슬로 적으면 다음 단에서 남는 코로 드러난다', () => {
    const v = verify(flat([row('RS', [{ st: 'ch', n: 3 }, { st: 'dc', n: 10 }], 10), row('WS', [{ st: 'tch0', n: 1 }, { st: 'dc', n: 10 }], 10)]))
    expect(v.errors.map((e) => e.code)).toContain('leftover')
  })

  it('대바늘 도안의 시작에는 사슬 단을 만들지 않는다', () => {
    const knit = parsePattern({ craft: 'knit', terms: 'kr', title: 't', materials: [], gauge: null, finished: {}, sections: [{ id: 'a', name: 'a', shape: 'flat', start: { kind: 'chain', count: 4 }, groups: [once(row('RS', [{ st: 'k', n: 4 }], 4))] }], finishing: [] })
    const rows = allRows(expand(knit))
    expect(rows.length).toBe(1)
    expect(rows[0].h).toBeUndefined()
  })
})

describe('코를 넣는 자리 (into)', () => {
  it('one: n코를 다음 한 코에 모두 뜬다 (조개무늬)', () => {
    const shell = row('RS', [{ st: 'tch0', n: 1 }, sc(1), { repeat: [{ st: 'skip', n: 2 }, { st: 'dc', n: 5, into: 'one' }, { st: 'skip', n: 2 }, sc(1)], times: 2 }], 13)
    const v = verify(crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 13 }, groups: [once(shell)] }]))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    const r = allRows(v.expanded)[1]
    expect(r.count).toBe(13)
    expect(r.cells.map((c) => c.s).join(' ')).toBe('SC DC DC DC DC DC SC DC DC DC DC DC SC')
    // 건너뛴 코는 칸이 없고, 조개 하나의 다섯 코는 이웃한 칸에 놓입니다.
    const xs = r.cells.slice(1, 6).map((c) => c.x).sort((a, b) => a - b)
    expect(xs[4] - xs[0]).toBe(4)
  })

  it('same: 방금 뜬 자리에 더 뜬다', () => {
    const base = row('RS', [{ st: 'tch0', n: 1 }, sc(3)], 3)
    const fan = row('WS', [{ st: 'tch', n: 1 }, { st: 'dc', n: 2, into: 'same' }, { st: 'dc', n: 2 }], 5)
    const v = verify(crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 3 }, groups: [once(base, fan)] }]))
    expect(v.errors).toEqual([])
    expect(allRows(v.expanded).map((r) => r.count)).toEqual([3, 3, 5])
  })

  it('space: 이어진 사슬을 한 자리로 묶어 그 안에 뜬다', () => {
    const mesh = row('RS', [{ st: 'tch0', n: 1 }, sc(1), { repeat: [{ st: 'ch', n: 3 }, { st: 'skip', n: 3 }, sc(1)], times: 2 }], 9)
    const fill = row('WS', [{ st: 'tch0', n: 1 }, sc(1), { repeat: [{ st: 'sc', n: 4, into: 'space' }, sc(1)], times: 2 }], 11)
    const v = verify(crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 9 }, groups: [once(mesh, fill)] }]))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    expect(allRows(v.expanded).map((r) => r.count)).toEqual([9, 9, 11])
  })

  it('같은 공간에 이어 뜨는 것을 다시 "공간에"라고 적어도 받아 준다', () => {
    const mesh = row('RS', [{ st: 'tch0', n: 1 }, sc(1), { st: 'ch', n: 2 }, { st: 'skip', n: 2 }, sc(1)], 4)
    const corner = row('WS', [{ st: 'tch0', n: 1 }, sc(1), { st: 'dc', n: 2, into: 'space' }, { st: 'ch', n: 1 }, { st: 'dc', n: 2, into: 'space' }, sc(1)], 7)
    const v = verify(crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 4 }, groups: [once(mesh, corner)] }]))
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    expect(allRows(v.expanded)[2].count).toBe(7)
  })

  it('사슬이 없는 자리에 "공간에"라고 적히면 알려 준다', () => {
    const p = crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 3 }, groups: [once(row('RS', [{ st: 'tch0', n: 1 }, sc(3)], 3), row('WS', [{ st: 'tch0', n: 1 }, { st: 'sc', n: 2, into: 'space' }, sc(2)], 4))] }])
    expect(codes(p)).toContain('no_space')
  })

  it('사슬을 코 수에 넣은 도안과 뺀 도안을 모두 받아 준다', () => {
    const rows = (expect: number) => [row('RS', [{ st: 'tch0', n: 1 }, sc(1), { st: 'ch', n: 1 }, { st: 'skip', n: 1 }, sc(1)], expect)]
    const make = (expect: number) => crochet([{ id: 'a', name: '무늬', shape: 'flat', start: { kind: 'chain', count: 3 }, groups: [once(...rows(expect))] }])
    expect(verify(make(3)).errors).toEqual([])
    expect(verify(make(2)).errors).toEqual([])
    expect(verify(make(4)).errors.map((e) => e.code)).toEqual(['count_mismatch'])
  })
})

describe('닫는 원형단과 빼뜨기', () => {
  it('단을 잇는 빼뜨기는 코를 쓰지 않는다', () => {
    const r2 = row('round', [{ st: 'tch0', n: 1 }, { repeat: [{ st: 'inc', n: 1 }], until: 'end' }, { st: 'join', n: 1 }], 12)
    const v = verify(crochet([{ id: 'a', name: '바닥', shape: 'round', start: { kind: 'ring', count: 6 }, groups: [once(r2)] }]))
    expect(v.errors).toEqual([])
    expect(allRows(v.expanded).map((r) => r.count)).toEqual([6, 12])
  })

  it('빼뜨기로 지나간 코는 코 수에서 빠지고 칸 하나로 남는다', () => {
    const v = verify(crochet([{ id: 'a', name: '판', shape: 'flat', start: { kind: 'chain', count: 6 }, groups: [once(row('RS', [{ st: 'tch0', n: 1 }, { st: 'slst', n: 2 }, sc(4)], 4))] }]))
    expect(v.errors).toEqual([])
    const r = allRows(v.expanded)[1]
    expect(r.count).toBe(4)
    expect(r.cells.map((c) => c.s)).toEqual(['SL', 'SL', 'SC', 'SC', 'SC', 'SC'])
  })
})

describe('코바늘 안내 글', () => {
  it('코를 넣는 자리를 말로 풀어 쓴다', () => {
    expect(describeOp({ st: 'sc', n: 6 })).toBe('짧은뜨기 6코')
    expect(describeOp({ st: 'dc', n: 5, into: 'one' })).toBe('다음 코에 한길긴뜨기 5코')
    expect(describeOp({ st: 'dc', n: 2, into: 'same' })).toBe('같은 코에 한길긴뜨기 2코')
    expect(describeOp({ st: 'sc', n: 4, into: 'space' })).toBe('사슬 공간에 짧은뜨기 4코')
    expect(describeOp({ st: 'skip', n: 2 })).toBe('2코 건너뛰기')
    expect(describeOp({ st: 'ch', n: 3 })).toBe('사슬 3코')
    expect(describeOp({ st: 'inc', n: 1 })).toBe('짧은뜨기 늘림')
    expect(describeOp({ st: 'sc2tog', n: 2 })).toBe('짧은뜨기 줄임 2번')
    expect(describeOp({ st: 'tch', n: 1 })).toBe('기둥코 세우기 (1코로 셈)')
    expect(describeOp({ st: 'join', n: 1 })).toBe('첫 코에 빼뜨기로 잇기')
    expect(describeOp({ repeat: [{ st: 'inc', n: 1 }], until: 'end' })).toBe('끝까지 짧은뜨기 늘림')
    expect(describeOp({ repeat: [{ st: 'sc', n: 2 }, { st: 'inc', n: 1 }], times: 6 })).toBe('(짧은뜨기 2코, 짧은뜨기 늘림) 6번')
    // 대바늘 표현은 그대로입니다.
    expect(describeOp({ st: 'k', n: 3 })).toBe('겉3')
    expect(describeOp({ st: 'k2tog', n: 2 })).toBe('왼코 겹치기 2번')
  })
})

describe('읽은 도안 바로잡기: 매직링의 첫 단', () => {
  const inc: Row = row('round', [{ repeat: [{ st: 'inc', n: 1 }], until: 'end' }], 12, '2단: 모든 코에 늘림 (12코)')
  const make = (count: number, ...rows: Row[]) => crochet([{ id: 'a', name: '조각', shape: 'spiral', start: { kind: 'ring', count }, groups: rows.map((r) => once(r)) }])
  const counts = (p: Pattern) => allRows(verify(p).expanded).map((r) => r.count)

  it('시작 코 수와 링에 뜨는 첫 단이 함께 적혀 있으면 첫 단만 남긴다', () => {
    for (const first of [row('round', [{ st: 'sc', n: 6, into: 'space' }], 6, '1단: 매직링에 짧은뜨기 6코 (6코)'), row('round', [sc(6)], 6, '매직링에 짧은뜨기 6코')]) {
      const read = make(6, first, inc)
      // 그대로 두면 같은 단을 두 번 뜨거나 검산이 깨집니다.
      expect(counts(read)).not.toEqual([6, 12])
      const fixed = normalizeStarts(read)
      expect(fixed.sections[0].start).toEqual({ kind: 'ring', count: 0 })
      expect(verify(fixed).errors).toEqual([])
      expect(counts(fixed)).toEqual([6, 12])
      expect(allRows(verify(fixed).expanded).map((r) => r.label)).toEqual(['1단(원형)', '2단(원형)'])
    }
  })

  it('첫 단이 글로 적혀 있지 않으면 시작 코 수를 그대로 둔다', () => {
    const shorthand = make(6, inc)
    expect(normalizeStarts(shorthand)).toBe(shorthand)
    expect(counts(shorthand)).toEqual([6, 12])
    // 2단이 마침 시작 코 수만큼의 짧은뜨기여도, 번호가 2단이면 첫 단으로 보지 않습니다.
    const tube = make(6, row('round', [sc(6)], 6, '2단: 짧은뜨기 6코'))
    expect(normalizeStarts(tube)).toBe(tube)
    expect(counts(tube)).toEqual([6, 6])
  })

  it('링에 뜬다고 적혀 있으면 코 수가 달라도 그 단을 첫 단으로 본다', () => {
    const read = make(6, row('round', [{ st: 'sc', n: 8, into: 'space' }], 8, '1단: 링에 짧은뜨기 8코'))
    expect(counts(normalizeStarts(read))).toEqual([8])
  })

  it('대바늘 도안과 이미 맞는 도안은 건드리지 않는다', () => {
    const ok = make(0, row('round', [{ st: 'sc', n: 6, into: 'space' }], 6), inc)
    expect(normalizeStarts(ok)).toBe(ok)
    expect(normalizeStarts(practiceBall)).toBe(practiceBall)
  })
})

describe('같은 조각을 여러 개 만들기 (copies)', () => {
  const arm: Section = { id: 'arm', name: '팔', shape: 'spiral', start: { kind: 'ring', count: 5 }, copies: 2, groups: [once(row('round', [{ repeat: [sc(1)], until: 'end' }], 5, '2단'))] }
  const head: Section = { id: 'head', name: '머리', shape: 'spiral', start: { kind: 'ring', count: 6 }, groups: [once(row('round', [{ repeat: [{ st: 'inc', n: 1 }], until: 'end' }], 12, '2단'))] }
  const v = verify(crochet([head, arm]))
  const rows = allRows(v.expanded)

  it('조각마다 처음부터 다시 뜨고, 격자도 조각마다 따로다', () => {
    expect(v.errors).toEqual([])
    expect(rows.map((r) => r.count)).toEqual([6, 12, 5, 5, 5, 5])
    expect(rows.map((r) => r.copy ?? 0)).toEqual([0, 0, 1, 1, 2, 2])
    expect(v.expanded.blocks.map((b) => b.W)).toEqual([12, 5, 5])
    expect(rows.slice(2).map((r) => r.label)).toEqual(['1단(원형) · 1/2번째', '2단(원형) · 1/2번째', '1단(원형) · 2/2번째', '2단(원형) · 2/2번째'])
  })

  it('구간 요약은 구간마다 하나이고, 단수는 조각을 모두 더한 수다', () => {
    expect(v.expanded.sections.map((s) => ({ id: s.id, rows: s.rows, copies: s.copies, first: s.firstRow, last: s.lastRow, start: s.startCount, end: s.endCount }))).toEqual([
      { id: 'head', rows: 2, copies: undefined, first: 1, last: 2, start: 6, end: 12 },
      { id: 'arm', rows: 4, copies: 2, first: 3, last: 6, start: 5, end: 5 },
    ])
    expect(v.expanded.totalRows).toBe(6)
    expect(v.expanded.totalStitches).toBe(6 + 12 + 5 * 4)
  })

  it('이어 뜨는 구간에서는 무시한다', () => {
    const body: Section = { id: 'body', name: '몸', shape: 'spiral', start: { kind: 'continue', count: 12 }, copies: 3, groups: [once(row('round', [{ repeat: [sc(1)], until: 'end' }], 12, '3단'))] }
    const e = verify(crochet([head, body]))
    expect(e.errors).toEqual([])
    expect(e.expanded.totalRows).toBe(3)
  })
})
