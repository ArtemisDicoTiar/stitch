/**
 * 기호 도안의 자리 계산.
 * 그리기, 눌린 칸 찾기, 진행 표시가 모두 여기서 나온 좌표를 씁니다.
 *
 * 한 칸은 1코 × 1단이고 겉면에서 본 모양입니다. 단은 아래에서 위로 쌓이고,
 * 격자가 여럿이면 뒤에 뜨는 격자가 위에 놓입니다. 폭이 다른 격자는 가운데를 맞춥니다.
 */
import type { ChartCell, Expanded, ExpandedRow, Side, SymbolId } from '@stitch/pattern-ir'
import { textWidth } from './util'

export type Rect = { x: number; y: number; w: number; h: number }

export type ChartColors = {
  /** 도안 바탕 */
  paper: string
  /** 기호 선 */
  ink: string
  /** 코가 없는 칸 */
  noStitch: string
  gridMinor: string
  gridMajor: string
  /** 격자 테두리 */
  frame: string
  /** 도안의 마커 선 */
  marker: string
  rowNumber: string
  columnNumber: string
  /** 코 수가 바뀌는 단에 적는 숫자 */
  count: string
  /** 길이로 적혀 게이지로 추정한 단의 띠 */
  estimated: string
  estimatedText: string
  /** 구간 묶음표 색. 구간 순서대로 돌려 씁니다. */
  sections: string[]
  /** 구간 이름 아래의 작은 글씨 */
  sub: string
  /** 아직 안 뜬 칸을 덮는 색 */
  veil: string
  /** 지금 뜰 자리, 가리킨 칸 */
  accent: string
  /** 고른 칸 */
  selection: string
  /** 코바늘에서 한 자리에 더 떠 넣어 늘어난 코의 칸 바탕 */
  added: string
}

export const DEFAULT_COLORS: ChartColors = {
  paper: '#fffdf9',
  ink: '#262626',
  noStitch: '#d0d0d0',
  gridMinor: '#c9c9c9',
  gridMajor: '#9a9a9a',
  frame: '#333333',
  marker: '#e0362c',
  rowNumber: '#555555',
  columnNumber: '#777777',
  count: '#b5531b',
  estimated: '#fff3c2',
  estimatedText: '#8a6a12',
  sections: ['#2f6f4f', '#2f5f8f', '#9a3b3b', '#5b4bb7'],
  sub: '#666666',
  veil: '#fffdf9',
  accent: '#e8590c',
  selection: '#1f6fd1',
  added: '#d9f2cf',
}

/** 도안에 적히는 글. 모두 한국어가 기본입니다. */
export type ChartLabels = {
  /** 스크린 리더가 읽는 도안 이름 */
  title: string
  /** 코 수 */
  stitches: (n: number) => string
  /** 단 범위 */
  rows: (first: number, last: number) => string
  /** 게이지로 추정한 단 묶음 */
  estimated: (rows: number) => string
  /** 지금 뜰 자리 */
  now: string
  /** 이름 없는 단수링 */
  ring: string
}

export const DEFAULT_LABELS: ChartLabels = {
  title: '기호 도안',
  stitches: (n) => `${n}코`,
  rows: (first, last) => (first === last ? `${first}단` : `${first}–${last}단`),
  estimated: (rows) => `게이지로 추정 ${rows}단`,
  now: '지금 여기',
  ring: '단수링',
}

export const DEFAULT_FONT = "'Noto Sans KR','Noto Sans CJK KR','Apple SD Gothic Neo','Malgun Gothic',sans-serif"

export type ChartOptions = {
  /** 한 칸의 크기. 기본 12 */
  cell?: number
  /** 격자 사이 간격. 기본 16 */
  blockGap?: number
  /** 바깥 여백. 기본 12 */
  padding?: number
  /** 단 번호 (겉면 단은 오른쪽, 안면 단은 왼쪽) */
  rowNumbers?: boolean
  /** 격자 아래의 코 번호 (오른쪽부터 셉니다) */
  columnNumbers?: boolean
  /** 코 수가 바뀌는 단에 코 수 적기 */
  counts?: boolean
  /** 왼쪽의 구간 묶음표와 이름 */
  sections?: boolean
  /** 도안의 마커 선 */
  markers?: boolean
  /** 게이지로 추정한 단 표시 */
  estimated?: boolean
  /** 바탕색 칠하기. 끄면 투명합니다. */
  background?: boolean
  colors?: Partial<ChartColors>
  /** 기호별 칸 바탕색 바꾸기 */
  symbolBg?: Partial<Record<SymbolId, string>>
  labels?: Partial<ChartLabels>
  fontFamily?: string
  /** defs 안의 id 앞에 붙는 말. 한 페이지에 도안을 여러 개 넣을 때 겹치지 않게 합니다. */
  idPrefix?: string
}

