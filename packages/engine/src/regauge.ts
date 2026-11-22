/**
 * 게이지 재계산. LLM 없이 엔진이 합니다.
 *  1. 코 수는 도안 코 수에 "내 코 게이지 ÷ 도안 코 게이지"를 곱하고 구간의 multiple에 맞게 반올림
 *  2. 늘림과 줄임의 횟수는 구간의 시작 코 수와 끝 코 수가 이어지도록 다시 정함
 *  3. 단 수로 적힌 구간은 단 게이지 비율로 조정하고, 겉면과 안면 순서가 유지되게 맞춤
 *  4. 길이로 적힌 구간은 길이를 그대로 두고 예상 단수만 다시 계산
 *  5. 결과를 엔진으로 다시 검산. 통과하지 못하면 다시 계산을 제안하지 않음
 *  6. 결과는 원본을 덮지 않는 파생 IR
 */
import type { GaugeSize, Issue, Pattern, Section } from '@stitch/pattern-ir'
import { expand } from './expand'
import { allRows } from './verify'

export type RegaugeSection = {
  id: string
  name: string
  start: { from: number; to: number }
  end: { from: number; to: number }
  rows: { from: number; to: number }
}

export type RegaugeResult = {
  ok: boolean
  /** 통과하지 못한 까닭. ok가 false일 때만 */
  reason?: string
  /** 파생 IR. 통과했을 때만 */
  pattern: Pattern | null
  factor: { stitches: number; rows: number }
  sections: RegaugeSection[]
  /** 완성 가로(cm): 도안 값, 도안 숫자 그대로 떴을 때, 다시 계산했을 때 */
  width: { pattern?: number; asIs?: number; recalculated?: number }
  issues: Issue[]
}

export function roundToMultiple(value: number, multiple?: { of: number; plus: number }): number {
  if (!multiple) return Math.max(1, Math.round(value))
  const k = Math.max(1, Math.round((value - multiple.plus) / multiple.of))
  return k * multiple.of + multiple.plus
}

/** v에 가장 가까우면서 홀짝이 parity와 같은 정수 */
function nearestWithParity(v: number, parity: number): number {
  const r = Math.round(v)
  if (((r % 2) + 2) % 2 === parity) return r
  return v >= r ? r + 1 : r - 1
}

type GroupInfo = {
  rows: number
  perRep: number
  times: number
  delta: number
  kind: 'times' | 'length'
  /** 이 묶음을 시작하기 전과 끝낸 뒤의 코 수 */
  before: number
  after: number
}

