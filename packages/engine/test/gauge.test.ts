import { beforeAll, describe, expect, it } from 'vitest'
import { garterScarf, practiceHood } from '@stitch/fixtures'
import { allRows, compareGauge, expand, mapMarker, mapProgress, regauge, rowAt, rowsForLength, roundToMultiple, verify, type RegaugeResult, type RegaugeSection } from '../src'
import { loadBalaclava, loadBalaclavaExpected } from './private'

const balaclava = loadBalaclava()
// 실제 도안의 기대값은 private/ 에만 있습니다. 이 파일에는 그 숫자를 적지 않습니다.
const want = loadBalaclavaExpected()

describe('게이지 계산의 기본 규칙', () => {
  it('코 수는 무늬 반복 단위에 맞게 반올림한다', () => {
    expect(roundToMultiple(115.1, { of: 2, plus: 1 })).toBe(115)
    expect(roundToMultiple(116.2, { of: 2, plus: 1 })).toBe(117)
    expect(roundToMultiple(50.4, { of: 4, plus: 2 })).toBe(50)
    expect(roundToMultiple(97.6)).toBe(98)
  })

  it('길이 구간의 단수는 겉면과 안면 순서가 유지되게 짝수로 맞춘다', () => {
    expect(rowsForLength(25, 26)).toBe(66)
    expect(rowsForLength(25, 28)).toBe(70)
    expect(rowsForLength(25, 26, false)).toBe(65)
  })

  it('2% 안쪽 차이는 도안과 같은 게이지로 본다', () => {
    expect(compareGauge({ stitches: 17, rows: 26 }, { stitches: 17.2, rows: 26 }).same).toBe(true)
    expect(compareGauge({ stitches: 17, rows: 26 }, { stitches: 19, rows: 28 })).toMatchObject({ same: false, tighter: true, stitchPct: 12 })
  })
})

describe.skipIf(!balaclava || !want)('바라클라바를 다른 게이지로 다시 계산', () => {
  let r: RegaugeResult
  let byId: Record<string, RegaugeSection>
  beforeAll(() => {
    r = regauge(balaclava!, want!.regauge.mine)
    byId = Object.fromEntries(r.sections.map((s) => [s.id, s]))
  })

  it('다시 검산을 통과한다', () => {
    expect(r.ok).toBe(true)
    expect(verify(r.pattern!).errors).toEqual([])
  })

  it('구간마다 시작과 끝 코 수가 기대값대로 바뀌고, 줄임 횟수가 맞다', () => {
    for (const [key, range] of Object.entries(want!.regauge.counts)) {
      const [id, edge] = key.split('.') as [string, 'start' | 'end']
      expect(byId[id][edge], key).toEqual(range)
    }
    const crown = allRows(expand(r.pattern!)).filter((x) => x.sectionId === 'crown')
    expect(crown.filter((x) => x.cells.some((c) => c.s === 'SSK'))).toHaveLength(want!.regauge.crownDecreaseRows)
  })

  it('길이로 적힌 구간은 단수만 다시 계산되고, 단 수로 적힌 구간은 단 게이지 비율로 바뀐다', () => {
    for (const [id, range] of Object.entries(want!.regauge.rows)) expect(byId[id].rows, id).toEqual(range)
  })

  it('완성 가로: 그대로 뜰 때와 다시 계산할 때의 값이 기대값과 같다', () => {
    const w = want!.regauge.width
    expect(r.width.pattern).toBe(w.pattern)
    expect(Math.round(r.width.asIs! * 10) / 10).toBe(w.asIs)
    expect(Math.floor(r.width.recalculated! * 10) / 10).toBe(w.recalculated)
  })

  it('원본 IR은 바뀌지 않는다', () => {
    expect(balaclava!.sections[0].start.count).toBe(want!.original.castOn)
    expect(balaclava!.gauge?.stitches).toBe(want!.original.gaugeStitches)
    expect(r.pattern!.gauge).toMatchObject(want!.regauge.mine)
  })
})

