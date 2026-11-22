import { describe, expect, it } from 'vitest'
import { garterScarf, garterScarfExpected, practiceHood, practiceHoodExpected } from '@stitch/fixtures'
import { parsePattern, type Pattern } from '@stitch/pattern-ir'
import { allRows, expand, progressFraction, rowAt, stitchesDone, verify } from '../src'

describe('연습용 후드 워머 (직접 쓴 도안)', () => {
  const v = verify(parsePattern(practiceHood))
  const rows = allRows(v.expanded)

  it('검산을 통과한다', () => {
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
    expect(v.ok).toBe(true)
  })

  it('단수와 구간별 코 수가 기대와 같다', () => {
    expect(v.expanded.totalRows).toBe(practiceHoodExpected.totalRows)
    expect(v.expanded.sections.map((s) => ({ id: s.id, rows: s.rows, start: s.startCount, end: s.endCount }))).toEqual(practiceHoodExpected.sections)
    for (const [g, count] of Object.entries(practiceHoodExpected.checkpoints)) {
      expect(rowAt(v.expanded, Number(g))?.count, `${g}단`).toBe(count)
    }
  })

  it('기호 10가지가 모두 나온다', () => {
    const seen = new Set(rows.flatMap((r) => r.cells.map((c) => c.s)))
    expect([...seen].sort()).toEqual([...practiceHoodExpected.symbols].sort())
  })

  it('겉면과 안면이 번갈아 나온다', () => {
    rows.forEach((r, i) => expect(r.side, `${r.g}단`).toBe(i % 2 === 0 ? 'RS' : 'WS'))
  })

  it('한 칸에 코가 하나씩만 놓이고 x가 격자 안에 있다', () => {
    for (const b of v.expanded.blocks) {
      for (const r of b.rows) {
        const xs = r.cells.map((c) => c.x)
        expect(new Set(xs).size, `${r.g}단`).toBe(xs.length)
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0)
        expect(Math.max(...xs)).toBeLessThan(b.W)
      }
    }
  })

  it('바늘비우기와 모아뜨기가 붙어 있으면 격자 폭이 늘지 않는다', () => {
    expect(v.expanded.blocks[0].W).toBe(85)
  })

  it('조각의 칸을 모으면 그 단의 칸과 같다', () => {
    for (const r of rows) {
      expect(r.segments.flatMap((s) => s.xs).sort((a, b) => a - b), `${r.g}단`).toEqual(r.cells.map((c) => c.x).sort((a, b) => a - b))
    }
  })

  it('진행률은 총 코 수에서 계산한다', () => {
    const e = v.expanded
    expect(progressFraction(e, { row: 0, stitch: 0 })).toBe(0)
    expect(stitchesDone(e, { row: 2, stitch: 10 })).toBe(85 + 10)
    const last = rows[rows.length - 1]
    expect(progressFraction(e, { row: last.g, stitch: last.cells.length })).toBe(1)
  })
})

describe('가터 목도리 (직접 쓴 도안)', () => {
  it('길이로 적힌 구간을 게이지로 추정하고, 추정한 단을 표시한다', () => {
    const v = verify(garterScarf)
    expect(v.ok).toBe(true)
    expect(v.expanded.totalRows).toBe(garterScarfExpected.totalRows)
    expect(v.notes.some((n) => n.code === 'estimated_rows')).toBe(true)
    expect(allRows(v.expanded)[0].estimated).toBe(true)
  })

  it('사람이 단수를 고치면 추정 대신 그 값을 쓴다', () => {
    const p: Pattern = structuredClone(garterScarf)
    p.sections[0].groups[0].repeat = { until_cm: 30, from: 'body', rows: 40 }
    expect(expand(p).totalRows).toBe(41)
  })

  it('게이지가 없으면 길이 구간을 확인 필요로 넘긴다', () => {
    const v = verify({ ...garterScarf, gauge: null })
    expect(v.ok).toBe(false)
    expect(v.errors[0].code).toBe('needs_gauge')
  })
})

describe('검산이 잡아내는 것', () => {
  const base = (): Pattern => structuredClone(practiceHood)

  it('도안에 적힌 코 수와 다르면 그 단을 알려 준다', () => {
    const p = base()
    p.sections[0].groups[1].rows[0].expect_count = 80
    const v = verify(p)
    expect(v.ok).toBe(false)
    expect(v.errors).toHaveLength(1)
    expect(v.errors[0]).toMatchObject({ code: 'count_mismatch', g: 9, expected: 80, actual: 79 })
  })

  it('남는 코가 있으면 알려 주고 뒤 단을 계속 따라간다', () => {
    const p = base()
    p.sections[0].groups[0].rows[0].ops = [{ st: 'k', n: 80 }]
    const v = verify(p)
    expect(v.errors.some((e) => e.code === 'leftover' && e.g === 1)).toBe(true)
    expect(v.expanded.totalRows).toBe(practiceHoodExpected.totalRows)
  })

  it('남은 코보다 많이 뜨라고 하면 알려 준다', () => {
    const p = base()
    p.sections[0].groups[0].rows[0].ops = [{ st: 'k', n: 90 }]
    expect(verify(p).errors.some((e) => e.code === 'overrun')).toBe(true)
  })

  it('사전에 없는 코를 알려 준다', () => {
    const p = base()
    p.sections[0].groups[0].rows[0].ops = [{ st: 'zzz', n: 85 }]
    expect(verify(p).errors.some((e) => e.code === 'unknown_stitch')).toBe(true)
  })

  it('구간이 이어지는 코 수가 다르면 알려 준다', () => {
    const p = base()
    p.sections[1].start.count = 81
    expect(verify(p).errors.some((e) => e.code === 'start_mismatch')).toBe(true)
  })

  it('무늬 반복 단위에 맞지 않는 코잡기를 알려 준다', () => {
    const p = base()
    p.sections[0].start.count = 86
    expect(verify(p).warnings.some((e) => e.code === 'multiple_mismatch')).toBe(true)
  })
})
