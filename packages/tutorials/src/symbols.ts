/**
 * 도안과 뜨는 법을 잇는 두 함수.
 * 도안에 나온 기호만 골라 보여 주고, 단계별 안내의 조각에서 맞는 뜨는 법을 찾습니다.
 */
import type { Expanded } from '@stitch/pattern-ir'
import type { TutorialId } from './types'
import { TUTORIAL_IDS, isSymbolId } from './frame'

/** 도안에 실제로 나온 기호. 순서는 코 사전(KNIT_SYMBOLS)을 따릅니다. */
export function symbolsIn(expanded: Expanded): TutorialId[] {
  const seen = new Set<string>()
  for (const b of expanded.blocks) for (const r of b.rows) for (const c of r.cells) seen.add(c.s)
  return TUTORIAL_IDS.filter((s) => seen.has(s))
}

/**
 * 기호가 아닌 tech 값이 가리키는 뜨는 법.
 * - RIB(겉뜨기와 안뜨기가 섞인 조각), PAT(무늬에 맞춰 뜨기): 겉뜨기부터 보여 줍니다.
 *   둘 다 겉뜨기와 안뜨기만으로 뜨고, 안뜨기는 바로 옆 탭에 있습니다.
 * - BH(단춧구멍 = 바늘비우기 + 모아뜨기): 바늘비우기. 그 마지막 단계가 이어지는 k2tog를 알려 줍니다.
 */
const TECH_ALIAS = new Map<string, TutorialId>([
  ['RIB', 'K'],
  ['PAT', 'K'],
  ['BH', 'YO'],
])

/**
 * 조각(Segment)의 tech 값에 맞는 뜨는 법.
 * 기호 이름이면 그 기호, RIB·PAT은 'K', BH는 'YO'.
 * 뜨는 법이 없는 값(코바늘 코나 사전에 없는 코)은 null.
 */
export function tutorialFor(tech: string): TutorialId | null {
  const t = String(tech ?? '').trim().toUpperCase()
  if (isSymbolId(t)) return t
  return TECH_ALIAS.get(t) ?? null
}
