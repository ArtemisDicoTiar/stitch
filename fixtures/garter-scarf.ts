/** 가터 목도리. 이 저장소를 위해 직접 쓴 가장 단순한 도안입니다. */
import type { Pattern } from '@stitch/pattern-ir'

export const garterScarf: Pattern = {
  craft: 'knit',
  terms: 'kr',
  title: '가터 목도리',
  materials: [
    { kind: '실', spec: '중간 굵기 울', qty: '약 150g' },
    { kind: '바늘', spec: '5mm 대바늘' },
  ],
  gauge: { stitches: 16, rows: 30, over_cm: 10, in_stitch: '가터뜨기', tool_mm: 5 },
  finished: { width_cm: 15, height_cm: 30 },
  template: 'flat',
  sections: [
    {
      id: 'body',
      name: '목도리',
      shape: 'flat',
      start: { kind: 'cast_on', count: 24 },
      groups: [
        {
          rows: [
            { side: 'RS', text: '모든 코를 겉뜨기', ops: [{ repeat: [{ st: 'k', n: 1 }], until: 'end' }] },
            { side: 'WS', text: '모든 코를 겉뜨기', ops: [{ repeat: [{ st: 'k', n: 1 }], until: 'end' }] },
          ],
          repeat: { until_cm: 30, from: 'body' },
        },
        {
          rows: [{ side: 'RS', label: '코막음', expect_count: 0, text: '모든 코를 막기', ops: [{ repeat: [{ st: 'bo', n: 1 }], until: 'end' }] }],
          repeat: { times: 1 },
        },
      ],
    },
  ],
  finishing: [{ name: '실 정리', text: '남은 실을 숨깁니다.' }],
}
