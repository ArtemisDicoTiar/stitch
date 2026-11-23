/**
 * 3D: 템플릿별 정점 수와 경계 상자가 고정 범위 안에 있는지.
 * 범위는 게이지 계산(코 수 × 코 폭, 단수 × 단 높이)에서 나온 값입니다.
 */
import { describe, expect, it } from 'vitest'
import { allRows, expand, regauge, stitchesDone } from '@stitch/engine'
import { garterScarf, practiceHood } from '@stitch/fixtures'
import type { Expanded, Pattern, Progress } from '@stitch/pattern-ir'
import {
  DEFAULT_GAUGE,
  SYMBOL_ORDER,
  UnsupportedTemplateError,
  buildGarment,
  knittedCount,
  rowLine,
  stitchAt,
  stitchIndex,
  stitchIndexAtColumn,
  suggestTemplate,
  supportsTemplate,
  type Garment,
} from '../src/garment'
import { loadBalaclava } from './private'

const finite = (a: ArrayLike<number>) => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false
  return true
}

/** 모든 템플릿에 공통인 구조 검사 */
function checkStructure(e: Expanded, g: Garment) {
  const n = e.totalStitches
  expect(g.stitchCount).toBe(n)
  expect(g.rowCount).toBe(e.totalRows)
  expect(g.positions.length).toBe(n * 12)
  expect(g.normals.length).toBe(n * 12)
  expect(g.uvs.length).toBe(n * 8)
  expect(g.indices.length).toBe(n * 6)
  expect(g.centers.length).toBe(n * 3)
  expect(g.rowStart.length).toBe(e.totalRows + 1)
  expect(g.rowStart[e.totalRows]).toBe(n)
  expect(finite(g.positions)).toBe(true)
  expect(finite(g.normals)).toBe(true)
  expect(finite(g.centers)).toBe(true)
  expect(finite(g.bbox.min) && finite(g.bbox.max)).toBe(true)

  // 색인은 자기 코의 꼭짓점 4개만 가리킨다
  let badIndex = 0
  for (let q = 0; q < n; q++) for (let j = 0; j < 6; j++) if (Math.floor(g.indices[q * 6 + j] / 4) !== q) badIndex++
  expect(badIndex).toBe(0)

  // 법선은 길이 1
  let badNormal = 0
  for (let i = 0; i < g.normals.length; i += 3) {
    if (Math.abs(Math.hypot(g.normals[i], g.normals[i + 1], g.normals[i + 2]) - 1) > 1e-3) badNormal++
  }
  expect(badNormal).toBe(0)

  // 모든 (g, k)가 서로 다른 코 하나에 대응하고, 그 코가 같은 칸을 가리킨다
  const seen = new Uint8Array(n)
  let mismatched = 0
  for (const row of allRows(e)) {
    for (const cell of row.cells) {
      const q = stitchIndex(g, row.g, cell.k)
      if (q < 0 || q >= n || seen[q]) {
        mismatched++
        continue
      }
      seen[q] = 1
      const ref = stitchAt(g, q)
      if (!ref || ref.row !== row.g || ref.k !== cell.k || ref.x !== cell.x || ref.symbol !== cell.s) mismatched++
      if (stitchIndexAtColumn(g, row.g, cell.x) !== q) mismatched++
      if (!finite(g.centers.subarray(q * 3, q * 3 + 3))) mismatched++
    }
  }
  expect(mismatched).toBe(0)
  expect(seen.every((v) => v === 1)).toBe(true)
  expect(stitchIndex(g, 0, 0)).toBe(-1)
  expect(stitchIndex(g, e.totalRows + 1, 0)).toBe(-1)
  expect(stitchAt(g, n)).toBeNull()

  // 경계 상자가 실제 꼭짓점을 감싼다
  for (let i = 0; i < g.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = g.positions[i + a]
      if (v < g.bbox.min[a] - 1e-4 || v > g.bbox.max[a] + 1e-4) throw new Error('꼭짓점이 경계 상자 밖에 있습니다')
    }
  }
}

