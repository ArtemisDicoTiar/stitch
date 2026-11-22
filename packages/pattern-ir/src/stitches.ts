/**
 * 코 사전. 코의 뜻은 IR 밖에 둡니다.
 * 엔진은 "쓰는 코 수"와 "만드는 코 수"로 검산하고,
 * 그리는 쪽은 같은 사전의 기호와 뜨는 법을 씁니다.
 */
import type { Craft } from './ir'

/** 기호 도안에 그리는 기호 10가지 (대바늘) */
export const KNIT_SYMBOLS = ['K', 'P', 'YO', 'K2TOG', 'SSK', 'SK2P', 'M1L', 'M1R', 'CO', 'BO'] as const
export type SymbolId = (typeof KNIT_SYMBOLS)[number]

export type StitchDef = {
  id: string
  craft: Craft
  /** 이 코가 쓰는 코 수 (바늘에서 가져가는 코) */
  consumes: number
  /** 이 코가 만드는 코 수 */
  produces: number
  name: { kr: string; en: string }
  /** 도안에서 이 코를 가리키는 말들. 읽기 프롬프트와 표시용. */
  abbr: string[]
  /** 겉면에서 떴을 때의 기호. as_set 은 기둥의 무늬를 따릅니다. */
  symbol: SymbolId | 'as_set' | null
  /** 뜬 면에서 본 모습. 겉(K)인지 안(P)인지. 무늬에 맞춰 뜨기의 기준이 됩니다. */
  face: 'K' | 'P' | null
  /** 줄임에서 살아남는 코의 순서 (뜨는 순서 기준 0부터) */
  keep?: number
  /** 코바늘 코의 높이 (짧은뜨기 = 1) */
  height?: number
  note?: string
}

const knit = (d: Omit<StitchDef, 'craft'>): StitchDef => ({ craft: 'knit', ...d })
const crochet = (d: Omit<StitchDef, 'craft'>): StitchDef => ({ craft: 'crochet', ...d })

export const STITCHES: Record<string, StitchDef> = Object.fromEntries(
  [
    knit({ id: 'k', consumes: 1, produces: 1, name: { kr: '겉뜨기', en: 'knit' }, abbr: ['겉', 'k', 'knit'], symbol: 'K', face: 'K', note: '안면 단에서는 안뜨기로 보임' }),
    knit({ id: 'p', consumes: 1, produces: 1, name: { kr: '안뜨기', en: 'purl' }, abbr: ['안', 'p', 'purl'], symbol: 'P', face: 'P' }),
    knit({ id: 'pat', consumes: 1, produces: 1, name: { kr: '무늬에 맞춰 뜨기', en: 'work as established' }, abbr: ['무늬대로', '무늬에 맞춰', 'in pattern'], symbol: 'as_set', face: null, note: '아랫단의 코가 겉이면 겉뜨기, 안이면 안뜨기' }),
    knit({ id: 'yo', consumes: 0, produces: 1, name: { kr: '바늘비우기', en: 'yarn over' }, abbr: ['바늘비우기', 'yo'], symbol: 'YO', face: 'K' }),
    knit({ id: 'k2tog', consumes: 2, produces: 1, keep: 1, name: { kr: '왼코 겹치기', en: 'k2tog' }, abbr: ['k2tog', '왼코 겹쳐 2코 모아뜨기'], symbol: 'K2TOG', face: 'K', note: '오른쪽으로 기움' }),
    knit({ id: 'ssk', consumes: 2, produces: 1, keep: 0, name: { kr: '오른코 겹치기', en: 'ssk' }, abbr: ['ssk', '오른코 겹쳐 2코 모아뜨기'], symbol: 'SSK', face: 'K', note: '왼쪽으로 기움' }),
    knit({ id: 'sk2p', consumes: 3, produces: 1, keep: 1, name: { kr: '3코 모아뜨기', en: 'sk2p' }, abbr: ['sk2p', '3코 모아뜨기', '중심 3코 모아뜨기'], symbol: 'SK2P', face: 'K' }),
    knit({ id: 'm1l', consumes: 0, produces: 1, name: { kr: '왼쪽 꼬아 늘리기', en: 'M1L' }, abbr: ['m1l', 'M1L'], symbol: 'M1L', face: 'K', note: '코 사이 가로실에서 늘림' }),
    knit({ id: 'm1r', consumes: 0, produces: 1, name: { kr: '오른쪽 꼬아 늘리기', en: 'M1R' }, abbr: ['m1r', 'M1R'], symbol: 'M1R', face: 'K', note: '코 사이 가로실에서 늘림' }),
    knit({ id: 'co', consumes: 0, produces: 1, name: { kr: '감아코', en: 'cast on' }, abbr: ['감아코', 'co', 'cast on'], symbol: 'CO', face: 'K' }),
    knit({ id: 'bo', consumes: 1, produces: 0, name: { kr: '코막음', en: 'bind off' }, abbr: ['코막음', 'bo', 'bind off'], symbol: 'BO', face: 'K' }),

    // 코바늘 기본 코. 검산 규칙(into)과 그리기는 M5에서 붙입니다.
    crochet({ id: 'ch', consumes: 0, produces: 1, height: 0, name: { kr: '사슬뜨기', en: 'chain' }, abbr: ['사슬', 'ch'], symbol: null, face: null, note: '단 시작의 기둥코를 코 수에 넣는지는 도안마다 다름' }),
    crochet({ id: 'slst', consumes: 1, produces: 0, height: 0, name: { kr: '빼뜨기', en: 'slip stitch' }, abbr: ['빼뜨기', 'sl st'], symbol: null, face: null }),
    crochet({ id: 'sc', consumes: 1, produces: 1, height: 1, name: { kr: '짧은뜨기', en: 'single crochet' }, abbr: ['짧은뜨기', 'sc'], symbol: null, face: null }),
    crochet({ id: 'hdc', consumes: 1, produces: 1, height: 2, name: { kr: '긴뜨기', en: 'half double crochet' }, abbr: ['긴뜨기', 'hdc'], symbol: null, face: null }),
    crochet({ id: 'dc', consumes: 1, produces: 1, height: 3, name: { kr: '한길긴뜨기', en: 'double crochet' }, abbr: ['한길긴뜨기', 'dc'], symbol: null, face: null }),
    crochet({ id: 'inc', consumes: 1, produces: 2, height: 1, name: { kr: '늘림 (한 코에 2번)', en: 'increase' }, abbr: ['늘림', 'inc'], symbol: null, face: null, note: "into: 'same'" }),
    crochet({ id: 'sc2tog', consumes: 2, produces: 1, keep: 1, height: 1, name: { kr: '줄임 (2코 모아뜨기)', en: 'sc2tog' }, abbr: ['줄임', 'sc2tog', 'dec'], symbol: null, face: null }),
  ].map((d) => [d.id, d]),
)

export function getStitch(id: string): StitchDef | undefined {
  return STITCHES[id.toLowerCase()]
}

export function stitchesFor(craft: Craft): StitchDef[] {
  return Object.values(STITCHES).filter((s) => s.craft === craft)
}
