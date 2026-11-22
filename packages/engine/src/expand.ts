/**
 * 코 수 검산 엔진.
 * IR을 한 코씩 따라가며 기둥(코가 위로 이어지는 열)을 추적하고,
 * 단마다 코 수를 계산해 도안에 적힌 코 수와 비교합니다.
 * 잘못된 IR(LLM이 만든 초안)에서도 멈추지 않고 문제를 모아 돌려줍니다.
 */
import {
  getStitch,
  type ChartBlock,
  type Expanded,
  type ExpandedRow,
  type GaugeSize,
  type Issue,
  type Op,
  type Pattern,
  type Row,
  type Section,
  type SectionSummary,
  type Segment,
  type Side,
  type SymbolId,
} from '@stitch/pattern-ir'

type Face = 'K' | 'P'
const FLIP: Record<Face, Face> = { K: 'P', P: 'K' }

class Col {
  alive = true
  diedAt = -1
  /** 줄임으로 사라진 자리를 같은 단의 늘림이 이어받은 경우 */
  mergedInto: Col | null = null
  constructor(
    /** 겉면에서 본 모습. "무늬에 맞춰 뜨기"의 기준 */
    public base: Face,
    public born: number,
  ) {}
}

type Marker = {
  /** 겉면 순서로 이 마커 앞에 있는 살아 있는 코의 수 */
  gapRS: number
}

type Cell = { col: Col; sym: SymbolId; k: number }

type RawRow = Omit<ExpandedRow, 'cells' | 'segments' | 'markers'> & {
  cells: Cell[]
  segments: { text: string; tech: string; cols: Col[] }[]
  markerCols: Col[]
}

type Block = { name: string; cols: Col[]; rows: RawRow[] }

export type ExpandOptions = {
  /** 길이로 적힌 구간의 단수를 추정할 게이지. 없으면 도안의 게이지를 씁니다. */
  gauge?: GaugeSize | null
}

const SIDE_KR: Record<Side, string> = { RS: '겉면', WS: '안면', round: '원통' }

/** 평면뜨기는 겉면과 안면 순서가 유지되도록 단수를 짝수로 맞춥니다. */
export function rowsForLength(cm: number, rowGauge: number, flat = true): number {
  let n = Math.round((cm * rowGauge) / 10)
  if (flat && n % 2 === 1) n += 1
  return Math.max(0, n)
}

