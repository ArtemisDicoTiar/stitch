/**
 * 확인 화면이 쓰는 모양: IR의 단(반복 묶음 안의 한 줄)마다 엔진이 펼친 결과와 검산 문제를 붙입니다.
 * IR의 한 단은 반복 횟수만큼 여러 단으로 펼쳐지므로, 첫 번째와 마지막 펼친 단을 함께 둡니다.
 */
import { expand, type Verification } from '@stitch/engine'
import type { Craft, ExpandedRow, Into, Issue, Pattern, Row, RowGroup, Section, SectionSummary, Side, Template, Terms } from '@stitch/pattern-ir'

export type RowAddr = { s: number; g: number; r: number }
export const sameRow = (a: RowAddr | null, b: RowAddr | null) => !!a && !!b && a.s === b.s && a.g === b.g && a.r === b.r
export const rowDomId = (a: RowAddr) => `row-${a.s}-${a.g}-${a.r}`
export const groupDomId = (s: number, g: number) => `grp-${s}-${g}`
export const sectionDomId = (s: number) => `sec-${s}`

export type RowInfo = {
  addr: RowAddr
  row: Row
  /** 이 단이 펼쳐진 단들 가운데 처음과 마지막. 묶음이 0단이면 null */
  first: ExpandedRow | null
  last: ExpandedRow | null
  /** 펼쳐진 횟수 */
  times: number
  /** 뜬 면이 반복마다 바뀌는지 */
  alternates: boolean
  issues: Issue[]
  level: 'error' | 'warn' | null
}

export type GroupInfo = {
  s: number
  g: number
  group: RowGroup
  rows: RowInfo[]
  firstG: number | null
  lastG: number | null
  /** 이 묶음이 펼쳐진 단 수 */
  total: number
  /** 길이로 적힌 묶음(until_cm)인지 */
  length: { cm: number; rows: number | undefined; estimate: number | null } | null
  issues: Issue[]
}

export type SectionInfo = { s: number; section: Section; summary: SectionSummary | undefined; groups: GroupInfo[]; issues: Issue[] }

export type Model = {
  sections: SectionInfo[]
  totalRows: number
  /** 도안에 코 수가 적혀 있고 계산과 맞은 단의 수 */
  matched: number
}

