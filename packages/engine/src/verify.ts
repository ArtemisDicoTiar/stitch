import type { Expanded, GaugeSize, Issue, Pattern } from '@stitch/pattern-ir'
import { expand } from './expand'

export type Verification = {
  ok: boolean
  /** 사람이 봐야 하는 단이 있는지 (오류 또는 경고) */
  needsReview: boolean
  errors: Issue[]
  warnings: Issue[]
  notes: Issue[]
  expanded: Expanded
}

/** IR을 검산합니다. 오류가 하나도 없어야 통과입니다. */
export function verify(pattern: Pattern, options: { gauge?: GaugeSize | null } = {}): Verification {
  const expanded = expand(pattern, options)
  const errors = expanded.issues.filter((i) => i.level === 'error')
  const warnings = expanded.issues.filter((i) => i.level === 'warn')
  const notes = expanded.issues.filter((i) => i.level === 'info')
  return { ok: errors.length === 0, needsReview: errors.length + warnings.length > 0, errors, warnings, notes, expanded }
}

/** 단마다의 코 수를 순서대로 돌려줍니다. */
export function rowCounts(expanded: Expanded): number[] {
  return expanded.blocks.flatMap((b) => b.rows.map((r) => r.count))
}

/** 전체 단을 순서대로 */
export function allRows(expanded: Expanded) {
  return expanded.blocks.flatMap((b) => b.rows)
}
