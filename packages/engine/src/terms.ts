/**
 * 영어 코바늘 도안의 약어 체계.
 * 미국식(US)과 영국식(UK)은 같은 약어를 다른 코에 씁니다 (UK dc = US sc).
 * 둘 다 "1코 쓰고 1코 만듦"이라 코 수 검산으로는 잘못 읽은 것을 잡지 못하므로,
 * 도안에 적힌 글과 견줘 의심스러운 곳을 사람이 보도록 남깁니다.
 */
import type { Op, Pattern, PatternNote, Terms } from '@stitch/pattern-ir'

/** 영국식 약어 → 코 사전의 id (미국식 뜻) */
export const UK_TO_US: Readonly<Record<string, string>> = {
  dc: 'sc',
  htr: 'hdc',
  tr: 'dc',
  dtr: 'tr',
  ss: 'slst',
  miss: 'skip',
  dc2tog: 'sc2tog',
  dc3tog: 'sc3tog',
  htr2tog: 'hdc2tog',
  tr2tog: 'dc2tog',
  tr3tog: 'dc3tog',
}
const US_TO_UK: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(UK_TO_US).map(([uk, us]) => [us, uk]))

const TERMS_KR: Record<Terms, string> = { kr: '한국식', us: '미국식', uk: '영국식', jp: '일본식' }

/** 한쪽 체계에만 있는 약어 */
const ONLY_US = /\b(sc|hdc|sk|skip)\b/i
const ONLY_UK = /\b(htr|miss)\b/i

const texts = (p: Pattern): string[] => p.sections.flatMap((s) => s.groups.flatMap((g) => g.rows.map((r) => r.text)))

/** 도안의 글에 쓰인 약어로 체계를 가늠합니다. 가릴 수 없으면 null (dc, tr만 쓰인 도안). */
export function guessTerms(rowTexts: string[]): { terms: 'us' | 'uk'; evidence: string } | null {
  let us: string | null = null
  let uk: string | null = null
  for (const t of rowTexts) {
    us ??= ONLY_US.exec(t)?.[1] ?? null
    uk ??= ONLY_UK.exec(t)?.[1] ?? null
  }
  if (us && !uk) return { terms: 'us', evidence: us }
  if (uk && !us) return { terms: 'uk', evidence: uk }
  return null
}

function ids(ops: Op[], out = new Set<string>()): Set<string> {
  for (const op of ops) {
    if ('st' in op) out.add(op.st.toLowerCase())
    else if ('repeat' in op) ids(op.repeat, out)
  }
  return out
}

/**
 * 약어 체계에서 사람이 확인해야 할 것을 찾습니다. 한국어·일본어 도안과 대바늘 도안에는 해당하지 않습니다.
 * - 읽은 체계와 도안에 보이는 약어가 서로 다를 때
 * - 약어만으로는 체계를 가릴 수 없을 때
 * - 영국식으로 읽었는데 약어가 바뀌지 않은 단이 있을 때 (글에는 dc뿐인데 한길긴뜨기로 옮겨진 단)
 */
export function checkTerms(pattern: Pattern): PatternNote[] {
  if (pattern.craft !== 'crochet' || (pattern.terms !== 'us' && pattern.terms !== 'uk')) return []
  const notes: PatternNote[] = []
  const guess = guessTerms(texts(pattern))
  const read = TERMS_KR[pattern.terms]
  if (guess && guess.terms !== pattern.terms) {
    notes.push({ kind: 'unclear', text: `약어를 ${read}으로 읽었지만 도안에는 ${TERMS_KR[guess.terms]}에만 있는 약어(${guess.evidence})가 보입니다. 약어 체계를 확인해 주세요.` })
  } else if (!guess) {
    notes.push({ kind: 'unclear', text: `이 도안의 약어만으로는 미국식인지 영국식인지 가릴 수 없었어요. ${read}으로 읽었습니다. 도안의 표기 안내를 보고 약어 체계를 확인해 주세요.` })
  }
  if (pattern.terms === 'uk') {
    let suspect = 0
    for (const s of pattern.sections)
      for (const g of s.groups)
        for (const r of g.rows) {
          const used = ids(r.ops)
          // 영국식 글의 dc는 짧은뜨기(sc)로 옮겨져야 합니다. 글에 tr이 없는데 한길긴뜨기(dc)가 있으면 바꾸지 않은 것입니다.
          if (used.has('dc') && /\bdc\b/i.test(r.text) && !/\btr\b/i.test(r.text)) suspect++
        }
    if (suspect > 0) notes.push({ kind: 'unclear', text: `영국식 도안인데 약어가 바뀌지 않은 것으로 보이는 단이 ${suspect}개 있습니다 (영국식 dc는 짧은뜨기입니다). 약어 체계를 확인해 주세요.` })
  }
  return notes
}

