/**
 * 연습용 코바늘 파우치. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 사슬의 양쪽을 돌며 떠서 타원 바닥을 만들고, 단마다 빼뜨기로 닫으며 옆면을 올립니다.
 * 타원 바닥, 닫는 원형단(잇는 빼뜨기와 세지 않는 기둥코), 이랑뜨기를 확인하는 데 씁니다.
 */
import type { Op, Pattern, Row } from '@stitch/pattern-ir'

const sc = (n: number): Op => ({ st: 'sc', n })
const in1 = (n: number): Op => ({ st: 'sc', n, into: 'one', text: `한 코에 짧은뜨기 ${n}코` })
const tch0: Op = { st: 'tch0', n: 1, text: '사슬 1코 (기둥코, 세지 않음)' }
const join: Op = { st: 'join', n: 1, text: '첫 코에 빼뜨기' }
const round = (text: string, expect_count: number, ops: Op[]): Row => ({ side: 'round', text, expect_count, ops: [tch0, ...ops, join] })

export const practicePouch: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 코바늘 파우치',
  materials: [
    { kind: '실', spec: '굵은 면사', qty: '약 60g' },
    { kind: '바늘', spec: '4mm 코바늘' },
    { kind: '부자재', spec: '돗바늘' },
  ],
  gauge: { stitches: 18, rows: 20, over_cm: 10, in_stitch: '짧은뜨기', tool_mm: 4 },
  finished: { width_cm: 12, height_cm: 8 },
  template: 'round',
  sections: [
    {
      id: 'base',
      name: '바닥',
      shape: 'round',
      // 사슬 13코 중 바늘 쪽 1코는 기둥코 몫입니다.
      start: { kind: 'chain', count: 12 },
      groups: [
        { rows: [round('1단: 사슬 13코. 바늘에서 2번째 사슬부터 짧은뜨기 11코, 마지막 사슬에 3코, 반대쪽으로 돌아 짧은뜨기 10코, 마지막 사슬에 2코, 첫 코에 빼뜨기 (26코)', 26, [sc(11), in1(3), sc(10), in1(2)])], repeat: { times: 1 } },
        { rows: [round('2단: 사슬 1코, 늘림 1, 짧은뜨기 10, 늘림 3, 짧은뜨기 10, 늘림 2, 빼뜨기 (32코)', 32, [{ st: 'inc', n: 1 }, sc(10), { st: 'inc', n: 3 }, sc(10), { st: 'inc', n: 2 }])], repeat: { times: 1 } },
      ],
    },
    {
      id: 'side',
      name: '옆면',
      shape: 'round',
      start: { kind: 'continue', count: 32, from: 'base' },
      groups: [
        { rows: [round('3단: 사슬 1코, 모든 코의 뒤쪽 반코에 짧은뜨기 (이랑뜨기), 빼뜨기 (32코)', 32, [{ repeat: [{ st: 'scblo', n: 1 }], until: 'end', text: '끝까지 이랑뜨기' }])], repeat: { times: 1 } },
        { rows: [round('4~16단: 사슬 1코, 모든 코에 짧은뜨기, 빼뜨기 (32코)', 32, [{ repeat: [sc(1)], until: 'end', text: '끝까지 짧은뜨기' }])], repeat: { times: 13 } },
      ],
    },
  ],
  finishing: [{ name: '실 정리', text: '실을 잘라 마지막 고리로 빼내고 돗바늘로 숨깁니다.' }],
}