export function regauge(pattern: Pattern, mine: GaugeSize): RegaugeResult {
  const base = pattern.gauge
  const empty = { pattern: null, sections: [], width: {}, issues: [] }
  if (!base) return { ok: false, reason: '도안에 게이지가 없어 다시 계산할 수 없습니다.', factor: { stitches: 1, rows: 1 }, ...empty }
  const k = mine.stitches / base.stitches
  const rr = mine.rows / base.rows
  const factor = { stitches: k, rows: rr }

  const orig = expand(pattern)
  if (orig.issues.some((i) => i.level === 'error')) {
    return { ok: false, reason: '원본 도안이 검산을 통과하지 못해 다시 계산할 수 없습니다.', factor, ...empty, issues: orig.issues }
  }

  // 원본에서 묶음마다 코 수가 얼마나 바뀌는지 잽니다.
  const info: GroupInfo[][] = pattern.sections.map((s) => s.groups.map((g): GroupInfo => ({ rows: 0, perRep: g.rows.length, times: 0, delta: 0, kind: 'times' in g.repeat ? 'times' : 'length', before: -1, after: 0 })))
  {
    let prev = 0
    const startOf = new Map(orig.sections.map((s) => [s.firstRow, s.startCount]))
    for (const r of allRows(orig)) {
      if (startOf.has(r.g)) prev = startOf.get(r.g)!
      // 엔진이 만든 시작 단(시작 사슬, 매직링의 첫 단)은 IR의 묶음에 속하지 않습니다.
      if (r.start) {
        prev = r.count
        continue
      }
      // 같은 조각을 여러 개 만드는 구간은 첫 조각만 잽니다.
      if (r.copy !== undefined && r.copy > 1) continue
      const gi = info[r.ref.section][r.ref.group]
      if (gi.before < 0) gi.before = prev
      gi.rows += 1
      gi.times = Math.max(gi.times, r.ref.rep)
      gi.delta += r.count - prev
      gi.after = r.count
      prev = r.count
    }
  }

  const derived: Pattern = JSON.parse(JSON.stringify(pattern))
  derived.gauge = { ...base, stitches: mine.stitches, rows: mine.rows }
  for (const s of derived.sections) for (const g of s.groups) for (const r of g.rows) delete r.expect_count

  let prevEnd = 0
  pattern.sections.forEach((section, si) => {
    const sum = orig.sections[si]
    const out = derived.sections[si]
    const groups = info[si]
    const flat = section.shape === 'flat'

    const newStart = section.start.kind === 'continue' && si > 0 ? prevEnd : roundToMultiple(section.start.count * k, section.multiple)
    out.start = { ...out.start, count: newStart }

    // 여러 번 반복하는 늘림/줄임 묶음만 횟수를 다시 정합니다. 한 번뿐인 단은 그대로 둡니다.
    const shaping: number[] = []
    const plain: number[] = []
    let fixedDelta = 0
    let fixedRows = 0
    // 남은 코를 모두 막는 단(코막음)은 "몇 코 줄임"이 아니라 "0코까지"입니다.
    // 고정된 증감으로 세지 않고, 그 앞까지의 코 수를 목표로 잡습니다.
    let beforeBindOff: number | null = null
    groups.forEach((g, gi) => {
      const perRepDelta = g.times > 0 ? g.delta / g.times : 0
      const bindsOffAll = g.kind === 'times' && g.times === 1 && g.after === 0 && g.before > 0
      if (g.kind === 'times' && g.times > 1 && perRepDelta !== 0 && Number.isInteger(perRepDelta)) shaping.push(gi)
      else if (bindsOffAll) {
        if (beforeBindOff === null) beforeBindOff = g.before
        fixedRows += g.rows
      } else {
        fixedDelta += g.delta
        if (g.kind === 'times') {
          if (g.times > 1 && g.delta === 0) plain.push(gi)
          else fixedRows += g.rows
        }
      }
    })

    const timesRows = groups.filter((g) => g.kind === 'times').reduce((a, g) => a + g.rows, 0)
    const targetRows = flat ? nearestWithParity(timesRows * rr, timesRows % 2) : Math.round(timesRows * rr)
    const newTimes = groups.map((g) => g.times)

    if (shaping.length > 0 && shaping.length <= 3) {
      const targetEnd = Math.round((beforeBindOff ?? sum.endCount) * k)
      const want = targetEnd - newStart - fixedDelta
      const d = shaping.map((gi) => groups[gi].delta / groups[gi].times)
      const shapingRows = shaping.reduce((a, gi) => a + groups[gi].rows, 0)
      const wantRows = shapingRows * rr
      let best: { t: number[]; score: [number, number, number, number] } | null = null
      const t: number[] = []
      const search = (i: number) => {
        if (i === shaping.length) {
          const got = t.reduce((a, v, j) => a + v * d[j], 0)
          const rows = t.reduce((a, v, j) => a + v * groups[shaping[j]].perRep, 0)
          const parity = flat && rows % 2 !== shapingRows % 2 ? 1 : 0
          const score: [number, number, number, number] = [
            Math.abs(got - want),
            parity,
            Math.abs(rows - wantRows),
            t.reduce((a, v, j) => a + Math.abs(v - groups[shaping[j]].times), 0),
          ]
          if (!best || less(score, best.score)) best = { t: [...t], score }
          return
        }
        const cur = groups[shaping[i]].times
        const hi = Math.max(cur * 3, cur + 8)
        for (let v = 1; v <= hi; v++) {
          t[i] = v
          search(i + 1)
        }
      }
      search(0)
      if (best) shaping.forEach((gi, j) => (newTimes[gi] = best!.t[j]))
    }

    // 코 수가 변하지 않는 반복 묶음은 단 게이지 비율로 늘리거나 줄입니다.
    const rowsOf = (gi: number) => newTimes[gi] * groups[gi].perRep
    const stepOf = (gi: number) => (groups[gi].perRep % 2 === 0 || !flat ? 1 : 2)
    let current = fixedRows + [...shaping, ...plain].reduce((a, gi) => a + rowsOf(gi), 0)
    for (let guard = 0; guard < 200 && plain.length; guard++) {
      const need = targetRows - current
      if (need === 0) break
      const dir = need > 0 ? 1 : -1
      let pick = -1
      let bestGain = -Infinity
      for (const gi of plain) {
        const step = stepOf(gi)
        const rowsStep = step * groups[gi].perRep
        if (dir < 0 && newTimes[gi] - step < 1) continue
        if (rowsStep > Math.abs(need) * 2 - 1 && rowsStep !== Math.abs(need)) continue
        const gain = dir * (groups[gi].rows * rr - rowsOf(gi)) / rowsStep
        if (gain > bestGain) {
          bestGain = gain
          pick = gi
        }
      }
      if (pick < 0) break
      newTimes[pick] += dir * stepOf(pick)
      current += dir * stepOf(pick) * groups[pick].perRep
    }

    section.groups.forEach((g, gi) => {
      const og = out.groups[gi]
      if ('times' in g.repeat) og.repeat = { times: newTimes[gi] }
      else if (g.repeat.rows !== undefined) {
        // 사람이 정해 둔 단수도 단 게이지 비율로 옮깁니다.
        og.repeat = { ...g.repeat, rows: flat ? nearestWithParity(g.repeat.rows * rr, g.repeat.rows % 2) : Math.round(g.repeat.rows * rr) }
      }
    })

    // 이 구간이 실제로 몇 코로 끝나는지는 엔진으로 확인합니다.
    const partial = expand({ ...derived, sections: derived.sections.slice(0, si + 1) }, { gauge: mine })
    prevEnd = partial.sections[si]?.endCount ?? newStart
  })

  const result = expand(derived, { gauge: mine })
  const errors = result.issues.filter((i) => i.level === 'error')
  const sections: RegaugeSection[] = orig.sections.map((s, i) => ({
    id: s.id,
    name: s.name,
    start: { from: s.startCount, to: result.sections[i]?.startCount ?? 0 },
    end: { from: s.endCount, to: result.sections[i]?.endCount ?? 0 },
    rows: { from: s.rows, to: result.sections[i]?.rows ?? 0 },
  }))
  const width = widths(pattern, mine, orig, result)
  if (errors.length > 0) {
    return { ok: false, reason: '다시 계산한 숫자가 검산을 통과하지 못했습니다. 바늘을 바꿔 게이지를 맞춰 주세요.', pattern: null, factor, sections, width, issues: result.issues }
  }

  // 파생 IR이 스스로 맞도록, 원본에 코 수가 적혀 있던 단에는 새 코 수를 적어 둡니다.
  const counted = new Map<string, number>()
  for (const r of allRows(result)) counted.set(`${r.ref.section}:${r.ref.group}:${r.ref.row}:${r.ref.rep}`, r.count)
  pattern.sections.forEach((s: Section, si) =>
    s.groups.forEach((g, gi) =>
      g.rows.forEach((r, ri) => {
        const og = derived.sections[si].groups[gi]
        const single = 'times' in og.repeat && og.repeat.times === 1
        const c = counted.get(`${si}:${gi}:${ri}:1`)
        if (r.expect_count !== undefined && single && c !== undefined) og.rows[ri].expect_count = c
      }),
    ),
  )

  return { ok: true, pattern: derived, factor, sections, width, issues: result.issues }
}