/** 진행 위치의 계산이 엔진과 같은지 */
function checkProgress(e: Expanded, g: Garment) {
  const rows = allRows(e)
  const mid = rows[Math.floor(rows.length / 2)]
  const last = rows[rows.length - 1]
  const cases: Progress[] = [
    { row: 0, stitch: 0 },
    { row: 1, stitch: 0 },
    { row: 1, stitch: 7 },
    { row: 2, stitch: rows[1].cells.length },
    { row: mid.g, stitch: Math.floor(mid.cells.length / 3) },
    { row: last.g, stitch: last.cells.length },
    { row: last.g, stitch: last.cells.length + 50 },
  ]
  for (const p of cases) expect(knittedCount(g, p), JSON.stringify(p)).toBe(stitchesDone(e, p))
  expect(knittedCount(g, null)).toBe(e.totalStitches)
  expect(knittedCount(g, { row: last.g + 5, stitch: 0 })).toBe(e.totalStitches)
}

describe('후드 템플릿: 연습용 후드 워머', () => {
  const gauge = practiceHood.gauge!
  const e = expand(practiceHood)
  const g = buildGarment(e, 'hood', { gauge })
  const sw = 10 / gauge.stitches
  const rh = 10 / gauge.rows

  it('코 하나가 사각형 하나: 정점 수 = 총 코 수 × 4', () => {
    checkStructure(e, g)
    expect(g.positions.length / 3).toBe(e.totalStitches * 4)
    // 고정 범위: 93단, 단마다 79~94코
    expect(g.positions.length / 3).toBeGreaterThan(30_000)
    expect(g.positions.length / 3).toBeLessThan(36_000)
  })

  it('경계 상자가 게이지에서 나온 cm 범위 안에 있다', () => {
    const neck = 18 * rh // 7.5cm
    const body = 75 * rh // 31.25cm
    const flatWidth = 94 * sw // 52.2cm
    expect(g.details.template).toBe('hood')
    if (g.details.template !== 'hood') return
    expect(g.details.neckRows).toBe(18)
    expect(g.details.bodyRows).toBe(75)
    expect(g.details.neckHeight).toBeCloseTo(neck, 6)
    expect(g.details.bodyLength).toBeCloseTo(body, 6)

    // 바닥은 코잡은 단. 머리 편물은 머리를 넘어가며 휘므로 높이는 "목 + 머리 길이의 절반"과 "목 + 머리 길이" 사이
    expect(Math.abs(g.bbox.min[1])).toBeLessThan(0.01)
    expect(g.bbox.size[1]).toBeGreaterThan(neck + body / 2)
    expect(g.bbox.size[1]).toBeLessThan(neck + body)
    // 폭 52cm인 편물이 머리를 반 넘게 감싼다: 지름은 폭의 절반보다 작고 폭 ÷ 2π 의 두 배보다 크다
    for (const axis of [0, 2]) {
      expect(g.bbox.size[axis]).toBeGreaterThan(flatWidth / Math.PI / 1.5)
      expect(g.bbox.size[axis]).toBeLessThan(flatWidth / 2)
    }
    // 고정 범위 (cm)
    expect(g.bbox.size[0]).toBeGreaterThan(14)
    expect(g.bbox.size[0]).toBeLessThan(24)
    expect(g.bbox.size[1]).toBeGreaterThan(25)
    expect(g.bbox.size[1]).toBeLessThan(36)
    expect(g.bbox.size[2]).toBeGreaterThan(14)
    expect(g.bbox.size[2]).toBeLessThan(24)
    // 좌우 대칭 (앞에서 겹친 끝만큼만 다르다)
    expect(Math.abs(g.bbox.min[0] + g.bbox.max[0])).toBeLessThan(1.5)
  })

  it('목 부분의 단은 아래에서 위로 쌓인다', () => {
    const neck = g.rows.filter((r) => r.section === 0)
    expect(neck.length).toBe(18)
    for (let i = 1; i < neck.length; i++) expect(neck[i].center[1], `${neck[i].g}단`).toBeGreaterThan(neck[i - 1].center[1])
    expect(neck[0].center[1]).toBeCloseTo(rh / 2, 4)
    // 머리 부분은 목 위에서 시작한다
    const body = g.rows.filter((r) => r.section > 0)
    expect(Math.min(...body.map((r) => r.center[1]))).toBeGreaterThan(neck[neck.length - 1].center[1])
  })

  it('도안의 오른쪽이 입은 사람의 오른쪽(-x)으로 가고, 가운데 코는 뒤(-z)에 온다', () => {
    const row = g.rows[0] // 1단, 겉면: 도안 오른쪽 끝에서 시작
    expect(row.side).toBe('RS')
    const quarter = row.first + Math.floor(row.count / 4)
    const centre = row.first + Math.floor(row.count / 2)
    expect(g.centers[quarter * 3]).toBeLessThan(-1)
    expect(g.centers[centre * 3 + 2]).toBeLessThan(0)
    // 뒤 가운데 코의 법선은 바깥(-z)을 본다
    expect(g.stitchNormals[centre * 3 + 2]).toBeLessThan(-0.9)
    // 안면 단은 반대쪽 끝에서 시작한다
    const ws = g.rows[1]
    expect(ws.side).toBe('WS')
    expect(g.centers[(ws.first + Math.floor(ws.count / 4)) * 3]).toBeGreaterThan(1)
  })

  it('마네킹이 편물 안에 들어간다', () => {
    const fit = g.mannequin!
    expect(fit.scale).toBeGreaterThan(0.6)
    expect(fit.scale).toBeLessThan(1.6)
    if (g.details.template !== 'hood') return
    for (let a = 0; a < 3; a++) expect(fit.head.radius[a]).toBeLessThan(g.details.shell.radius[a])
    // 머리 부분의 코는 모두 마네킹 머리 바깥에 있다
    let inside = 0
    for (const r of g.rows.filter((x) => x.section > 0)) {
      for (let q = r.first; q < r.first + r.count; q++) {
        const d = Math.hypot(
          (g.centers[q * 3] - fit.head.center[0]) / fit.head.radius[0],
          (g.centers[q * 3 + 1] - fit.head.center[1]) / fit.head.radius[1],
          (g.centers[q * 3 + 2] - fit.head.center[2]) / fit.head.radius[2],
        )
        if (d < 1) inside++
      }
    }
    expect(inside).toBe(0)
  })

  it('얼굴 가장자리의 접는 선(안뜨기 세로줄)을 찾아 안으로 접고, 끄면 접지 않는다', () => {
    expect(g.details.template === 'hood' && g.details.hem).toEqual({ right: 8, left: 8 })
    const open = buildGarment(e, 'hood', { gauge, faceHem: 'none' })
    checkStructure(e, open)
    expect(open.details.template === 'hood' && open.details.hem).toBeNull()
    // 접지 않으면 보이는 폭이 넓어진다
    expect(open.bbox.size[0]).toBeGreaterThan(g.bbox.size[0])
    const fixed = buildGarment(e, 'hood', { gauge, faceHem: 8 })
    expect(fixed.details.template === 'hood' && fixed.details.hem).toEqual({ right: 8, left: 8 })
  })

  it('진행 위치까지 뜬 코 수가 엔진과 같다', () => checkProgress(e, g))

  it('단의 중심선은 그 단의 코 중심을 뜬 순서대로 준다', () => {
    const line = rowLine(g, 3)
    expect(line.length).toBe(g.rows[2].count * 3)
    expect(line[0]).toBe(g.centers[g.rows[2].first * 3])
    expect(rowLine(g, 999).length).toBe(0)
  })

  it('게이지를 주지 않으면 기본 게이지로 만든다', () => {
    const d = buildGarment(e, 'hood')
    expect(d.gauge).toEqual(DEFAULT_GAUGE)
    checkStructure(e, d)
  })
})

