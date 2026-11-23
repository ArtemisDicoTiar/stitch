/**
 * 연습용 그래니 스퀘어. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 링에서 시작해 한길긴뜨기 3코 묶음과 사슬로 네모를 키워 갑니다.
 * 사슬 공간에 뜨기, 같은 자리에 더 뜨기, 닫는 원형단, 코로 세는 기둥코를 확인하는 데 씁니다.
 */
import type { Op, Pattern, Row } from '@stitch/pattern-ir'

const tchIn: Op = { st: 'tch', n: 1, into: 'space', text: '사슬 3코 (한길긴뜨기 1코로 셈)' }
const dc = (n: number, into: 'space' | 'same'): Op => ({ st: 'dc', n, into })
const ch = (n: number): Op => ({ st: 'ch', n })
const join: Op = { st: 'join', n: 1, text: '첫 코에 빼뜨기' }
/** 모서리: 한 공간에 (한길긴 3, 사슬 2, 한길긴 3) */
const corner: Op[] = [dc(3, 'space'), ch(2), dc(3, 'same')]
const round = (text: string, expect_count: number, ops: Op[]): Row => ({ side: 'round', text, expect_count, ops })
const once = (row: Row) => ({ rows: [row], repeat: { times: 1 } })

export const practiceGranny: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 그래니 스퀘어',
  materials: [
    { kind: '실', spec: '중간 굵기 아크릴사', qty: '약 15g' },
    { kind: '바늘', spec: '4mm 코바늘' },
  ],
  gauge: null,
  finished: { width_cm: 9, height_cm: 9 },
  template: 'round',
  sections: [
    {
      id: 'square',
      name: '모티브',
      shape: 'round',
      start: { kind: 'ring', count: 0 },
      groups: [
        once(
          round('1단: 링에 사슬 3코(한길긴뜨기 1코로 셈), 한길긴뜨기 2코, 사슬 2코, (한길긴뜨기 3코, 사슬 2코) 3번, 첫 코에 빼뜨기 (한길긴뜨기 12코)', 12, [
            tchIn,
            dc(2, 'same'),
            ch(2),
            { repeat: [dc(3, 'same'), ch(2)], times: 3 },
            join,
          ]),
        ),
        once(
          round('2단: 모서리 공간마다 (한길긴뜨기 3코, 사슬 2코, 한길긴뜨기 3코), 모서리 사이에 사슬 1코. 한길긴뜨기 3코는 건너뜁니다 (한길긴뜨기 24코)', 24, [
            { repeat: [{ st: 'skip', n: 3 }, ...corner, ch(1)], times: 4 },
            join,
          ]),
        ),
        once(
          round('3단: 모서리 공간마다 (한길긴뜨기 3코, 사슬 2코, 한길긴뜨기 3코), 변의 사슬 1코 공간마다 한길긴뜨기 3코, 묶음 사이에 사슬 1코 (한길긴뜨기 36코)', 36, [
            { repeat: [{ st: 'skip', n: 3 }, ...corner, ch(1), { st: 'skip', n: 3 }, dc(3, 'space'), ch(1)], times: 4 },
            join,
          ]),
        ),
      ],
    },
  ],
  finishing: [{ name: '실 정리', text: '실을 잘라 빼내고 돗바늘로 숨깁니다.' }],
}
