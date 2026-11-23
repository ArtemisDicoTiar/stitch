/** 원형 기호 도안. 직접 쓴 연습 도안으로 확인합니다. */
import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { practiceBall, practiceBear, practiceGranny, practiceHood, practicePouch, practiceScarf } from '@stitch/fixtures'
import { hasPolarPieces, polarLayout, renderPolarSvg } from '../src'

const count = (svg: string, cls: string) => (new RegExp(`<g class="${cls}"[^>]*>(.*?)</g>`).exec(svg)?.[1].match(/<use /g) ?? []).length

describe('원형 기호 도안', () => {
  it('둘러 뜬 조각이 있을 때만 그린다', () => {
    expect(hasPolarPieces(expand(practiceBall))).toBe(true)
    expect(hasPolarPieces(expand(practicePouch))).toBe(true)
    expect(hasPolarPieces(expand(practiceScarf))).toBe(false)
    expect(hasPolarPieces(expand(practiceHood))).toBe(false)
  })

  it('공: 단마다 고리 하나, 코마다 기호 하나이고 바깥으로 갈수록 반지름이 커진다', async () => {
    const e = expand(practiceBall)
    const L = polarLayout(e)
    expect(L.pieces.length).toBe(1)
    const p = L.pieces[0]
    expect(p.rows.length).toBe(14)
    for (let i = 1; i < p.rowRadius.length; i++) expect(p.rowRadius[i] - p.rowRadius[i - 1]).toBeGreaterThanOrEqual(L.cell - 1e-9)
    // 기호가 서로 겹치지 않을 만큼의 둘레
    p.rows.forEach((r, i) => expect(2 * Math.PI * p.rowRadius[i], `${i + 1}단`).toBeGreaterThanOrEqual(r.cells.length * L.cell * 0.97))
    const svg = renderPolarSvg(e)
    expect(count(svg, 'pc-done')).toBe(e.totalStitches)
    expect(svg).not.toContain('pc-todo')
    expect((svg.match(/<circle /g) ?? []).length).toBe(14)
    expect(svg).toContain('14단 · 6코')
    expect(renderPolarSvg(expand(practiceBall))).toBe(svg)
    await expect(svg).toMatchFileSnapshot('./__snapshots__/practice-ball-polar.svg')
  })

  it('진행 위치까지는 선명하게, 그 뒤는 흐리게 그리고 지금 뜨는 단을 표시한다', () => {
    const e = expand(practiceBall)
    const svg = renderPolarSvg(e, { progress: { row: 3, stitch: 5 } })
    expect(count(svg, 'pc-done')).toBe(6 + 12 + 5)
    expect(count(svg, 'pc-todo')).toBe(e.totalStitches - 23)
    expect(svg).toContain('class="pc-now"')
  })

  it('늘림으로 생긴 코는 다른 바탕색으로, 조각이 여럿이면 나란히 그린다', () => {
    expect((renderPolarSvg(expand(practiceBall)).match(/href="#pc-SC-a"/g) ?? []).length).toBe(24)
    const L = polarLayout(expand(practiceBear))
    expect(L.pieces.map((p) => p.name)).toEqual(['머리', '몸통', '팔 1', '팔 2', '귀 1', '귀 2'])
    for (let i = 1; i < L.pieces.length; i++) expect(L.pieces[i].cx - L.pieces[i].radius).toBeGreaterThan(L.pieces[i - 1].cx + L.pieces[i - 1].radius)
    expect(L.width).toBeGreaterThan(L.pieces.at(-1)!.cx + L.pieces.at(-1)!.radius)
  })

  it('그래니 스퀘어: 사슬과 한길긴뜨기가 뜬 순서대로 둘러 놓인다', () => {
    const e = expand(practiceGranny)
    const svg = renderPolarSvg(e)
    expect(count(svg, 'pc-done')).toBe(e.totalStitches)
    expect(svg).toContain('id="pc-CH"')
    expect(svg).toContain('id="pc-DC"')
  })
})
