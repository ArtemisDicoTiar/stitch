/**
 * 연습용 코바늘 곰 인형. 이 저장소를 위해 직접 쓴 코바늘 도안입니다.
 * 머리, 몸통, 팔 2개, 귀 2개를 따로 떠서 잇습니다. 조각이 여럿인 도안과 "2개 만들기"를 확인하는 데 씁니다.
 */
import type { Op, Pattern, Row, RowGroup } from '@stitch/pattern-ir'

const sc = (n: number): Op => ({ st: 'sc', n })
const inc: Op = { st: 'inc', n: 1 }
const dec: Op = { st: 'sc2tog', n: 1 }
const round = (text: string, expect_count: number, ops: Op[]): Row => ({ side: 'round', text, expect_count, ops })
const once = (row: Row): RowGroup => ({ rows: [row], repeat: { times: 1 } })
const times = (row: Row, n: number): RowGroup => ({ rows: [row], repeat: { times: n } })

/** "n단: 매직링에 짧은뜨기 6코" */
const ring = (n = 6): RowGroup => once(round(`1단: 매직링에 짧은뜨기 ${n}코 (${n}코)`, n, [{ st: 'sc', n, into: 'space' }]))
/** "k단: 모든 코에 늘림" */
const allInc = (k: number, to: number): RowGroup => once(round(`${k}단: 모든 코에 늘림 (${to}코)`, to, [{ repeat: [inc], until: 'end' }]))
/** "k단: (짧은뜨기 a, 늘림 1) 6번" */
const grow = (k: number, a: number, reps: number, to: number): RowGroup => once(round(`${k}단: (짧은뜨기 ${a}, 늘림 1) ${reps}번 (${to}코)`, to, [{ repeat: [sc(a), inc], times: reps }]))
/** "k단: (짧은뜨기 a, 줄임 1) 6번" */
const shrink = (k: number, a: number, reps: number, to: number, note = ''): RowGroup =>
  once(round(`${k}단: (짧은뜨기 ${a}, 줄임 1) ${reps}번 (${to}코)${note}`, to, [{ repeat: [sc(a), dec], times: reps }]))
/** "a~b단: 모든 코에 짧은뜨기" */
const even = (from: number, to: number, count: number): RowGroup =>
  times(round(`${from === to ? `${from}단` : `${from}~${to}단`}: 모든 코에 짧은뜨기 (${count}코)`, count, [{ repeat: [sc(1)], until: 'end' }]), to - from + 1)

export const practiceBear: Pattern = {
  craft: 'crochet',
  terms: 'kr',
  title: '연습용 코바늘 곰 인형',
  materials: [
    { kind: '실', spec: '중간 굵기 면사', qty: '약 40g' },
    { kind: '바늘', spec: '3mm 코바늘' },
    { kind: '부자재', spec: '솜' },
    { kind: '부자재', spec: '돗바늘' },
    { kind: '부자재', spec: '검은 자수실 조금' },
  ],
  gauge: { stitches: 22, rows: 24, over_cm: 10, in_stitch: '짧은뜨기', tool_mm: 3 },
  finished: { width_cm: 7, height_cm: 9 },
  template: 'round',
  sections: [
    {
      id: 'head',
      name: '머리',
      shape: 'spiral',
      start: { kind: 'ring', count: 0 },
      groups: [ring(), allInc(2, 12), grow(3, 1, 6, 18), grow(4, 2, 6, 24), grow(5, 3, 6, 30), even(6, 11, 30), shrink(12, 3, 6, 24), shrink(13, 2, 6, 18), shrink(14, 1, 6, 12, '. 솜을 채웁니다.')],
    },
    {
      id: 'body',
      name: '몸통',
      shape: 'spiral',
      start: { kind: 'ring', count: 0 },
      groups: [ring(), allInc(2, 12), grow(3, 1, 6, 18), grow(4, 2, 6, 24), even(5, 9, 24), shrink(10, 2, 6, 18), even(11, 12, 18), shrink(13, 1, 6, 12, '. 솜을 채웁니다.')],
    },
    {
      id: 'arm',
      name: '팔',
      shape: 'spiral',
      start: { kind: 'ring', count: 0 },
      copies: 2,
      groups: [ring(), grow(2, 1, 3, 9), even(3, 8, 9)],
    },
    {
      id: 'ear',
      name: '귀',
      shape: 'spiral',
      start: { kind: 'ring', count: 0 },
      copies: 2,
      groups: [ring(), allInc(2, 12), even(3, 3, 12)],
    },
  ],
  finishing: [
    { name: '머리와 몸통 잇기', text: '머리와 몸통의 열린 12코끼리 맞대고 돗바늘로 돌려 꿰맵니다.' },
    { name: '팔 달기', text: '팔 끝을 납작하게 눌러 몸통 9단 양옆에 꿰맵니다.' },
    { name: '귀 달기', text: '귀를 반으로 접어 머리 5단과 8단 사이 양쪽에 꿰맵니다.' },
    { name: '얼굴', text: '검은 자수실로 머리 9단에 눈과 코를 수놓습니다.' },
  ],
}