function less(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - 1e-9) return true
    if (a[i] > b[i] + 1e-9) return false
  }
  return false
}

function widths(pattern: Pattern, mine: GaugeSize, orig: ReturnType<typeof expand>, next: ReturnType<typeof expand>) {
  const w = pattern.finished.width_cm
  const base = pattern.gauge
  if (!w || !base) return {}
  const widest = (e: ReturnType<typeof expand>) => Math.max(1, ...allRows(e).map((r) => r.count))
  const a = widest(orig)
  const b = widest(next)
  return {
    pattern: w,
    asIs: (w * base.stitches) / mine.stitches,
    recalculated: w * (b / a) * (base.stitches / mine.stitches),
  }
}

/** 게이지가 도안과 얼마나 다른지. 2% 안쪽이면 같다고 봅니다. */
export type GaugeComparison = {
  stitchPct: number
  rowPct: number
  /** 코 게이지(가로)가 도안과 같은지. 가로 크기와 코 수를 결정합니다 */
  same: boolean
  /** 단 게이지(세로)가 도안과 같은지. 단 수로 적힌 구간의 길이를 결정합니다 */
  sameRows: boolean
  /** 코와 단이 모두 같은지. 이때만 "도안과 같은 게이지"입니다 */
  sameBoth: boolean
  tighter: boolean
}

export function compareGauge(pattern: GaugeSize, mine: GaugeSize): GaugeComparison {
  const stitchPct = Math.round(Math.abs(mine.stitches / pattern.stitches - 1) * 100)
  const rowPct = Math.round(Math.abs(mine.rows / pattern.rows - 1) * 100)
  const same = stitchPct < 2
  const sameRows = rowPct < 2
  return { stitchPct, rowPct, same, sameRows, sameBoth: same && sameRows, tighter: mine.stitches > pattern.stitches }
}