describe('평면 템플릿: 가터 목도리', () => {
  const gauge = garterScarf.gauge!
  const e = expand(garterScarf)
  const g = buildGarment(e, 'flat', { gauge })

  it('정점 수 = 총 코 수 × 4', () => {
    checkStructure(e, g)
    expect(g.positions.length / 3).toBe(e.totalStitches * 4)
    // 고정 범위: 24코 × 91단
    expect(g.positions.length / 3).toBeGreaterThan(8_000)
    expect(g.positions.length / 3).toBeLessThan(9_500)
  })

  it('경계 상자가 코 수 × 코 폭, 단수 × 단 높이와 같다', () => {
    const width = 24 * (10 / gauge.stitches) // 15cm
    const height = e.totalRows * (10 / gauge.rows) // 30.3cm
    expect(g.bbox.size[0]).toBeCloseTo(width, 4)
    expect(g.bbox.size[1]).toBeCloseTo(height, 4)
    expect(g.bbox.size[2]).toBe(0)
    expect(g.bbox.min[0]).toBeCloseTo(-width / 2, 4)
    expect(g.bbox.min[1]).toBeCloseTo(0, 6)
    // 고정 범위 (cm)
    expect(g.bbox.size[0]).toBeGreaterThan(14)
    expect(g.bbox.size[0]).toBeLessThan(16)
    expect(g.bbox.size[1]).toBeGreaterThan(29)
    expect(g.bbox.size[1]).toBeLessThan(32)
    expect(g.mannequin).toBeNull()
  })

  it('단은 아래에서 위로, 겉면 단의 첫 코는 도안의 오른쪽(+x)에 놓인다', () => {
    for (let i = 1; i < g.rows.length; i++) expect(g.rows[i].center[1]).toBeGreaterThan(g.rows[i - 1].center[1])
    const rs = g.rows[0]
    expect(g.centers[rs.first * 3]).toBeGreaterThan(g.centers[(rs.first + rs.count - 1) * 3])
    const ws = g.rows[1]
    expect(g.centers[ws.first * 3]).toBeLessThan(g.centers[(ws.first + ws.count - 1) * 3])
    // 겉면이 +z를 본다
    expect(g.stitchNormals[2]).toBe(1)
  })

  it('진행 위치까지 뜬 코 수가 엔진과 같다', () => checkProgress(e, g))

  it('코 수가 바뀌는 편물은 사다리꼴이 된다', () => {
    // 후드 도안을 평면으로 펼치면 폭이 단마다의 코 수를 따라간다
    const he = expand(practiceHood)
    const flat = buildGarment(he, 'flat', { gauge: practiceHood.gauge })
    checkStructure(he, flat)
    const sw = 10 / practiceHood.gauge!.stitches
    for (const r of flat.rows) {
      if (r.count === 0) continue
      const xs: number[] = []
      for (let q = r.first; q < r.first + r.count; q++) for (let c = 0; c < 4; c++) xs.push(flat.positions[q * 12 + c * 3])
      expect(Math.max(...xs) - Math.min(...xs), `${r.g}단`).toBeCloseTo(r.count * sw, 3)
    }
    expect(flat.bbox.size[0]).toBeCloseTo(94 * sw, 3)
  })
})

