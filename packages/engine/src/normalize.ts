/**
 * 읽은 도안을 엔진이 기대하는 꼴로 맞춥니다.
 * LLM이 같은 내용을 두 군데에 적어 생기는 어긋남은 되먹임으로 고칠 수 없어서(되먹임은 단 묶음만 바꿉니다)
 * 여기서 코드로 바로잡습니다.
 */
import type { Op, Pattern, Row, Section } from '@stitch/pattern-ir'
import { expand } from './expand'

/** 단의 맨 앞 코 조각 (반복 안쪽까지 들어가서) */
function firstStitch(ops: Op[]): Extract<Op, { st: string }> | null {
  for (const op of ops) {
    if ('st' in op) return op
    if ('repeat' in op) {
      const inner = firstStitch(op.repeat)
      if (inner) return inner
    }
  }
  return null
}

/** 지시문이 "2단", "R3", "Rnd 2"처럼 첫 단이 아닌 번호로 시작하는지 */
function startsAfterFirst(row: Row): boolean {
  const head = `${row.label ?? ''} ${row.text}`.trim()
  const m = /^(?:r(?:nd|ound|ow)?s?\.?\s*)?(\d+)\s*(?:단|:|\.|\)|-|~)/i.exec(head)
  return m !== null && Number(m[1]) > 1
}

/**
 * 매직링으로 시작하는 구간에서, 시작 코 수와 "링에 뜨는 첫 단"이 둘 다 적혀 있으면 첫 단만 남깁니다.
 *
 * 엔진은 `ring`에 코 수가 있으면 "링에 짧은뜨기 n코"를 1단으로 만들어 넣습니다. 그런데 도안에는 그 1단이
 * 글로도 적혀 있어서, 읽은 결과에 시작 코 수 6과 "매직링에 짧은뜨기 6코" 단이 함께 들어오곤 합니다.
 * 그대로 두면 같은 단을 두 번 뜬 것이 됩니다.
 */
export function normalizeStarts(pattern: Pattern): Pattern {
  if (pattern.craft !== 'crochet') return pattern
  let changed = false
  const sections = pattern.sections.map((section): Section => {
    const first = section.groups[0]?.rows[0]
    if (section.start.kind !== 'ring' || section.start.count <= 0 || !first) return section
    if (!writesRingRound(pattern, section, first)) return section
    changed = true
    return { ...section, start: { ...section.start, count: 0 } }
  })
  return changed ? { ...pattern, sections } : pattern
}

function writesRingRound(pattern: Pattern, section: Section, first: Row): boolean {
  // 링 안에 뜬다고 적힌 단은 그 자체가 첫 단입니다.
  if (firstStitch(first.ops)?.into === 'space') return true
  if (startsAfterFirst(first)) return false
  // 그 밖에는 링 위에 이 단만 떠 봅니다. 오류 없이 시작 코 수와 같은 코 수가 나오면 이 단이 첫 단입니다.
  const probe: Pattern = {
    ...pattern,
    sections: [{ ...section, start: { ...section.start, count: 0 }, copies: 1, groups: [{ rows: [first], repeat: { times: 1 } }] }],
  }
  const e = expand(probe)
  const row = e.blocks[0]?.rows[0]
  return !!row && row.count === section.start.count && !e.issues.some((i) => i.level === 'error')
}
