/**
 * 연습용 조개무늬 수세미. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 사슬에서 시작해 왕복으로 뜨며, 한 코에 한길긴뜨기 5코를 떠서 조개 모양을 만듭니다.
 * 건너뛰기와 한 코에 여러 번 뜨기를 확인하는 데 씁니다.
 */
import type { Op, Pattern, Row } from '@stitch/pattern-ir'

const sc = (n: number): Op => ({ st: 'sc', n })
const skip = (n: number): Op => ({ st: 'skip', n })
const shell: Op = { st: 'dc', n: 5, into: 'one', text: '한 코에 한길긴뜨기 5코 (조개)' }
const tch0: Op = { st: 'tch0', n: 1, text: '사슬 1코 (기둥코, 세지 않음)' }
const tch: Op = { st: 'tch', n: 1, text: '사슬 3코 (기둥코, 1코로 셈)' }
const row = (side: Row['side'], text: string, ops: Op[]): Row => ({ side, text, expect_count: 19, ops })

export const practiceShell: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 조개무늬 수세미',
  materials: [
    { kind: '실', spec: '수세미실', qty: '약 30g' },
    { kind: '바늘', spec: '5mm 코바늘' },
  ],
  gauge: null,
  finished: { width_cm: 12, height_cm: 12 },
  template: 'flat',
  sections: [
    {
      id: 'body',
      name: '몸판',
      shape: 'flat',
      // 사슬 20코 중 바늘 쪽 1코는 기둥코 몫입니다. 무늬는 6코의 배수 + 1코.
      start: { kind: 'chain', count: 20 },
      multiple: { of: 6, plus: 2 },
      groups: [
        { rows: [row('RS', '1단: 바늘에서 2번째 사슬에 짧은뜨기 1코, (2코 건너뛰고 한 코에 한길긴뜨기 5코, 2코 건너뛰고 짧은뜨기 1코) 3번 (19코)', [skip(1), sc(1), { repeat: [skip(2), shell, skip(2), sc(1)], times: 3 }])], repeat: { times: 1 } },
        {
          rows: [
            row('WS', '2단: 사슬 3코(1코로 셈), 같은 코에 한길긴뜨기 2코, (2코 건너뛰고 짧은뜨기 1코, 2코 건너뛰고 한 코에 한길긴뜨기 5코) 2번, 2코 건너뛰고 짧은뜨기 1코, 2코 건너뛰고 마지막 코에 한길긴뜨기 3코 (19코)', [
              tch,
              { st: 'dc', n: 2, into: 'same', text: '같은 코에 한길긴뜨기 2코' },
              { repeat: [skip(2), sc(1), skip(2), shell], times: 2 },
              skip(2),
              sc(1),
              skip(2),
              { st: 'dc', n: 3, into: 'one', text: '마지막 코에 한길긴뜨기 3코' },
            ]),
            row('RS', '3단: 사슬 1코, 짧은뜨기 1코, (2코 건너뛰고 한 코에 한길긴뜨기 5코, 2코 건너뛰고 짧은뜨기 1코) 3번 (19코)', [tch0, sc(1), { repeat: [skip(2), shell, skip(2), sc(1)], times: 3 }]),
          ],
          repeat: { times: 5 },
        },
      ],
    },
  ],
  finishing: [{ name: '고리 달기', text: '모서리에 사슬 10코를 떠서 빼뜨기로 고리를 만들고, 실을 숨깁니다.' }],
}