describe('게이지를 다시 맞춘 후드', () => {
  const result = regauge(practiceHood, { stitches: 20, rows: 28 })

  it('다시 계산한 도안도 그대로 만들어지고 코 수가 맞는다', () => {
    expect(result.ok).toBe(true)
    const pattern = result.pattern!
    const e = expand(pattern)
    const g = buildGarment(e, 'hood', { gauge: pattern.gauge })
    checkStructure(e, g)
    checkProgress(e, g)
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(g.stitchCount).not.toBe(expand(practiceHood).totalStitches)

    // 코 수와 단수는 늘지만 완성 치수는 원래와 비슷하다
    const base = buildGarment(expand(practiceHood), 'hood', { gauge: practiceHood.gauge })
    for (let a = 0; a < 3; a++) {
      expect(g.bbox.size[a] / base.bbox.size[a]).toBeGreaterThan(0.9)
      expect(g.bbox.size[a] / base.bbox.size[a]).toBeLessThan(1.1)
    }
  })
})

const balaclava = loadBalaclava()

describe.skipIf(!balaclava)('후드 템플릿: private/ 의 실제 도안', () => {
  it('실제 도안 크기의 편물이 제시간에 만들어지고 경계 상자가 범위 안에 있다', () => {
    const pattern = balaclava!
    const e = expand(pattern)
    const t0 = performance.now()
    const g = buildGarment(e, 'hood', { gauge: pattern.gauge })
    const ms = performance.now() - t0
    checkStructure(e, g)
    checkProgress(e, g)
    expect(g.stitchCount).toBe(e.totalStitches)
    expect(g.stitchCount).toBeGreaterThan(5_000)
    expect(ms).toBeLessThan(1500)

    const sw = 10 / pattern.gauge!.stitches
    const rh = 10 / pattern.gauge!.rows
    const neck = e.sections[0].rows * rh
    const body = (e.totalRows - e.sections[0].rows) * rh
    const widest = Math.max(...allRows(e).map((r) => r.cells.length)) * sw
    expect(g.bbox.size[1]).toBeGreaterThan(neck + body / 2)
    expect(g.bbox.size[1]).toBeLessThan(neck + body)
    for (const axis of [0, 2]) {
      expect(g.bbox.size[axis]).toBeGreaterThan(widest / Math.PI / 1.5)
      expect(g.bbox.size[axis]).toBeLessThan(widest / 2)
    }
    // 고정 범위 (cm): 어른 머리에 맞는 크기
    expect(g.bbox.size[0]).toBeGreaterThan(17)
    expect(g.bbox.size[0]).toBeLessThan(26)
    expect(g.bbox.size[1]).toBeGreaterThan(30)
    expect(g.bbox.size[1]).toBeLessThan(42)
    expect(g.mannequin!.scale).toBeGreaterThan(0.9)
    expect(g.mannequin!.scale).toBeLessThan(1.1)
  })
})