const key = (s: number, g: number, r: number) => `${s}.${g}.${r}`

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>()
  return issues.filter((i) => {
    const k = `${i.level}:${i.code}:${i.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** 사람이 단수를 정하지 않았다면 게이지로 추정했을 단수. 게이지가 없으면 null */
function estimateFor(ir: Pattern, s: number, g: number): number | null {
  const clone = structuredClone(ir)
  const repeat = clone.sections[s].groups[g].repeat
  if (!('until_cm' in repeat)) return null
  delete repeat.rows
  const hit = expand(clone).issues.find((i) => i.code === 'estimated_rows' && i.ref?.section === s && i.ref.group === g)
  return hit?.actual ?? null
}

export function buildModel(ir: Pattern, v: Verification): Model {
  const byRow = new Map<string, ExpandedRow[]>()
  for (const b of v.expanded.blocks) {
    for (const row of b.rows) {
      const k = key(row.ref.section, row.ref.group, row.ref.row)
      const list = byRow.get(k)
      if (list) list.push(row)
      else byRow.set(k, [row])
    }
  }
  const flagged = v.expanded.issues.filter((i) => i.level !== 'info')
  let matched = 0

  const sections = ir.sections.map((section, s): SectionInfo => {
    const groups = section.groups.map((group, g): GroupInfo => {
      const rows = group.rows.map((row, r): RowInfo => {
        const all = byRow.get(key(s, g, r)) ?? []
        const issues = dedupe(flagged.filter((i) => i.ref?.section === s && i.ref.group === g && i.ref.row === r))
        const level = issues.some((i) => i.level === 'error') ? 'error' : issues.length ? 'warn' : null
        if (row.expect_count !== undefined && all.length > 0 && !issues.some((i) => i.code === 'count_mismatch')) matched += 1
        return { addr: { s, g, r }, row, first: all[0] ?? null, last: all[all.length - 1] ?? null, times: all.length, alternates: new Set(all.map((x) => x.side)).size > 1, issues, level }
      })
      const gs = rows.flatMap((x) => (x.first && x.last ? [x.first.g, x.last.g] : []))
      const repeat = group.repeat
      let length: GroupInfo['length'] = null
      if ('until_cm' in repeat) {
        const note = v.expanded.issues.find((i) => i.code === 'estimated_rows' && i.ref?.section === s && i.ref.group === g)
        length = { cm: repeat.until_cm, rows: repeat.rows, estimate: repeat.rows === undefined ? (note?.actual ?? null) : estimateFor(ir, s, g) }
      }
      return {
        s,
        g,
        group,
        rows,
        firstG: gs.length ? Math.min(...gs) : null,
        lastG: gs.length ? Math.max(...gs) : null,
        total: rows.reduce((n, x) => n + x.times, 0),
        length,
        issues: dedupe(flagged.filter((i) => i.ref?.section === s && i.ref.group === g && i.ref.row === undefined)),
      }
    })
    return { s, section, summary: v.expanded.sections[s], groups, issues: dedupe(flagged.filter((i) => i.ref?.section === s && i.ref.group === undefined)) }
  })
  return { sections, totalRows: v.expanded.totalRows, matched }
}

// --- 화면에 쓰는 말 ------------------------------------------------------------

export const SIDE_KR: Record<Side, string> = { RS: '겉면', WS: '안면', round: '원통' }
/** 코바늘에서는 둘러 뜨는 단을 원형이라고 부릅니다. */
export const sideKr = (craft: Craft): Record<Side, string> => (craft === 'crochet' ? { ...SIDE_KR, round: '원형' } : SIDE_KR)
/** 코바늘에서 코를 넣는 자리 */
export const INTO_KR: { id: Into; name: string }[] = [
  { id: 'next', name: '다음 코에 하나씩' },
  { id: 'one', name: '다음 한 코에 모두' },
  { id: 'same', name: '방금 뜬 자리에 더' },
  { id: 'space', name: '사슬 공간이나 링 안에' },
]
/** 구간을 시작하는 방법 */
export const START_KR: Record<Section['start']['kind'], string> = { cast_on: '코잡기', chain: '시작 사슬', ring: '매직링', continue: '앞 구간에서 이어서' }
export const CRAFT_KR = { knit: '대바늘', crochet: '코바늘' } as const
export const TERMS_KR: Record<Terms, string> = { kr: '한국식 약어', us: '미국식 약어', uk: '영국식 약어', jp: '일본식 약어' }
export const TEMPLATES: { id: Template; name: string }[] = [
  { id: 'hood', name: '후드' },
  { id: 'flat', name: '평면 (직사각형)' },
  { id: 'tube', name: '원통' },
  { id: 'hat', name: '모자' },
  { id: 'none', name: '3D 없이 보기' },
]

/** 이 단이 몇 단째인지: "9단", "10단부터 18단", "1단부터 2단마다 4번" */
export function rowNumbers(info: RowInfo, perRep: number): string {
  if (!info.first || !info.last) return '단 없음'
  if (info.times === 1) return `${info.first.g}단`
  if (perRep === 1) return `${info.first.g}단부터 ${info.last.g}단`
  return `${info.first.g}단부터 ${perRep}단마다 ${info.times}번`
}

export function sideText(info: RowInfo, craft: Craft = 'knit'): string {
  const side = info.first?.side ?? info.row.side
  const kr = sideKr(craft)
  return info.alternates ? `${kr[side]}부터 번갈아` : kr[side]
}

export function countText(info: RowInfo): string {
  if (!info.first || !info.last) return ''
  return info.first.count === info.last.count ? `${info.first.count}코` : `${info.first.count}코 → ${info.last.count}코`
}
