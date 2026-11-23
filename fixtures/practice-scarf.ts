/**
 * 연습용 코바늘 목도리. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 사슬에서 시작해 한길긴뜨기로 왕복해서 뜹니다. 시작 사슬, 기둥코(1코로 셈), 평면 단을 확인하는 데 씁니다.
 */
import type { Op, Pattern, Row } from '@stitch/pattern-ir'

const tch: Op = { st: 'tch', n: 1, text: '사슬 3코 (기둥코, 1코로 셈)' }
/** 단 끝까지 한길긴뜨기. 코 수를 못박지 않아야 게이지에 맞춰 코 수를 바꿀 수 있습니다. */
const dcAcross: Op = { repeat: [{ st: 'dc', n: 1 }], until: 'end', text: '끝까지 한길긴뜨기' }
const row = (side: Row['side'], text: string, ops: Op[]): Row => ({ side, text, expect_count: 24, ops })

export const practiceScarf: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 코바늘 목도리',
  materials: [
    { kind: '실', spec: '굵은 울 혼방사', qty: '약 120g' },
    { kind: '바늘', spec: '5mm 코바늘' },
    { kind: '부자재', spec: '돗바늘' },
  ],
  gauge: { stitches: 16, rows: 8, over_cm: 10, in_stitch: '한길긴뜨기', tool_mm: 5 },
  finished: { width_cm: 15, height_cm: 100 },
  template: 'flat',
  sections: [
    {
      id: 'body',
      name: '목도리',
      shape: 'flat',
      // 사슬 26코: 24코 + 기둥코 몫 2코. 첫 한길긴뜨기는 바늘에서 4번째 사슬에 뜹니다.
      start: { kind: 'chain', count: 26 },
      multiple: { of: 1, plus: 2 },
      groups: [
        {
          rows: [row('RS', '1단: 사슬 3코를 기둥코로 보고(1코로 셈), 바늘에서 4번째 사슬부터 사슬마다 한길긴뜨기 23코 (24코)', [{ st: 'skip', n: 2, text: '사슬 2코 건너뛰기' }, tch, dcAcross])],
          repeat: { times: 1 },
        },
        {
          rows: [
            row('WS', '2단: 편물을 돌려 기둥코 사슬 3코(1코로 셈), 한길긴뜨기 23코. 마지막 코는 아랫단 기둥코의 머리에 뜹니다 (24코)', [tch, dcAcross]),
            row('RS', '3단: 2단과 같이 뜹니다 (24코)', [tch, dcAcross]),
          ],
          repeat: { times: 39 },
        },
        { rows: [row('WS', '80단: 2단과 같이 뜹니다 (24코)', [tch, dcAcross])], repeat: { times: 1 } },
      ],
    },
  ],
  finishing: [{ name: '실 정리', text: '실을 15cm 남기고 잘라 마지막 고리로 빼낸 뒤, 돗바늘로 편물 속에 숨깁니다.' }],
}