describe('임의 게이지 여러 개 (직접 쓴 도안)', () => {
  const gauges = [
    [14, 20], [15, 22], [16, 22], [17, 24], [18, 24], [18.5, 25], [19, 26], [20, 26], [21, 28], [22, 30], [24, 32],
  ]
  for (const [s, rws] of gauges) {
    it(`${s}코 × ${rws}단: 다시 계산 뒤 검산 통과, 완성 가로가 도안과 1코 폭 이내`, () => {
      const r = regauge(practiceHood, { stitches: s, rows: rws })
      expect(r.ok, r.reason).toBe(true)
      const v = verify(r.pattern!)
      expect(v.errors).toEqual([])
      expect(v.warnings).toEqual([])
      const oneStitch = 10 / s
      expect(Math.abs(r.width.recalculated! - r.width.pattern!)).toBeLessThanOrEqual(oneStitch)
      // 겉면과 안면 순서가 유지된다
      allRows(v.expanded).forEach((row, i) => expect(row.side).toBe(i % 2 === 0 ? 'RS' : 'WS'))
      // 고무단 코잡기는 홀수(2의 배수 + 1)
      expect(v.expanded.sections[0].startCount % 2).toBe(1)
    })
  }

  it('마지막에 코를 모두 막는 도안은 코막음 앞까지의 코 수와 단수가 게이지 비율을 따른다', () => {
    const base = expand(practiceHood)
    const crown0 = base.sections[2]
    const before0 = allRows(base).filter((r) => r.sectionId === 'crown').at(-2)!.count
    for (const [s, rws] of gauges) {
      const r = regauge(practiceHood, { stitches: s, rows: rws })
      const rows = allRows(expand(r.pattern!)).filter((x) => x.sectionId === 'crown')
      const before = rows.at(-2)!.count
      // 코막음 직전 코 수는 원래 코 수 × 코 게이지 비율에서 줄임 한 번(2코) 안쪽
      expect(Math.abs(before - before0 * (s / 18)), `${s}×${rws} 코막음 앞 코 수`).toBeLessThanOrEqual(2)
      // 정수리 단수는 단 게이지 비율에서 크게 벗어나지 않는다
      const want = crown0.rows * (rws / 24)
      expect(Math.abs(rows.length - want), `${s}×${rws} 정수리 단수 ${rows.length}`).toBeLessThanOrEqual(6)
      expect(rows.at(-1)!.count).toBe(0)
    }
    const loose = regauge(practiceHood, { stitches: 15.5, rows: 20 })
    expect(loose.sections[2].rows.to).toBeGreaterThanOrEqual(13)
  })

  it('코와 단 게이지를 따로 견준다', () => {
    expect(compareGauge({ stitches: 18, rows: 24 }, { stitches: 18, rows: 30 })).toMatchObject({ same: true, sameRows: false, sameBoth: false })
    expect(compareGauge({ stitches: 18, rows: 24 }, { stitches: 18.2, rows: 24.2 })).toMatchObject({ same: true, sameRows: true, sameBoth: true })
  })

  it('도안과 같은 게이지면 숫자가 그대로다', () => {
    const r = regauge(practiceHood, { stitches: 18, rows: 24 })
    expect(r.ok).toBe(true)
    expect(r.sections.every((s) => s.start.from === s.start.to && s.end.from === s.end.to && s.rows.from === s.rows.to)).toBe(true)
  })

  it('길이로만 적힌 도안은 길이를 그대로 두고 단수만 다시 계산한다', () => {
    const r = regauge(garterScarf, { stitches: 18, rows: 36 })
    expect(r.ok).toBe(true)
    expect(r.sections[0].start).toEqual({ from: 24, to: 27 })
    expect(r.sections[0].rows).toEqual({ from: 91, to: 109 })
  })

  it('게이지가 없는 도안은 다시 계산을 제안하지 않는다', () => {
    const r = regauge({ ...garterScarf, gauge: null }, { stitches: 18, rows: 36 })
    expect(r.ok).toBe(false)
    expect(r.pattern).toBeNull()
  })

  it('고정된 숫자뿐이라 맞출 수 없으면 통과시키지 않고 바늘 바꾸기만 안내한다', () => {
    const fixed = structuredClone(garterScarf)
    fixed.sections[0].groups[0].rows[0].ops = [{ st: 'k', n: 24 }]
    const r = regauge(fixed, { stitches: 20, rows: 30 })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('바늘')
  })
})

describe('게이지 건너뛰기와 버전 사이 옮기기', () => {
  it('건너뛰면 원본 IR이 그대로 쓰인다', () => {
    const before = JSON.stringify(practiceHood)
    const e = expand(practiceHood)
    expect(e.sections[0].startCount).toBe(85)
    expect(JSON.stringify(practiceHood)).toBe(before)
  })

  it('기록을 새 버전의 같은 구간, 같은 비율 위치로 옮긴다', () => {
    const from = expand(practiceHood)
    const r = regauge(practiceHood, { stitches: 20, rows: 28 })
    const to = expand(r.pattern!)
    const head = from.sections[1]
    const mid = Math.round((head.firstRow + head.lastRow) / 2)
    const cells = rowAt(from, mid)!.cells.length
    const moved = mapProgress(from, to, { row: mid, stitch: Math.round(cells / 2) })
    const dst = to.sections[1]
    expect(moved.row).toBeGreaterThanOrEqual(dst.firstRow)
    expect(moved.row).toBeLessThanOrEqual(dst.lastRow)
    const ratio = (moved.row - dst.firstRow) / (dst.rows - 1)
    expect(Math.abs(ratio - 0.5)).toBeLessThan(0.03)
    const movedCells = rowAt(to, moved.row)!.cells.length
    expect(Math.abs(moved.stitch / movedCells - 0.5)).toBeLessThan(0.02)
    // 처음과 끝은 처음과 끝으로
    expect(mapProgress(from, to, { row: 1, stitch: 0 })).toEqual({ row: 1, stitch: 0 })
    expect(mapProgress(from, to, { row: from.totalRows, stitch: 0 }).row).toBe(to.totalRows)
    expect(mapMarker(from, to, head.firstRow, 0)).toEqual({ row: dst.firstRow, x: 0 })
  })
})