describe('템플릿 고르기', () => {
  it('supportsTemplate은 실제로 그릴 수 있는 것만 참이다', () => {
    expect(supportsTemplate('hood')).toBe(true)
    expect(supportsTemplate('flat')).toBe(true)
    expect(supportsTemplate('tube')).toBe(false)
    expect(supportsTemplate('hat')).toBe(false)
    expect(supportsTemplate('none')).toBe(false)
    expect(supportsTemplate(undefined)).toBe(false)
    const e = expand(garterScarf)
    for (const t of ['hood', 'flat', 'tube', 'hat', 'none'] as const) {
      if (supportsTemplate(t)) expect(() => buildGarment(e, t)).not.toThrow()
      else expect(() => buildGarment(e, t)).toThrow(UnsupportedTemplateError)
    }
  })

  it('IR에 template이 있으면 그 값을 쓴다', () => {
    expect(suggestTemplate(practiceHood)).toBe('hood')
    expect(suggestTemplate(garterScarf)).toBe('flat')
    expect(suggestTemplate({ ...garterScarf, template: 'none' })).toBe('none')
    expect(suggestTemplate({ ...garterScarf, template: 'hat' })).toBe('hat')
  })

  it('template이 없으면 제목과 뜨는 방식으로 짐작한다', () => {
    const bare = (p: Pattern, patch: Partial<Pattern> = {}): Pattern => ({ ...p, template: undefined, ...patch })
    expect(suggestTemplate(bare(practiceHood))).toBe('hood')
    expect(suggestTemplate(bare(garterScarf))).toBe('flat')
    expect(suggestTemplate(bare(garterScarf, { title: '이름 없는 편물' }))).toBe('flat')
    expect(suggestTemplate(bare(garterScarf, { craft: 'crochet' }))).toBe('flat')
    expect(suggestTemplate(bare(garterScarf, { sections: [] }))).toBe('none')
    const round = garterScarf.sections.map((s) => ({ ...s, shape: 'round' as const }))
    expect(suggestTemplate(bare(garterScarf, { title: '이름 없는 편물', sections: round }))).toBe('tube')
    expect(suggestTemplate(bare(garterScarf, { title: '겨울 비니', sections: round }))).toBe('hat')
  })
})

describe('빈 도안과 구간이 모자란 도안', () => {
  const empty: Expanded = { blocks: [], sections: [], totalRows: 0, totalStitches: 0, issues: [] }

  it('코가 없어도 던지지 않는다', () => {
    for (const t of ['hood', 'flat'] as const) {
      const g = buildGarment(empty, t)
      expect(g.stitchCount).toBe(0)
      expect(g.positions.length).toBe(0)
      expect(g.bbox.size).toEqual([0, 0, 0])
      expect(knittedCount(g, { row: 3, stitch: 2 })).toBe(0)
      expect(stitchIndexAtColumn(g, 1, 0)).toBe(-1)
    }
  })

  it('구간이 하나뿐이면 목 없이 머리만 만든다', () => {
    const e = expand(garterScarf)
    const g = buildGarment(e, 'hood', { gauge: garterScarf.gauge })
    checkStructure(e, g)
    expect(g.details.template === 'hood' && g.details.neckRows).toBe(0)
    // 가장자리에 안뜨기 세로줄이 없는 편물은 접지 않는다
    expect(g.details.template === 'hood' && g.details.hem).toBeNull()
    expect(g.mannequin).not.toBeNull()
  })

  it('기호 번호는 기호 10가지의 순서를 따른다', () => {
    expect(SYMBOL_ORDER).toEqual(['K', 'P', 'YO', 'K2TOG', 'SSK', 'SK2P', 'M1L', 'M1R', 'CO', 'BO'])
  })
})
