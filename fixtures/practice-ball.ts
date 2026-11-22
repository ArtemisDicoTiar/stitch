/**
 * 연습용 코바늘 공. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 매직링에서 시작해 나선으로 늘리고, 고르게 뜬 뒤 줄여서 닫습니다.
 */
import type { Op, Pattern } from '@stitch/pattern-ir'

const sc = (n: number): Op => ({ st: 'sc', n })
const inc: Op = { st: 'inc', n: 1 }
const dec: Op = { st: 'sc2tog', n: 1 }
const round = (text: string, expect_count: number, ops: Op[]) => ({ side: 'round' as const, text, expect_count, ops })
const once = { times: 1 }

export const practiceBall: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 코바늘 공',
  materials: [
    { kind: '실', spec: '중간 굵기 면사', qty: '약 20g' },
    { kind: '바늘', spec: '3mm 코바늘' },
    { kind: '부자재', spec: '솜' },
    { kind: '부자재', spec: '돗바늘' },
  ],
  gauge: { stitches: 22, rows: 24, over_cm: 10, in_stitch: '짧은뜨기', tool_mm: 3 },
  finished: { width_cm: 4.5, height_cm: 5 },
  template: 'none',
  sections: [
    {
      id: 'ball',
      name: '공',
      shape: 'spiral',
      start: { kind: 'ring', count: 0 },
      groups: [
        { rows: [round('1단: 매직링에 짧은뜨기 6코 (6코)', 6, [{ st: 'sc', n: 6, into: 'space' }])], repeat: once },
        { rows: [round('2단: 모든 코에 늘림 (12코)', 12, [{ repeat: [inc], until: 'end' }])], repeat: once },
        { rows: [round('3단: (짧은뜨기 1, 늘림 1) 6번 (18코)', 18, [{ repeat: [sc(1), inc], times: 6 }])], repeat: once },
        { rows: [round('4단: (짧은뜨기 2, 늘림 1) 6번 (24코)', 24, [{ repeat: [sc(2), inc], times: 6 }])], repeat: once },
        { rows: [round('5단: (짧은뜨기 3, 늘림 1) 6번 (30코)', 30, [{ repeat: [sc(3), inc], times: 6 }])], repeat: once },
        { rows: [round('6~10단: 모든 코에 짧은뜨기 (30코)', 30, [{ repeat: [sc(1)], until: 'end' }])], repeat: { times: 5 } },
        { rows: [round('11단: (짧은뜨기 3, 줄임 1) 6번 (24코)', 24, [{ repeat: [sc(3), dec], times: 6 }])], repeat: once },
        { rows: [round('12단: (짧은뜨기 2, 줄임 1) 6번 (18코)', 18, [{ repeat: [sc(2), dec], times: 6 }])], repeat: once },
        { rows: [round('13단: (짧은뜨기 1, 줄임 1) 6번 (12코). 솜을 채웁니다.', 12, [{ repeat: [sc(1), dec], times: 6 }])], repeat: once },
        { rows: [round('14단: 줄임 6번 (6코)', 6, [{ repeat: [dec], times: 6 }])], repeat: once },
      ],
    },
  ],
  finishing: [{ name: '닫기', text: '실을 20cm 남기고 자른 뒤, 남은 6코의 앞고리에 돗바늘로 실을 통과시켜 조이고 실을 숨깁니다.' }],
}