export function expand(pattern: Pattern, options: ExpandOptions = {}): Expanded {
  const issues: Issue[] = []
  const blocks: Block[] = []
  const summaries: SectionSummary[] = []
  const gauge: GaugeSize | null = options.gauge ?? pattern.gauge ?? null
  const sectionFirstRow = new Map<string, number>()

  let g = 0
  let block: Block | null = null
  let markers: Marker[] = []
  let lastSide: Side | null = null

  const live = (b: Block) => b.cols.filter((c) => c.alive)

  pattern.sections.forEach((section, si) => {
    const startCount = beginSection(section, si)
    const b = block!
    const first = g + 1
    sectionFirstRow.set(section.id, first)
    let sectionRow = 0

    section.groups.forEach((group, gi) => {
      const repeat = group.repeat
      const perRep = group.rows.length
      let total: number
      let estimated = false
      if ('times' in repeat) {
        total = repeat.times * perRep
      } else {
        const origin = sectionFirstRow.get(repeat.from)
        if (origin === undefined) {
          issues.push({ level: 'error', code: 'needs_gauge', message: `길이를 재는 기준 구간 "${repeat.from}"을 찾을 수 없습니다.`, ref: { section: si, group: gi } })
          total = 0
        } else if (repeat.rows !== undefined) {
          total = repeat.rows
        } else if (!gauge) {
          issues.push({ level: 'error', code: 'needs_gauge', message: `${repeat.until_cm}cm 구간은 게이지가 없어 단수를 정할 수 없습니다. 단수를 직접 넣어 주세요.`, ref: { section: si, group: gi } })
          total = 0
        } else {
          estimated = true
          const target = rowsForLength(repeat.until_cm, gauge.rows, section.shape === 'flat')
          const done = g - origin + 1
          total = Math.max(0, target - done)
          issues.push({
            level: 'info',
            code: 'estimated_rows',
            message: `${repeat.until_cm}cm 구간은 게이지(10cm에 ${gauge.rows}단)로 ${total}단을 추정했습니다. 실제 길이를 재며 뜨세요.`,
            g: g + 1,
            ref: { section: si, group: gi },
            actual: total,
          })
        }
      }
      const times = 'times' in repeat ? repeat.times : Math.ceil(total / perRep)
      for (let i = 0; i < total; i++) {
        const ri = i % perRep
        const rep = Math.floor(i / perRep) + 1
        const row = group.rows[ri]
        g += 1
        sectionRow += 1
        const side = resolveSide(section, row, rep, si, gi, ri)
        const base = row.label ?? `${sectionRow}단`
        const label = `${base}(${SIDE_KR[side]})` + (times > 1 ? ` · ${rep}/${times}회` : '')
        runRow(b, row, side, label, section, { section: si, group: gi, row: ri, rep }, estimated)
        lastSide = side
      }
    })

    if (g < first) {
      issues.push({ level: 'warn', code: 'empty', message: `"${section.name}" 구간에 단이 없습니다.`, ref: { section: si } })
    }
    summaries.push({
      id: section.id,
      name: section.name,
      block: blocks.indexOf(b),
      firstRow: first,
      lastRow: g,
      startCount,
      endCount: live(b).length,
      rows: g - first + 1,
    })
  })

  return finish()

  // ---------------------------------------------------------------------

  function beginSection(section: Section, si: number): number {
    const start = section.start
    if (start.kind === 'continue' && block) {
      const prev: Block = block
      const alive = live(prev)
      if (alive.length !== start.count && start.count > 0) {
        issues.push({
          level: 'error',
          code: 'start_mismatch',
          message: `"${section.name}"은 ${start.count}코로 시작한다고 적혀 있지만, 앞 구간은 ${alive.length}코로 끝납니다.`,
          g: g + 1,
          ref: { section: si },
          expected: start.count,
          actual: alive.length,
        })
      }
      // 줄어서 빈 기둥이 생겼으면 새 격자로 정리하고, 아니면 같은 격자를 이어 씁니다.
      if (prev.cols.some((c) => !c.alive)) {
        block = { name: section.id, cols: alive.map((c) => new Col(c.base, g)), rows: [] }
        blocks.push(block)
      }
      return alive.length
    }
    // 새로 코를 잡는 구간. 첫 단이 기둥의 무늬를 정합니다.
    const cols: Col[] = []
    for (let i = 0; i < start.count; i++) cols.push(new Col('K', g))
    block = { name: section.id, cols, rows: [] }
    blocks.push(block)
    markers = []
    lastSide = null
    checkMultiple(section, start.count, si)
    return start.count
  }

  function checkMultiple(section: Section, count: number, si: number) {
    const m = section.multiple
    if (!m) return
    if ((count - m.plus) % m.of !== 0 || count < m.plus) {
      issues.push({
        level: 'warn',
        code: 'multiple_mismatch',
        message: `"${section.name}"의 시작 코 수 ${count}코가 무늬 반복 단위(${m.of}의 배수 + ${m.plus})에 맞지 않습니다.`,
        ref: { section: si },
        actual: count,
      })
    }
  }

  function resolveSide(section: Section, row: Row, rep: number, si: number, gi: number, ri: number): Side {
    if (section.shape !== 'flat') return 'round'
    const declared: Side = row.side === 'round' ? 'RS' : row.side
    if (lastSide === null || lastSide === 'round') return declared
    const expected: Side = lastSide === 'RS' ? 'WS' : 'RS'
    if (declared !== expected && rep === 1) {
      issues.push({
        level: 'warn',
        code: 'side_order',
        message: `${g}단은 ${SIDE_KR[expected]}이어야 순서가 맞는데 도안에는 ${SIDE_KR[declared]}으로 적혀 있습니다.`,
        g,
        ref: { section: si, group: gi, row: ri },
      })
      return declared
    }
    return rep === 1 ? declared : expected
  }

  function runRow(
    b: Block,
    row: Row,
    side: Side,
    label: string,
    section: Section,
    ref: ExpandedRow['ref'],
    estimated: boolean,
  ) {
    const rs = side !== 'WS'
    const before = live(b)
    const order = rs ? before : [...before].reverse()
    const total = order.length
    let pos = 0
    const produced: Cell[] = []
    const segments: RawRow['segments'] = []
    const markerCols: Col[] = []
    const newborn: Col[] = []

    // 이 단에서 마커가 놓인 자리: 뜨는 순서로 그 앞에 있는 코의 수
    type Pending = { m: Marker; gap: number; passed: boolean; workedBefore: number }
    const pend: Pending[] = markers.map((m) => ({ m, gap: rs ? m.gapRS : total - m.gapRS, passed: false, workedBefore: 0 }))
    const placed: Pending[] = []
    const removed = new Set<Marker>()

    const nextMarker = () => {
      let best: Pending | null = null
      for (const p of pend) if (!p.passed && p.gap >= pos && (!best || p.gap < best.gap)) best = p
      return best
    }
    const pass = (p: Pending) => {
      p.passed = true
      p.workedBefore = produced.length
    }
    const issue = (level: Issue['level'], code: Issue['code'], message: string, extra: Partial<Issue> = {}) =>
      issues.push({ level, code, message, g, ref: { section: ref.section, group: ref.group, row: ref.row }, ...extra })

    const insertNew = (c: Col) => {
      const anchor = produced.length ? produced[produced.length - 1].col : null
      let idx: number
      if (anchor) {
        const at = b.cols.indexOf(anchor)
        idx = rs ? at + 1 : at
      } else if (order.length) {
        const at = b.cols.indexOf(order[0])
        idx = rs ? at : at + 1
      } else {
        idx = rs ? 0 : b.cols.length
      }
      b.cols.splice(idx, 0, c)
      newborn.push(c)
    }

    const doStitch = (id: string, n: number, sink: Col[]): boolean => {
      const def = getStitch(id)
      if (!def) {
        issue('error', 'unknown_stitch', `코 사전에 없는 코입니다: "${id}"`)
        return false
      }
      for (let i = 0; i < n; i++) {
        const need = def.consumes
        if (pos + need > total) {
          issue('error', 'overrun', `${label}: 남은 코보다 많이 뜨도록 적혀 있습니다. (${def.name.kr}, 남은 코 ${total - pos})`)
          return false
        }
        if (need > 0) {
          for (const p of pend) {
            if (p.passed) continue
            if (p.gap === pos) pass(p)
            else if (p.gap > pos && p.gap < pos + need) {
              issue('warn', 'marker_inside', `${label}: 마커가 ${def.name.kr} 안에 걸립니다.`)
              pass(p)
            }
          }
        }
        const used = order.slice(pos, pos + need)
        pos += need
        if (def.produces === 0) {
          for (const c of used) {
            c.alive = false
            c.diedAt = g
          }
          // 코막음도 기호 도안에는 한 칸으로 남깁니다.
          if (def.symbol && def.symbol !== 'as_set' && used[0]) {
            produced.push({ col: used[0], sym: def.symbol, k: produced.length })
            sink.push(used[0])
          }
          continue
        }
        if (need === 0) {
          for (let j = 0; j < def.produces; j++) {
            const c = new Col('K', g)
            insertNew(c)
            produced.push({ col: c, sym: (def.symbol === 'as_set' || !def.symbol ? 'K' : def.symbol) as SymbolId, k: produced.length })
            sink.push(c)
          }
          continue
        }
        const keep = used[Math.min(def.keep ?? 0, used.length - 1)]
        for (const c of used) {
          if (c !== keep) {
            c.alive = false
            c.diedAt = g
          }
        }
        let sym: SymbolId
        if (def.symbol === 'as_set') {
          sym = keep.base
        } else if (def.symbol === 'K' || def.symbol === 'P') {
          sym = rs ? def.symbol : FLIP[def.symbol]
          keep.base = sym
        } else {
          sym = (def.symbol ?? 'K') as SymbolId
          if (def.face) keep.base = rs ? def.face : FLIP[def.face]
        }
        produced.push({ col: keep, sym, k: produced.length })
        sink.push(keep)
        // 한 코에서 여러 코를 만드는 경우 (코바늘 늘림 등)
        for (let j = 1; j < def.produces; j++) {
          const c = new Col(keep.base, g)
          insertNew(c)
          produced.push({ col: c, sym, k: produced.length })
          sink.push(c)
        }
      }
      return true
    }

    const doMarker = (kind: 'place' | 'slip' | 'remove') => {
      const here = pend.find((x) => !x.passed && x.gap === pos)
      if (kind === 'place') {
        // 이미 마커가 있는 자리에 다시 걸라고 하면 그 마커를 넘긴 것으로 봅니다.
        if (here) pass(here)
        else placed.push({ m: { gapRS: 0 }, gap: pos, passed: true, workedBefore: produced.length })
      } else if (!here) {
        issue('warn', 'marker_missing', `${label}: 마커를 ${kind === 'slip' ? '넘기라고' : '빼라고'} 적혀 있지만 이 자리에 마커가 없습니다.`)
        return
      } else {
        pass(here)
        if (kind === 'remove') removed.add(here.m)
      }
      if (produced.length) markerCols.push(produced[produced.length - 1].col)
    }

    const runOps = (ops: Op[], sink: Col[]): boolean => {
      for (const op of ops) {
        if ('st' in op) {
          if (!doStitch(op.st, op.n, sink)) return false
        } else if ('marker' in op) {
          doMarker(op.marker)
        } else if ('times' in op) {
          for (let i = 0; i < op.times; i++) if (!runOps(op.repeat, sink)) return false
        } else {
          let stop: number
          const u = op.until
          if (u === 'end') stop = total
          else if (u === 'marker' || (typeof u === 'object' && 'before_marker' in u)) {
            const m = nextMarker()
            if (!m) {
              issue('error', 'marker_missing', `${label}: "마커까지"라고 적혀 있지만 남은 마커가 없습니다.`)
              return false
            }
            stop = m.gap - (u === 'marker' ? 0 : u.before_marker)
          } else if ('before_center' in u) stop = Math.floor(total / 2) - u.before_center
          else stop = total - u.remaining
          if (stop < pos) {
            issue('error', 'overrun', `${label}: 반복을 끝낼 자리를 이미 지났습니다.`)
            return false
          }
          let guard = 0
          while (pos < stop) {
            const at = pos
            if (!runOps(op.repeat, sink)) return false
            if (pos === at || ++guard > 100000) {
              issue('error', 'overrun', `${label}: 반복이 코를 쓰지 않아 끝나지 않습니다.`)
              return false
            }
          }
          if (pos > stop) issue('warn', 'overrun', `${label}: 반복이 정해진 자리를 ${pos - stop}코 넘어갔습니다.`)
        }
      }
      return true
    }

    let ok = true
    for (const op of row.ops) {
      const sink: Col[] = []
      if (ok) ok = runOps([op], sink)
      segments.push({ text: op.text ?? describeOp(op), tech: techOf(op), cols: sink })
    }
    if (pos < total) {
      if (ok) issue('error', 'leftover', `${label}: 단이 끝났는데 ${total - pos}코가 남습니다.`, { actual: total - pos })
      // 남은 코는 무늬대로 뜬 것으로 두어 뒤 단을 계속 따라갑니다.
      const sink: Col[] = []
      for (const c of order.slice(pos)) {
        produced.push({ col: c, sym: c.base, k: produced.length })
        sink.push(c)
      }
      pos = total
      segments.push({ text: '(남은 코)', tech: 'PAT', cols: sink })
    }
    for (const p of pend) if (!p.passed) pass(p)

    // 같은 단에서 줄어든 자리 바로 옆에 새 코가 생기면 그 자리를 이어받습니다. (바늘비우기 + 모아뜨기)
    for (const n of newborn) {
      const at = b.cols.indexOf(n)
      for (const d of [b.cols[at - 1], b.cols[at + 1]]) {
        if (d && !d.alive && d.diedAt === g && !d.mergedInto) {
          d.mergedInto = n
          n.base = d.base
          b.cols.splice(b.cols.indexOf(d), 1)
          break
        }
      }
    }

    const count = live(b).length
    markers = [...pend.filter((p) => !removed.has(p.m)), ...placed].map((p) => {
      p.m.gapRS = rs ? p.workedBefore : count - p.workedBefore
      return p.m
    })
    markers.sort((a, z) => a.gapRS - z.gapRS)

    if (row.expect_count !== undefined && row.expect_count !== count) {
      issue('error', 'count_mismatch', `${label}: 도안에는 ${row.expect_count}코라고 적혀 있지만 계산하면 ${count}코입니다.`, {
        expected: row.expect_count,
        actual: count,
      })
    }

    b.rows.push({
      g,
      side,
      label,
      instr: row.text,
      sectionId: section.id,
      section: section.name,
      count,
      expect: row.expect_count,
      cells: produced,
      segments,
      markerCols,
      estimated: estimated || undefined,
      ref,
    })
  }

  function finish(): Expanded {
    let totalStitches = 0
    const out: ChartBlock[] = blocks.map((b) => {
      const W = b.cols.length
      const xpos = new Map<Col, number>()
      b.cols.forEach((c, i) => xpos.set(c, W - 1 - i))
      const x = (c: Col): number => {
        let cur = c
        while (cur.mergedInto) cur = cur.mergedInto
        return xpos.get(cur) ?? 0
      }
      const rows: ExpandedRow[] = b.rows.map((r) => {
        totalStitches += r.cells.length
        const segments: Segment[] = r.segments.map((s) => ({ text: s.text, tech: s.tech, xs: s.cols.map(x) }))
        const { markerCols, cells, ...rest } = r
        return { ...rest, cells: cells.map((c) => ({ x: x(c.col), k: c.k, s: c.sym })), segments, markers: markerCols.map(x) }
      })
      return { name: b.name, W, rows }
    })
    return { blocks: out, sections: summaries, totalRows: g, totalStitches, issues }
  }
}

