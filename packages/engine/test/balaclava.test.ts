/**
 * 바라클라바 검산. 실제 도안에서 옮긴 IR과 기대값(단수, 코 수)은 private/ 에만 있어서,
 * 그 폴더가 없으면 이 테스트는 건너뜁니다. 이 파일에는 도안의 숫자를 적지 않습니다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { allRows, rowAt, verify, type Verification } from '../src'
import { loadBalaclava, loadBalaclavaExpected, loadOracle } from './private'

const pattern = loadBalaclava()
const oracle = loadOracle()
const want = loadBalaclavaExpected()

describe.skipIf(!pattern || !want)('바라클라바 IR 검산', () => {
  // 건너뛸 때도 describe 본문은 실행되므로, 비공개 자료를 쓰는 계산은 beforeAll 안에 둡니다.
  let v: Verification
  beforeAll(() => {
    v = verify(pattern!)
  })

  it('검산을 통과한다', () => {
    expect(v.errors).toEqual([])
    expect(v.warnings).toEqual([])
  })

  it('전체 단수와 구간 경계가 기대값과 같다', () => {
    expect(v.expanded.totalRows).toBe(want!.totalRows)
    expect(v.expanded.sections.map((s) => [s.firstRow, s.lastRow])).toEqual(want!.sections)
  })

  it('코 수가 바뀌는 흐름과, 정해 둔 단에서의 코 수가 기대값과 같다', () => {
    const changes: number[] = [want!.countChanges[0]]
    for (const r of allRows(v.expanded)) if (r.count !== changes[changes.length - 1]) changes.push(r.count)
    expect(changes).toEqual(want!.countChanges)
    expect(want!.countAt.map(([g]) => rowAt(v.expanded, g)?.count)).toEqual(want!.countAt.map(([, n]) => n))
  })
})

describe.skipIf(!pattern || !oracle)('바라클라바: 프로토타입 결과와 칸 단위 비교', () => {
  let v: Verification
  let blocks: Verification['expanded']['blocks']
  beforeAll(() => {
    v = verify(pattern!)
    blocks = v.expanded.blocks
  })

  it('격자 수와 폭이 같다', () => {
    expect(blocks.map((b) => [b.name, b.W, b.rows.length])).toEqual(oracle!.blocks.map((b) => [b.name, b.W, b.rows.length]))
  })

  it('모든 단의 면, 코 수, 칸(위치, 순서, 기호)이 같다', () => {
    let cells = 0
    oracle!.blocks.forEach((ob, bi) => {
      ob.rows.forEach((or, ri) => {
        const r = blocks[bi].rows[ri]
        expect(r.g).toBe(or.g)
        expect(r.side, `${or.g}단 면`).toBe(or.side)
        expect(r.count, `${or.g}단 코 수`).toBe(or.count)
        expect(r.cells, `${or.g}단 칸`).toEqual(or.cells)
        cells += or.cells.length
      })
    })
    expect(cells).toBe(v.expanded.totalStitches)
  })

  it('마커 자리가 같다', () => {
    oracle!.blocks.forEach((ob, bi) => {
      ob.rows.forEach((or, ri) => {
        if (or.markers.length) expect(blocks[bi].rows[ri].markers, `${or.g}단 마커`).toEqual(or.markers)
      })
    })
  })
})
