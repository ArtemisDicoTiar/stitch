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
  type Into,
  type Issue,
  type Op,
  type Pattern,
  type Row,
  type Section,
  type SectionSummary,
  type Segment,
  type Side,
  type StitchDef,
  type SymbolId,
} from '@stitch/pattern-ir'

type Face = 'K' | 'P'
const FLIP: Record<Face, Face> = { K: 'P', P: 'K' }

/**
 * 기둥의 종류.
 * - st: 코
 * - ch: 사슬. 다음 단에서 하나씩 뜰 수도 있고, 이어진 사슬을 "공간"으로 묶어 뜰 수도 있습니다
 * - ring: 매직링. 코가 아니고, 첫 단이 그 안에 뜨는 자리입니다
 */
type ColKind = 'st' | 'ch' | 'ring'

class Col {
  alive = true
  diedAt = -1
  /** 줄임으로 사라진 자리를 같은 단의 늘림이 이어받은 경우 */
  mergedInto: Col | null = null
  constructor(
    /** 겉면에서 본 모습. "무늬에 맞춰 뜨기"의 기준 */
    public base: Face,
    public born: number,
    public kind: ColKind = 'st',
  ) {}
}

type Marker = {
  /** 겉면 순서로 이 마커 앞에 있는 살아 있는 코의 수 */
  gapRS: number
}

type Cell = { col: Col; sym: SymbolId; k: number; added?: true }

