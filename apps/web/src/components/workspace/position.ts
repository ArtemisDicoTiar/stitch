/**
 * 진행 위치를 다루는 작은 함수들.
 * 위치는 어디서나 { row, stitch } = 전체에서의 단 번호와 그 단에서 뜬 코 수입니다.
 */
import { allRows, progressFraction, rowAt, stitchesDone } from '@stitch/engine'
import type { Expanded, ExpandedRow, Progress, SectionSummary, Side } from '@stitch/pattern-ir'

export type Pos = Progress

/** 아직 기록이 없을 때의 자리: 첫 단, 0코 */
export const START: Pos = { row: 1, stitch: 0 }

export function cellsIn(expanded: Expanded, row: number): number {
  return rowAt(expanded, row)?.cells.length ?? 0
}

/** 마지막 단까지 다 떴는지 */
export function isComplete(expanded: Expanded, p: Pos): boolean {
  if (expanded.totalRows === 0) return false
  return p.row > expanded.totalRows || (p.row === expanded.totalRows && p.stitch >= cellsIn(expanded, p.row))
}

/** 도안 범위 안으로 맞춥니다. 단은 1 이상입니다. */
export function clampPos(expanded: Expanded, p: Pos): Pos {
  const total = Math.max(1, expanded.totalRows)
  const row = Math.min(Math.max(1, Math.round(Number.isFinite(p.row) ? p.row : 1)), total)
  const n = cellsIn(expanded, row)
  return { row, stitch: Math.min(Math.max(0, Math.round(Number.isFinite(p.stitch) ? p.stitch : 0)), n) }
}

/**
 * 지금 뜰 단을 기준으로 적은 위치.
 * 어떤 단을 다 떴으면 "다음 단 0코"로 읽습니다. 마지막 단을 다 뜬 경우만 그대로 둡니다.
 */
export function workingPos(expanded: Expanded, p: Pos): Pos {
  let c = clampPos(expanded, p)
  // 코가 없는 단은 건너갑니다.
  while (c.row < expanded.totalRows && c.stitch >= cellsIn(expanded, c.row)) c = { row: c.row + 1, stitch: 0 }
  return c
}

/** 단 올리기: 지금 뜨던 단을 끝내고 다음 단 0코로. 마지막 단이면 그 단을 다 뜬 자리입니다. */
export function rowUp(expanded: Expanded, p: Pos): Pos {
  const w = workingPos(expanded, p)
  if (w.row >= expanded.totalRows) return { row: w.row, stitch: cellsIn(expanded, w.row) }
  return { row: w.row + 1, stitch: 0 }
}

export function sameProgress(expanded: Expanded, a: Pos, b: Pos): boolean {
  return stitchesDone(expanded, a) === stitchesDone(expanded, b)
}

/** 뜬 코 수에서 위치로. 기록 재생에서 씁니다. */
export function posFromStitches(expanded: Expanded, done: number): Pos {
  let left = Math.max(0, Math.round(done))
  let last: Pos = START
  for (const r of allRows(expanded)) {
    if (left < r.cells.length) return { row: r.g, stitch: left }
    left -= r.cells.length
    last = { row: r.g, stitch: r.cells.length }
  }
  return last
}

export function percentOf(expanded: Expanded, p: Pos): number {
  const f = progressFraction(expanded, p)
  // 다 뜨기 전에는 100%로 올림하지 않습니다.
  return f >= 1 ? 100 : Math.floor(f * 100)
}

/** "13단 24코". 그 단을 다 채웠으면 "13단 완료" */
export function posText(expanded: Expanded, p: Pos): string {
  if (isComplete(expanded, p)) return '뜨기 완료'
  const n = cellsIn(expanded, p.row)
  if (n > 0 && p.stitch >= n) return `${p.row}단 완료`
  return `${p.row}단 ${p.stitch}코`
}

export function sideName(side: Side): string {
  return side === 'WS' ? '안면 단' : side === 'RS' ? '겉면 단' : '원통 단'
}

/** 그 단을 읽는 방향 */
export function sideFrom(side: Side): string {
  return side === 'WS' ? '왼쪽부터' : '오른쪽부터'
}

export type SectionAt = { section: SectionSummary; index: number; local: number }

/** g단이 들어 있는 구간과, 그 구간에서 몇 번째 단인지 */
export function sectionAt(expanded: Expanded, g: number): SectionAt | null {
  const index = expanded.sections.findIndex((s) => g >= s.firstRow && g <= s.lastRow)
  if (index < 0) return null
  const section = expanded.sections[index]
  return { section, index, local: g - section.firstRow + 1 }
}

export function sectionText(expanded: Expanded, g: number): string {
  const at = sectionAt(expanded, g)
  return at ? `${at.section.name} ${at.local}단째` : ''
}

/** 그 단에서 뜨는 순서로 k번째(0부터) 코가 들어 있는 조각. 다 뜬 단이면 -1 */
export function segmentAt(row: ExpandedRow, k: number): number {
  let start = 0
  for (let i = 0; i < row.segments.length; i++) {
    const n = row.segments[i].xs.length
    if (n > 0 && k < start + n) return i
    start += n
  }
  return -1
}

/** 조각 i가 시작하는 코의 순서 (0부터) */
export function segmentStart(row: ExpandedRow, i: number): number {
  let start = 0
  for (let j = 0; j < i && j < row.segments.length; j++) start += row.segments[j].xs.length
  return start
}

// ---- 날짜와 시간 ----

const DAYS = '일월화수목금토'
const two = (n: number) => String(n).padStart(2, '0')

export function fmtDay(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`
}

export function fmtTime(d: Date): string {
  return `${two(d.getHours())}:${two(d.getMinutes())}`
}

export function fmtFull(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${fmtTime(d)}`
}

/** datetime-local 입력에 넣는 값 */
export function localInput(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
}