// ---------------------------------------------------------------------------

function stitchKr(id: string): string {
  return getStitch(id)?.name.kr ?? id
}

/** 조각의 원문 표현이 없을 때 쓰는 설명 */
export function describeOp(op: Op): string {
  if ('marker' in op) return op.marker === 'place' ? '마커 걸기' : op.marker === 'slip' ? '마커 넘기기' : '마커 빼기'
  if ('st' in op) {
    const id = op.st.toLowerCase()
    if (id === 'k') return `겉${op.n}`
    if (id === 'p') return `안${op.n}`
    if (id === 'pat') return `${op.n}코 무늬에 맞춰 뜨기`
    if (id === 'co') return `감아코 ${op.n}코 만들기`
    if (id === 'bo') return `${op.n}코 코막음`
    return op.n > 1 ? `${stitchKr(id)} ${op.n}번` : stitchKr(id)
  }
  const inner = op.repeat.map(describeOp).join(', ')
  const body = op.repeat.length === 1 && 'st' in op.repeat[0] ? simpleName(op.repeat[0].st) : `(${inner}) 반복`
  if ('times' in op) return op.times === 1 ? inner : `(${inner}) ${op.times}번`
  const u = op.until
  if (u === 'end') return `끝까지 ${body}`
  if (u === 'marker') return `마커까지 ${body}`
  if ('before_marker' in u) return `마커 ${u.before_marker}코 전까지 ${body}`
  if ('before_center' in u) return u.before_center === 0 ? `가운데까지 ${body}` : `가운데 ${u.before_center}코 전까지 ${body}`
  return u.remaining === 0 ? `끝까지 ${body}` : `마지막 ${u.remaining}코 남을 때까지 ${body}`
}

function simpleName(id: string): string {
  const s = id.toLowerCase()
  if (s === 'k') return '겉뜨기'
  if (s === 'p') return '안뜨기'
  if (s === 'pat') return '무늬에 맞춰 뜨기'
  return stitchKr(s)
}

/** 조각을 대표하는 뜨는 법. 단계별 안내가 기호별 뜨는 법을 고르는 데 씁니다. */
export function techOf(op: Op): string {
  const ids: string[] = []
  const walk = (o: Op) => {
    if ('st' in o) ids.push(o.st.toLowerCase())
    else if ('repeat' in o) o.repeat.forEach(walk)
  }
  walk(op)
  const uniq = [...new Set(ids)]
  if (uniq.length === 0) return 'K'
  const special = uniq.filter((i) => i !== 'k' && i !== 'p' && i !== 'pat')
  if (uniq.includes('yo') && special.length > 1) return 'BH'
  if (special.length) return (getStitch(special[0])?.symbol as string) ?? special[0].toUpperCase()
  if (uniq.includes('pat')) return 'PAT'
  if (uniq.length > 1) return 'RIB'
  return uniq[0].toUpperCase()
}
