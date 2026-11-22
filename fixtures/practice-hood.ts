/**
 * 연습용 후드 워머. 이 저장소를 위해 직접 쓴 도안입니다.
 * 목 고무단에서 시작해 머리를 감싸는 후드를 평면으로 뜹니다.
 */
import type { Op, Pattern, Row } from '@stitch/pattern-ir'

const st = (id: string, n = 1, text?: string): Op => (text ? { st: id, n, text } : { st: id, n })
const rem = (n: number) => ({ remaining: n })

const ribRS: Row = {
  side: 'RS',
  label: '고무단 겉면',
  text: '겉2, (안1, 겉1)을 마지막 3코 전까지 반복, 안1, 겉2',
  ops: [st('k', 2), { repeat: [st('p'), st('k')], until: rem(3), text: '(안1, 겉1)을 마지막 3코 전까지 반복' }, st('p', 1), st('k', 2)],
}
const ribWS: Row = {
  side: 'WS',
  label: '고무단 안면',
  text: '안2, (겉1, 안1)을 마지막 3코 전까지 반복, 겉1, 안2',
  ops: [st('p', 2), { repeat: [st('k'), st('p')], until: rem(3), text: '(겉1, 안1)을 마지막 3코 전까지 반복' }, st('k', 1), st('p', 2)],
}
const asSet = (side: 'RS' | 'WS', text = '아랫단 코 모양대로 뜨기'): Row => ({
  side,
  label: '무늬대로',
  text,
  ops: [{ repeat: [st('pat')], until: 'end', text: '끝까지 무늬대로' }],
})

const increase = (marker: 'place' | 'remove'): Row => ({
  side: 'RS',
  text: '겉8, 안1, 가운데 2코 앞까지 겉뜨기, 오른쪽 늘림, 마커, 겉2, 마커, 왼쪽 늘림, 마지막 9코 전까지 겉뜨기, 안1, 겉8',
  ops: [
    st('k', 8),
    st('p', 1),
    { repeat: [st('k')], until: { before_center: 1 }, text: '가운데 2코 앞까지 겉뜨기' },
    st('m1r', 1, '오른쪽 늘림'),
    { repeat: [{ marker }, st('k', 2), { marker }], times: 1, text: '마커, 겉2, 마커' },
    st('m1l', 1, '왼쪽 늘림'),
    { repeat: [st('k')], until: rem(9), text: '마지막 9코 전까지 겉뜨기' },
    st('p', 1),
    st('k', 8),
  ],
})
const plainWS: Row = {
  side: 'WS',
  text: '안8, 겉1, 마지막 9코 전까지 안뜨기, 겉1, 안8',
  ops: [st('p', 8), st('k', 1), { repeat: [st('p')], until: rem(9), text: '마지막 9코 전까지 안뜨기' }, st('k', 1), st('p', 8)],
}
const crownDecrease: Row = {
  side: 'RS',
  label: '줄임단',
  text: '겉8, 안1, 가운데 2코 앞까지 겉뜨기, 오른코 겹치기, 마커, 왼코 겹치기, 마지막 9코 전까지 겉뜨기, 안1, 겉8',
  ops: [
    st('k', 8),
    st('p', 1),
    { repeat: [st('k')], until: { before_center: 2 }, text: '가운데 2코 앞까지 겉뜨기' },
    st('ssk', 1, '오른코 겹치기'),
    { marker: 'place', text: '마커' },
    st('k2tog', 1, '왼코 겹치기'),
    { repeat: [st('k')], until: rem(9), text: '마지막 9코 전까지 겉뜨기' },
    st('p', 1),
    st('k', 8),
  ],
}