/** checkTerms의 결과를 도안의 "사람이 확인할 곳"에 덧붙입니다. 같은 글은 두 번 넣지 않습니다. */
export function withTermNotes(pattern: Pattern): Pattern {
  const found = checkTerms(pattern)
  if (found.length === 0) return pattern
  const have = new Set((pattern.notes ?? []).map((n) => n.text))
  const add = found.filter((n) => !have.has(n.text))
  return add.length === 0 ? pattern : { ...pattern, notes: [...(pattern.notes ?? []), ...add] }
}

function remap(ops: Op[], table: Readonly<Record<string, string>>): Op[] {
  return ops.map((op) => {
    if ('st' in op) return { ...op, st: table[op.st.toLowerCase()] ?? op.st }
    if ('repeat' in op) return { ...op, repeat: remap(op.repeat, table) }
    return op
  })
}

/**
 * 약어 체계를 바꿔 다시 풉니다. 확인 화면에서 "이 도안은 영국식이에요"를 고를 때 씁니다.
 * 도안에 적힌 약어는 그대로이고, 그 약어가 가리키는 코가 바뀝니다.
 */
export function reinterpretTerms(pattern: Pattern, to: 'us' | 'uk'): Pattern {
  if (pattern.craft !== 'crochet' || pattern.terms === to) return pattern
  const table = to === 'uk' ? UK_TO_US : US_TO_UK
  return {
    ...pattern,
    terms: to,
    sections: pattern.sections.map((s) => ({ ...s, groups: s.groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, ops: remap(r.ops, table) })) })) })),
  }
}

/** 구간의 기둥코가 1코로 세는 것(tch)인지, 세지 않는 것(tch0)인지. 기둥코가 없으면 null, 섞여 있으면 'mixed' */
export function turningChains(section: Pattern['sections'][number]): 'counted' | 'uncounted' | 'mixed' | null {
  const seen = new Set<string>()
  const walk = (ops: Op[]) => {
    for (const op of ops) {
      if ('st' in op) {
        const id = op.st.toLowerCase()
        if (id === 'tch' || id === 'tch0') seen.add(id)
      } else if ('repeat' in op) walk(op.repeat)
    }
  }
  for (const g of section.groups) for (const r of g.rows) walk(r.ops)
  if (seen.size === 0) return null
  if (seen.size === 2) return 'mixed'
  return seen.has('tch') ? 'counted' : 'uncounted'
}

/**
 * 구간의 기둥코를 모두 "1코로 셈" 또는 "세지 않음"으로 바꿉니다.
 * 도안이 기둥코를 코로 세는지는 LLM이 잘못 읽기 쉬운 곳이라, 확인 화면에서 한 번에 바꿀 수 있게 합니다.
 */
export function setTurningChains(pattern: Pattern, sectionIndex: number, counted: boolean): Pattern {
  const table: Record<string, string> = counted ? { tch0: 'tch' } : { tch: 'tch0' }
  return {
    ...pattern,
    sections: pattern.sections.map((s, i) => (i !== sectionIndex ? s : { ...s, groups: s.groups.map((g) => ({ ...g, rows: g.rows.map((r) => ({ ...r, ops: remap(r.ops, table) })) })) })),
  }
}