/** 코 하나를 뜨는 방법: 아랫단에서 쓰는 기둥 수와 새로 생기는 칸 수 */
type Work = { need: number; make: number }

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
/** 코바늘에서는 둘러 뜨는 단을 원통이 아니라 원형이라고 부릅니다. */
const SIDE_KR_CROCHET: Record<Side, string> = { ...SIDE_KR, round: '원형' }

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
  /** 지금 뜨는 조각의 번호와, 그 조각의 첫 단에 붙일 시작 방법 */
  let piece = -1
  let opening: ExpandedRow['opens'] | null = null
  /** 단에 붙이는 조각 표시. 조각의 첫 단에서 한 번만 시작 방법을 붙입니다. */
  const pieceMark = (): Pick<ExpandedRow, 'piece' | 'opens'> => {
    const mark = { ...(piece > 0 ? { piece } : {}), ...(opening ? { opens: opening } : {}) }
    opening = null
    return mark
  }

  const crochet = pattern.craft === 'crochet'
  const sideKr = crochet ? SIDE_KR_CROCHET : SIDE_KR
  /** 사전에 기호가 없는 코를 그릴 때 쓰는 기호 */
  const plain: SymbolId = crochet ? 'SC' : 'K'
  const live = (b: Block) => b.cols.filter((c) => c.alive)
  /** 코 수. 매직링은 코가 아니라서 세지 않습니다. */
  const stitches = (b: Block) => b.cols.filter((c) => c.alive && c.kind !== 'ring')

  pattern.sections.forEach((section, si) => {
    // 같은 조각을 여러 개 만드는 구간은 조각마다 처음부터 다시 뜹니다. 이어 뜨는 구간에는 해당하지 않습니다.
    const copies = section.start.kind === 'continue' ? 1 : (section.copies ?? 1)
    let summary: SectionSummary | null = null
    for (let copy = 1; copy <= copies; copy++) {
      const one = runSection(section, si, copies > 1 ? copy : 0, copies)
      if (!summary) summary = one
      else {
        summary.lastRow = one.lastRow
        summary.rows += one.rows
      }
    }
    if (summary) summaries.push(copies > 1 ? { ...summary, copies } : summary)
  })

  return finish()

  // ---------------------------------------------------------------------

  /** 구간 하나를 한 번 뜹니다. copy는 몇 번째 조각인지 (하나만 만들면 0). */
  function runSection(section: Section, si: number, copy: number, copies: number): SectionSummary {
    const startCount = beginSection(section, si)
    const b = block!
    const which = copy > 0 ? ` · ${copy}/${copies}번째` : ''
    const first = g + 1
    sectionFirstRow.set(section.id, first)
    let sectionRow = startRows(section, si, b, copy, which)

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
        const label = `${base}(${sideKr[side]})` + (times > 1 ? ` · ${rep}/${times}회` : '') + which
        runRow(b, row, side, label, section, { section: si, group: gi, row: ri, rep }, estimated, undefined, copy)
        lastSide = side
      }
    })

    if (g < first) {
      issues.push({ level: 'warn', code: 'empty', message: `"${section.name}" 구간에 단이 없습니다.`, ref: { section: si } })
    }
    return {
      id: section.id,
      name: section.name,
      block: blocks.indexOf(b),
      firstRow: first,
      lastRow: g,
      startCount,
      endCount: stitches(b).length,
      rows: g - first + 1,
    }
  }

  function beginSection(section: Section, si: number): number {
    const start = section.start
    if (start.kind === 'continue' && block) {
      const prev: Block = block
      const alive = stitches(prev)
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
        block = { name: section.id, cols: alive.map((c) => new Col(c.base, g, c.kind)), rows: [] }
        blocks.push(block)
      }
      return alive.length
    }
    // 새로 코를 잡는 구간. 첫 단이 기둥의 무늬를 정합니다.
    piece += 1
    opening = start.kind === 'continue' ? 'cast_on' : start.kind
    const cols: Col[] = []
    if (crochet && start.kind === 'ring') {
      // 매직링은 한 자리입니다. 첫 단이 그 안에 뜹니다.
      cols.push(new Col('K', g, 'ring'))
    } else {
      const kind: ColKind = crochet && start.kind === 'chain' ? 'ch' : 'st'
      for (let i = 0; i < start.count; i++) cols.push(new Col('K', g, kind))
    }
    block = { name: section.id, cols, rows: [] }
    blocks.push(block)
    markers = []
    lastSide = null
    checkMultiple(section, start.count, si)
    return start.count
  }

  /**
   * 코바늘 구간의 시작을 단으로 펼칩니다. 구간의 단 번호를 얼마나 썼는지 돌려줍니다.
   * - 시작 사슬: 사슬 단 하나. "1단"은 그 위에 뜨는 첫 단이라 번호를 쓰지 않습니다.
   * - 매직링에 코 수가 적혀 있으면 "링에 짧은뜨기 n코"의 줄임말로 보고 그 단을 만듭니다. 이 단이 1단입니다.
   */
  function startRows(section: Section, si: number, b: Block, copy: number, which: string): number {
    const start = section.start
    if (!crochet || start.count <= 0) return 0
    const ref = { section: si, group: -1, row: -1, rep: 0 }
    if (start.kind === 'chain') {
      const flat = section.shape === 'flat'
      // 평면에서는 사슬을 뜨고 돌려서 첫 단을 뜹니다. 그래서 사슬 단은 첫 단의 반대쪽 면입니다.
      const firstSide = section.groups[0]?.rows[0]?.side
      const side: Side = !flat ? 'round' : firstSide === 'WS' ? 'RS' : 'WS'
      const cols = side === 'WS' ? [...b.cols].reverse() : [...b.cols]
      g += 1
      b.rows.push({
        g,
        side,
        label: '시작 사슬' + which,
        instr: `사슬 ${start.count}코`,
        sectionId: section.id,
        section: section.name,
        count: start.count,
        cells: cols.map((col, k) => ({ col, sym: 'CH' as SymbolId, k })),
        segments: [{ text: `사슬 ${start.count}코`, tech: 'CH', cols }],
        markerCols: [],
        h: 0,
        start: 'chain',
        ...(copy > 0 ? { copy } : {}),
        ...pieceMark(),
        ref,
      })
      return 0
    }
    if (start.kind === 'ring') {
      g += 1
      const text = `매직링에 짧은뜨기 ${start.count}코`
      runRow(b, { side: 'round', ops: [{ st: 'sc', n: start.count, into: 'space' }], expect_count: start.count, text }, 'round', '1단(원형)' + which, section, ref, false, 'ring', copy)
      lastSide = 'round'
      return 1
    }
    return 0
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
    start?: ExpandedRow['start'],
    copy = 0,
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
    /** 이 단에서 가장 높은 코바늘 코의 높이. 대바늘 코에는 높이가 없어 -1로 남습니다. */
    let rowH = -1
    /** 바로 앞 조각이 사슬 공간에 떴는지. 같은 공간에 이어 뜨는 것을 알아보는 데 씁니다. */
    let inSpace = false

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

    /** 아랫단의 기둥 need개를 쓰고 칸 make개를 만듭니다. */
    const work = (def: StitchDef, { need, make }: Work, sink: Col[], markAdded = true): boolean => {
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
      const kind: ColKind = def.chain ? 'ch' : 'st'
      if (make === 0) {
        for (const c of used) {
          c.alive = false
          c.diedAt = g
        }
        // 코막음과 빼뜨기도 기호 도안에는 한 칸으로 남깁니다.
        if (def.symbol && def.symbol !== 'as_set' && used[0]) {
          produced.push({ col: used[0], sym: def.symbol, k: produced.length })
          sink.push(used[0])
        }
        return true
      }
      if (need === 0) {
        // 코바늘에서 아랫단을 쓰지 않고 생긴 코는, 사슬이 아니면 이미 뜬 자리에 더 떠 넣은 코입니다.
        const added = crochet && markAdded && !def.chain ? ({ added: true } as const) : {}
        for (let j = 0; j < make; j++) {
          const c = new Col('K', g, kind)
          insertNew(c)
          produced.push({ col: c, sym: (def.symbol === 'as_set' || !def.symbol ? plain : def.symbol) as SymbolId, k: produced.length, ...added })
          sink.push(c)
        }
        return true
      }
      const keep = used[Math.min(def.keep ?? 0, used.length - 1)]
      for (const c of used) {
        if (c !== keep) {
          c.alive = false
          c.diedAt = g
        }
      }
      keep.kind = kind
      let sym: SymbolId
      if (def.symbol === 'as_set') {
        sym = keep.base
      } else if (def.symbol === 'K' || def.symbol === 'P') {
        sym = rs ? def.symbol : FLIP[def.symbol]
        keep.base = sym
      } else {
        sym = (def.symbol ?? plain) as SymbolId
        if (def.face) keep.base = rs ? def.face : FLIP[def.face]
      }
      produced.push({ col: keep, sym, k: produced.length })
      sink.push(keep)
      // 한 코에서 여러 코를 만드는 경우 (늘림, 한 코에 여러 번 뜨기)
      for (let j = 1; j < make; j++) {
        const c = new Col(keep.base, g, kind)
        insertNew(c)
        produced.push({ col: c, sym, k: produced.length, ...(crochet && markAdded ? ({ added: true } as const) : {}) })
        sink.push(c)
      }
      return true
    }

    /** 이 자리의 사슬 공간이 차지하는 기둥 수. 매직링은 한 자리, 사슬은 이어진 만큼. 공간이 아니면 0 */
    const spaceAt = (): number => {
      if (order[pos]?.kind === 'ring') return 1
      let n = 0
      while (order[pos + n]?.kind === 'ch') n++
      return n
    }

    const doStitch = (id: string, n: number, intoRaw: Into | undefined, sink: Col[]): boolean => {
      const def = getStitch(id)
      if (!def) {
        issue('error', 'unknown_stitch', `코 사전에 없는 코입니다: "${id}"`)
        return false
      }
      if (def.height !== undefined) rowH = Math.max(rowH, def.height)
      let into: Into = intoRaw ?? 'next'
      // 매직링 위에서는 따로 적지 않아도 링 안에 뜨는 것으로 봅니다.
      if (into === 'next' && def.consumes > 0 && def.produces > 0 && order[pos]?.kind === 'ring') into = 'space'
      if (into === 'next') {
        // 사슬처럼 아랫단을 쓰지 않는 코는 자리를 옮기지 않습니다.
        if (def.consumes > 0) inSpace = false
        for (let i = 0; i < n; i++) if (!work(def, { need: def.consumes, make: def.produces }, sink)) return false
        return true
      }
      // 여기부터는 n코가 모두 한 자리에 들어갑니다.
      const make = n * Math.max(1, def.produces)
      if (into === 'space') {
        const size = spaceAt()
        if (size === 0) {
          // 같은 공간에 이어 뜨는 것을 다시 "공간에"라고 적은 경우입니다.
          if (inSpace) return work(def, { need: 0, make }, sink, false)
          issue('warn', 'no_space', `${label}: 사슬 공간에 뜨라고 적혀 있지만 이 자리에는 사슬이 없습니다. (${def.name.kr})`)
          return work(def, { need: 1, make }, sink)
        }
        inSpace = true
        // 링이나 사슬 공간은 코가 아니라서, 그 안에 뜬 코는 늘림으로 표시하지 않습니다.
        return work(def, { need: size, make }, sink, false)
      }
      // 공간에 이어 뜨는 중이면 "같은 자리"도 그 공간입니다.
      if (into === 'same') return work(def, { need: 0, make }, sink, !inSpace)
      inSpace = false
      return work(def, { need: Math.max(1, def.consumes), make }, sink)
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
          if (!doStitch(op.st, op.n, op.into, sink)) return false
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
    // 매직링만 남았으면 남은 코가 아닙니다 (링은 코가 아닙니다).
    const left = order.slice(pos).filter((c) => c.kind !== 'ring').length
    if (pos < total) {
      if (ok && left > 0) issue('error', 'leftover', `${label}: 단이 끝났는데 ${left}코가 남습니다.`, { actual: left })
      // 남은 코는 무늬대로 뜬 것으로 두어 뒤 단을 계속 따라갑니다.
      const sink: Col[] = []
      for (const c of order.slice(pos)) {
        if (c.kind === 'ring') continue
        produced.push({ col: c, sym: crochet ? plain : c.base, k: produced.length })
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

    const count = stitches(b).length
    // 도안에 따라 사슬을 코 수에 넣기도 하고 빼기도 합니다. 어느 쪽으로든 맞으면 맞는 것으로 봅니다.
    const withoutChains = b.cols.filter((c) => c.alive && c.kind === 'st').length
    markers = [...pend.filter((p) => !removed.has(p.m)), ...placed].map((p) => {
      p.m.gapRS = rs ? p.workedBefore : count - p.workedBefore
      return p.m
    })
    markers.sort((a, z) => a.gapRS - z.gapRS)

    if (row.expect_count !== undefined && row.expect_count !== count && row.expect_count !== withoutChains) {
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
      ...(rowH >= 0 ? { h: rowH } : {}),
      ...(start ? { start } : {}),
      ...(copy > 0 ? { copy } : {}),
      ...pieceMark(),
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
        return { ...rest, cells: cells.map((c) => ({ x: x(c.col), k: c.k, s: c.sym, ...(c.added ? ({ a: 1 } as const) : {}) })), segments, markers: markerCols.map(x) }
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
    const def = getStitch(id)
    if (def?.craft === 'crochet') return describeCrochet(def, op.n, op.into)
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

const WHERE: Record<Into, string> = { next: '', one: '다음 코에 ', same: '같은 코에 ', space: '사슬 공간에 ' }

function describeCrochet(def: StitchDef, n: number, into: Into = 'next'): string {
  if (def.id === 'skip') return `${n}코 건너뛰기`
  if (def.id === 'tch') return '기둥코 세우기 (1코로 셈)'
  if (def.id === 'tch0') return '기둥코 세우기'
  if (def.id === 'join') return '첫 코에 빼뜨기로 잇기'
  if (def.id === 'ch') return `사슬 ${n}코`
  // 이름 뒤의 풀이("(한 코에 2번)")는 안내 글에서 뺍니다.
  const name = def.name.kr.replace(/\s*\(.*\)$/, '')
  if (def.id === 'inc' || def.id.endsWith('tog')) return n > 1 ? `${name} ${n}번` : name
  return `${WHERE[into]}${name} ${n}코`
}

function simpleName(id: string): string {
  const s = id.toLowerCase()
  if (s === 'k') return '겉뜨기'
  if (s === 'p') return '안뜨기'
  if (s === 'pat') return '무늬에 맞춰 뜨기'
  // 코바늘 이름 뒤의 풀이("(한 코에 2번)")는 안내 글에서 뺍니다.
  return getStitch(s)?.craft === 'crochet' ? stitchKr(s).replace(/\s*\(.*\)$/, '') : stitchKr(s)
}

/** 조각을 대표하는 뜨는 법. 단계별 안내가 기호별 뜨는 법을 고르는 데 씁니다. */
export function techOf(op: Op): string {
  const ids: string[] = []
  /** 한 자리에 여러 코를 뜨는 조각이 있는지 (코바늘의 늘림) */
  let adds = false
  const walk = (o: Op) => {
    if ('st' in o) {
      ids.push(o.st.toLowerCase())
      if ((o.into === 'one' && o.n > 1) || o.into === 'same') adds = true
    } else if ('repeat' in o) o.repeat.forEach(walk)
  }
  walk(op)
  const uniq = [...new Set(ids)]
  if (uniq.length === 0) return 'K'
  // 코바늘: 늘림이 섞인 조각은 늘림을, 그 밖에는 처음 나오는 코를 보여 줍니다. 기둥코와 건너뛰기는 대표가 되지 않습니다.
  const crochetIds = uniq.filter((i) => getStitch(i)?.craft === 'crochet')
  if (crochetIds.length > 0) {
    if (crochetIds.includes('inc') || adds) return 'INC'
    const main = crochetIds.find((i) => getStitch(i)?.symbol && i !== 'tch') ?? crochetIds[0]
    return (getStitch(main)?.symbol as string | null) ?? main.toUpperCase()
  }
  const special = uniq.filter((i) => i !== 'k' && i !== 'p' && i !== 'pat')
  if (uniq.includes('yo') && special.length > 1) return 'BH'
  if (special.length) return (getStitch(special[0])?.symbol as string) ?? special[0].toUpperCase()
  if (uniq.includes('pat')) return 'PAT'
  if (uniq.length > 1) return 'RIB'
  return uniq[0].toUpperCase()
}