export type ResolvedChartOptions = {
  cell: number
  blockGap: number
  padding: number
  rowNumbers: boolean
  columnNumbers: boolean
  counts: boolean
  sections: boolean
  markers: boolean
  estimated: boolean
  background: boolean
  colors: ChartColors
  symbolBg: Partial<Record<SymbolId, string>>
  labels: ChartLabels
  fontFamily: string
  idPrefix: string
}

export function resolveChartOptions(opts: ChartOptions = {}): ResolvedChartOptions {
  const cell = opts.cell && opts.cell > 0 ? opts.cell : 12
  return {
    cell,
    blockGap: opts.blockGap ?? 16,
    padding: opts.padding ?? 12,
    rowNumbers: opts.rowNumbers ?? true,
    columnNumbers: opts.columnNumbers ?? true,
    counts: opts.counts ?? true,
    sections: opts.sections ?? true,
    markers: opts.markers ?? true,
    estimated: opts.estimated ?? true,
    background: opts.background ?? true,
    colors: { ...DEFAULT_COLORS, ...opts.colors },
    symbolBg: opts.symbolBg ?? {},
    labels: { ...DEFAULT_LABELS, ...opts.labels },
    fontFamily: opts.fontFamily ?? DEFAULT_FONT,
    idPrefix: opts.idPrefix ?? 'sc-',
  }
}

export type BlockLayout = Rect & {
  /** expanded.blocks 에서의 순서 */
  index: number
  name: string
  /** 격자 폭 (코) */
  W: number
  /** 단 수 */
  rows: number
  firstRow: number
  lastRow: number
  /** 가운데를 맞추느라 오른쪽으로 민 칸 수 (반 칸일 수 있습니다) */
  shift: number
}

export type RowLabel = { g: number; x: number; y: number; anchor: 'start' | 'end'; text: string }

/** 한 격자 안에서 같은 구간이 차지하는 세로 범위 */
export type SectionSpan = {
  id: string
  name: string
  block: number
  /** expanded.sections 에서의 순서. 없으면 -1 */
  index: number
  firstRow: number
  lastRow: number
  /** 위쪽 끝과 아래쪽 끝의 y */
  y1: number
  y2: number
}

/** 게이지로 추정한 단이 이어진 범위 */
export type EstimatedSpan = { block: number; firstRow: number; lastRow: number; rows: number; y1: number; y2: number }

export type ChartSlot = { g: number; x: number; block: number }
export type ChartHit = { g: number; x: number; k: number }

/** 글자 크기와 여백 자리. 칸 크기에 맞춰 함께 커집니다. */
export type ChartMetrics = {
  /** cell / 12 */
  scale: number
  /** 구간 묶음표의 세로선 x */
  bracketX: number
  /** 격자 끝에서 단 번호까지 */
  numberGap: number
  /** 격자 오른쪽 끝에서 코 수 글씨까지 */
  countGap: number
  /** 격자 아래에서 코 번호 글씨까지 */
  columnGap: number
}

export type ChartLayout = {
  expanded: Expanded
  options: ResolvedChartOptions
  cell: number
  width: number
  height: number
  /** 모든 격자를 감싸는 사각형 */
  grid: Rect
  /** expanded.blocks 와 같은 순서 */
  blocks: BlockLayout[]
  rowLabels: RowLabel[]
  sections: SectionSpan[]
  estimated: EstimatedSpan[]
  metrics: ChartMetrics
  /** g번째 단. 없으면 null */
  row(g: number): ExpandedRow | null
  /** g번째 단이 격자에서 차지하는 띠 */
  rowRect(g: number): Rect | null
  /** g단의 x번째 기둥 칸. 코가 없는 칸도 자리는 있습니다. 격자 밖이면 null */
  rectOf(g: number, x: number): Rect | null
  /** 좌표가 어느 칸 자리인지. 코가 없는 칸도 돌려줍니다. */
  slotAt(px: number, py: number): ChartSlot | null
  /** 좌표에 있는 코. 코가 없는 칸이나 격자 밖이면 null */
  cellAt(px: number, py: number): ChartHit | null
  /** g단의 x번째 기둥에 있는 코 */
  cellOf(g: number, x: number): ChartCell | null
  /** g단에서 k번째(0부터)로 뜨는 코 */
  cellByOrder(g: number, k: number): ChartCell | null
  rowLabel(g: number): RowLabel | null
}

