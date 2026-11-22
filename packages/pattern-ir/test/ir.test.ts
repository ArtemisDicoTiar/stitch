import { describe, expect, it } from 'vitest'
import { garterScarf, practiceHood } from '@stitch/fixtures'
import { getStitch, KNIT_SYMBOLS, parsePattern, patternJsonSchema, safeParsePattern, STITCHES, stitchesFor } from '../src'

describe('패턴 IR', () => {
  it('직접 쓴 도안이 스키마를 통과한다', () => {
    expect(parsePattern(practiceHood)).toEqual(practiceHood)
    expect(parsePattern(garterScarf)).toEqual(garterScarf)
  })

  it('형식에 맞지 않는 문서를 거절한다', () => {
    expect(safeParsePattern({ ...practiceHood, craft: 'weave' }).success).toBe(false)
    expect(safeParsePattern({ ...practiceHood, sections: [{ id: '', name: 'x', shape: 'flat', start: { kind: 'cast_on', count: 1 }, groups: [] }] }).success).toBe(false)
    const neg = structuredClone(practiceHood)
    neg.sections[0].groups[0].repeat = { times: 0 }
    expect(safeParsePattern(neg).success).toBe(false)
  })

  it('대바늘과 코바늘을 같은 틀에 담는다', () => {
    const crochet = parsePattern({
      craft: 'crochet',
      terms: 'us',
      title: '원형 받침',
      materials: [],
      gauge: null,
      finished: {},
      sections: [
        {
          id: 'disc',
          name: '원판',
          shape: 'spiral',
          start: { kind: 'ring', count: 6 },
          groups: [{ rows: [{ side: 'round', text: '모든 코에 2번씩', ops: [{ repeat: [{ st: 'inc', n: 1, into: 'same' }], until: 'end' }], expect_count: 12 }], repeat: { times: 1 } }],
        },
      ],
      finishing: [],
    })
    expect(crochet.sections[0].shape).toBe('spiral')
  })

  it('JSON 스키마를 낼 수 있다', () => {
    const schema = patternJsonSchema() as { type?: string; properties?: Record<string, unknown> }
    expect(schema.type).toBe('object')
    expect(Object.keys(schema.properties ?? {})).toEqual(expect.arrayContaining(['craft', 'terms', 'gauge', 'sections', 'finishing']))
    expect(JSON.stringify(schema)).toContain('before_center')
  })
})

describe('코 사전', () => {
  it('기호 10가지마다 그 기호를 만드는 대바늘 코가 있다', () => {
    const symbols = new Set(stitchesFor('knit').map((s) => s.symbol))
    for (const s of KNIT_SYMBOLS) expect(symbols.has(s), s).toBe(true)
  })

  it('쓰는 코 수와 만드는 코 수가 계획서의 표와 같다', () => {
    const io = (id: string) => [getStitch(id)!.consumes, getStitch(id)!.produces]
    expect(io('k')).toEqual([1, 1])
    expect(io('k2tog')).toEqual([2, 1])
    expect(io('yo')).toEqual([0, 1])
    expect(io('sk2p')).toEqual([3, 1])
    expect(io('m1l')).toEqual([0, 1])
    expect(io('m1r')).toEqual([0, 1])
    expect(io('sc')).toEqual([1, 1])
    expect(io('inc')).toEqual([1, 2])
    expect(io('sc2tog')).toEqual([2, 1])
    expect(io('ch')).toEqual([0, 1])
  })

  it('id는 대소문자를 가리지 않고, 모르는 코는 undefined', () => {
    expect(getStitch('K2TOG')?.id).toBe('k2tog')
    expect(getStitch('nope')).toBeUndefined()
    expect(Object.keys(STITCHES).length).toBeGreaterThanOrEqual(18)
  })
})