export const practiceHood: Pattern = {
  craft: 'knit',
  terms: 'kr',
  title: '연습용 후드 워머',
  materials: [
    { kind: '실', spec: '굵은 울 혼방사', qty: '약 180g' },
    { kind: '바늘', spec: '4.5mm 줄바늘 (80cm)' },
    { kind: '부자재', spec: '단추 1개, 마커 2개, 돗바늘' },
  ],
  gauge: { stitches: 18, rows: 24, over_cm: 10, in_stitch: '메리야스뜨기', tool_mm: 4.5 },
  finished: { width_cm: 26, height_cm: 44 },
  template: 'hood',
  sections: [
    {
      id: 'neck',
      name: '1. 목 고무단',
      shape: 'flat',
      start: { kind: 'cast_on', count: 85 },
      multiple: { of: 2, plus: 1 },
      groups: [
        { rows: [ribRS, ribWS], repeat: { times: 4 } },
        {
          rows: [
            {
              side: 'RS',
              label: '줄임과 단춧구멍',
              expect_count: 79,
              text: '11코 무늬대로, 3코 모아뜨기, 17코 무늬대로, 3코 모아뜨기, 17코 무늬대로, 3코 모아뜨기, 마지막 5코 전까지 무늬대로, 바늘비우기, 왼코 겹치기, 안1, 겉2',
              ops: [
                st('pat', 11),
                st('sk2p'),
                st('pat', 17),
                st('sk2p'),
                st('pat', 17),
                st('sk2p'),
                { repeat: [st('pat')], until: rem(5), text: '마지막 5코 전까지 무늬대로' },
                { repeat: [st('yo'), st('k2tog')], times: 1, text: '바늘비우기, 왼코 겹치기 (단춧구멍)' },
                st('p', 1),
                st('k', 2),
              ],
            },
          ],
          repeat: { times: 1 },
        },
        { rows: [asSet('WS')], repeat: { times: 9 } },
      ],
    },
    {
      id: 'head',
      name: '2. 머리',
      shape: 'flat',
      start: { kind: 'continue', count: 79, from: 'neck' },
      groups: [
        {
          rows: [
            {
              side: 'RS',
              expect_count: 84,
              text: '겉4, 안1, 왼쪽 늘림, 마지막 5코 전까지 겉뜨기, 안1, 겉4, 감아코 4코',
              ops: [st('k', 4), st('p', 1), st('m1l', 1, '왼쪽 늘림'), { repeat: [st('k')], until: rem(5), text: '마지막 5코 전까지 겉뜨기' }, st('p', 1), st('k', 4), st('co', 4)],
            },
          ],
          repeat: { times: 1 },
        },
        {
          rows: [
            {
              side: 'WS',
              expect_count: 88,
              text: '안8, 겉1, 마지막 5코 전까지 안뜨기, 겉1, 안4, 감아코 4코',
              ops: [st('p', 8), st('k', 1), { repeat: [st('p')], until: rem(5), text: '마지막 5코 전까지 안뜨기' }, st('k', 1), st('p', 4), st('co', 4)],
            },
          ],
          repeat: { times: 1 },
        },
        { rows: [increase('place'), plainWS], repeat: { times: 2 } },
        { rows: [{ ...increase('remove'), expect_count: 94 }], repeat: { times: 1 } },
        {
          rows: [asSet('WS', '무늬대로 뜨기 (고무단 위에서 22cm가 될 때까지)'), asSet('RS', '무늬대로 뜨기 (고무단 위에서 22cm가 될 때까지)')],
          repeat: { until_cm: 22, from: 'head' },
        },
      ],
    },
    {
      id: 'crown',
      name: '3. 정수리 줄임',
      shape: 'flat',
      start: { kind: 'continue', count: 94, from: 'head' },
      groups: [
        { rows: [crownDecrease, asSet('WS'), asSet('RS'), asSet('WS')], repeat: { times: 3 } },
        { rows: [crownDecrease, asSet('WS')], repeat: { times: 4 } },
        {
          rows: [{ side: 'RS', label: '코막음', expect_count: 0, text: '모든 코를 느슨하게 막기', ops: [{ repeat: [st('bo')], until: 'end', text: '끝까지 코막음' }] }],
          repeat: { times: 1 },
        },
      ],
    },
  ],
  finishing: [
    { name: '정수리 잇기', text: '코막음한 단을 반으로 접어 돗바늘로 잇습니다.' },
    { name: '실 정리', text: '남은 실을 안쪽에서 숨깁니다.' },
    { name: '단추 달기', text: '단춧구멍 반대편 고무단에 단추를 답니다.' },
  ],
}