/** 겉면 단과 원형뜨기 단은 오른쪽에서 시작합니다. */
export function startsRight(side: Side): boolean {
  return side !== 'WS'
}

type RowEntry = { block: number; index: number; row: ExpandedRow; byX: Int32Array }

export function chartLayout(expanded: Expanded, opts: ChartOptions = {}): ChartLayout {
  const o = resolveChartOptions(opts)
  const cs = o.cell
  const s = cs / 12
  const L = o.labels

  const src = expanded.blocks
  const maxW = Math.max(1, ...src.map((b) => b.W))

  // --- 여백: 들어갈 글의 폭에 맞춥니다 ---
  const numberGap = 5 * s
  const numberW = o.rowNumbers ? numberGap + textWidth(String(Math.max(1, expanded.totalRows)), 8.5 * s) + 3 * s : 0

  // 구간과 추정 단이 이어진 범위. 단 순서로만 먼저 구하고 좌표는 뒤에서 붙입니다.
  type Span = { block: number; i: number; j: number }
  const sectionRuns: Span[] = []
  const estimatedRuns: Span[] = []
  let maxCount = 0
  src.forEach((b, bi) => {
    let i = 0
    while (i < b.rows.length) {
      let j = i
      while (j + 1 < b.rows.length && b.rows[j + 1].sectionId === b.rows[i].sectionId) j++
      sectionRuns.push({ block: bi, i, j })
      i = j + 1
    }
    i = 0
    while (i < b.rows.length) {
      if (!b.rows[i].estimated) {
        i++
        continue
      }
      let j = i
      while (j + 1 < b.rows.length && b.rows[j + 1].estimated) j++
      estimatedRuns.push({ block: bi, i, j })
      i = j + 1
    }
    for (const r of b.rows) maxCount = Math.max(maxCount, r.count)
  })

  let labelW = 0
  if (o.sections) {
    for (const sp of sectionRuns) {
      const rs = src[sp.block].rows
      labelW = Math.max(labelW, textWidth(rs[sp.i].section, 12 * s, true), textWidth(L.rows(rs[sp.i].g, rs[sp.j].g), 10 * s))
    }
  }
  const bracketGap = Math.max(numberW, 6 * s) + 12 * s
  // 격자선이 또렷하게 나오도록 격자가 정수 좌표에서 시작하게 올림합니다.
  const left = Math.ceil(o.padding + (o.sections ? labelW + 7 * s + bracketGap : numberW))

  const countGap = Math.max(numberW, 4 * s) + 6 * s
  let sideW = 0
  if (o.counts) sideW = Math.max(sideW, textWidth(L.stitches(maxCount), 10.5 * s, true))
  if (o.estimated) for (const sp of estimatedRuns) sideW = Math.max(sideW, textWidth(L.estimated(sp.j - sp.i + 1), 9.5 * s))
  const right = Math.ceil(o.padding + (sideW > 0 ? countGap + sideW : numberW))

  // 맨 윗단 위에 "지금 여기" 글씨가 올라갈 자리를 둡니다.
  const top = Math.ceil(o.padding + 16 * s)
  const columnGap = 11 * s
  const below = o.columnNumbers ? Math.ceil(14 * s) : 0

  // --- 격자: 뒤에 뜨는 격자가 위 ---
  const gridX = left
  const blocks: BlockLayout[] = []
  let y = top
  let placed = 0
  for (let bi = src.length - 1; bi >= 0; bi--) {
    const b = src[bi]
    const n = b.rows.length
    if (n > 0 && placed > 0) y += Math.ceil(o.blockGap * s)
    const shift = (maxW - b.W) / 2
    blocks[bi] = {
      index: bi,
      name: b.name,
      W: b.W,
      rows: n,
      firstRow: n ? b.rows[0].g : 0,
      lastRow: n ? b.rows[n - 1].g : 0,
      shift,
      x: gridX + shift * cs,
      y,
      w: b.W * cs,
      h: n * cs,
    }
    if (n > 0) {
      y += n * cs + below
      placed++
    }
  }
  const width = Math.ceil(left + maxW * cs + right)
  const height = Math.ceil(y + o.padding)
  const grid: Rect = { x: gridX, y: top, w: maxW * cs, h: Math.max(0, y - below - top) }

  // --- 단 찾기 ---
  const rows = new Map<number, RowEntry>()
  src.forEach((b, bi) => {
    b.rows.forEach((row, index) => {
      const byX = new Int32Array(b.W).fill(-1)
      row.cells.forEach((c, i) => {
        if (c.x >= 0 && c.x < b.W) byX[c.x] = i
      })
      rows.set(row.g, { block: bi, index, row, byX })
    })
  })

  const rowY = (e: RowEntry) => blocks[e.block].y + (blocks[e.block].rows - 1 - e.index) * cs

  const rowRect = (g: number): Rect | null => {
    const e = rows.get(g)
    if (!e) return null
    const b = blocks[e.block]
    return { x: b.x, y: rowY(e), w: b.w, h: cs }
  }

  const rectOf = (g: number, x: number): Rect | null => {
    const e = rows.get(g)
    if (!e || !Number.isInteger(x)) return null
    const b = blocks[e.block]
    if (x < 0 || x >= b.W) return null
    return { x: b.x + x * cs, y: rowY(e), w: cs, h: cs }
  }

  const slotAt = (px: number, py: number): ChartSlot | null => {
    for (const b of blocks) {
      if (!b || b.rows === 0 || py < b.y || py >= b.y + b.h) continue
      const x = Math.floor((px - b.x) / cs)
      if (x < 0 || x >= b.W) return null
      const index = b.rows - 1 - Math.floor((py - b.y) / cs)
      const row = src[b.index].rows[index]
      return row ? { g: row.g, x, block: b.index } : null
    }
    return null
  }

  const cellOf = (g: number, x: number): ChartCell | null => {
    const e = rows.get(g)
    if (!e || !Number.isInteger(x) || x < 0 || x >= e.byX.length) return null
    const i = e.byX[x]
    return i < 0 ? null : e.row.cells[i]
  }

  const cellAt = (px: number, py: number): ChartHit | null => {
    const slot = slotAt(px, py)
    if (!slot) return null
    const c = cellOf(slot.g, slot.x)
    return c ? { g: slot.g, x: c.x, k: c.k } : null
  }

  const cellByOrder = (g: number, k: number): ChartCell | null => {
    const e = rows.get(g)
    if (!e) return null
    const direct = e.row.cells[k]
    if (direct && direct.k === k) return direct
    return e.row.cells.find((c) => c.k === k) ?? null
  }

  // --- 단 번호 ---
  const rowLabels: RowLabel[] = []
  const labelOf = new Map<number, RowLabel>()
  src.forEach((b, bi) => {
    const bl = blocks[bi]
    for (const row of b.rows) {
      const e = rows.get(row.g)
      if (!e || e.row !== row) continue
      const yy = rowY(e) + cs * 0.78
      const label: RowLabel = startsRight(row.side)
        ? { g: row.g, x: bl.x + bl.w + numberGap, y: yy, anchor: 'start', text: String(row.g) }
        : { g: row.g, x: bl.x - numberGap, y: yy, anchor: 'end', text: String(row.g) }
      rowLabels.push(label)
      labelOf.set(row.g, label)
    }
  })

  // --- 구간과 추정 단의 세로 범위 ---
  const yOf = (block: number, index: number) => blocks[block].y + (blocks[block].rows - 1 - index) * cs
  const sections: SectionSpan[] = sectionRuns.map((sp) => {
    const rs = src[sp.block].rows
    return {
      id: rs[sp.i].sectionId,
      name: rs[sp.i].section,
      block: sp.block,
      index: expanded.sections.findIndex((sec) => sec.id === rs[sp.i].sectionId),
      firstRow: rs[sp.i].g,
      lastRow: rs[sp.j].g,
      y1: yOf(sp.block, sp.j),
      y2: yOf(sp.block, sp.i) + cs,
    }
  })
  const estimated: EstimatedSpan[] = estimatedRuns.map((sp) => {
    const rs = src[sp.block].rows
    return { block: sp.block, firstRow: rs[sp.i].g, lastRow: rs[sp.j].g, rows: sp.j - sp.i + 1, y1: yOf(sp.block, sp.j), y2: yOf(sp.block, sp.i) + cs }
  })

  return {
    expanded,
    options: o,
    cell: cs,
    width,
    height,
    grid,
    blocks,
    rowLabels,
    sections,
    estimated,
    metrics: { scale: s, bracketX: gridX - bracketGap, numberGap, countGap, columnGap },
    row: (g) => rows.get(g)?.row ?? null,
    rowRect,
    rectOf,
    slotAt,
    cellAt,
    cellOf,
    cellByOrder,
    rowLabel: (g) => labelOf.get(g) ?? null,
  }
}
