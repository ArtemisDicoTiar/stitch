import { describe, expect, it } from 'vitest'
import { KNIT_SYMBOLS } from '@stitch/pattern-ir'
import { TUTORIALS, TUTORIAL_IDS } from '../src'

describe('뜨는 법 자료', () => {
  it('기호 10가지에 모두 뜨는 법이 있고 순서가 코 사전과 같다', () => {
    expect(Object.keys(TUTORIALS)).toEqual([...KNIT_SYMBOLS])
    expect(TUTORIAL_IDS).toEqual([...KNIT_SYMBOLS])
    expect(KNIT_SYMBOLS).toHaveLength(10)
  })

  it.each(KNIT_SYMBOLS)('%s: 제목과 설명, 2단계 이상, 단계마다 글과 두 손이 할 일', (id) => {
    const t = TUTORIALS[id]
    expect(t.id).toBe(id)
    expect(t.title.trim()).not.toBe('')
    expect(t.label.trim()).not.toBe('')
    expect(t.title.startsWith(t.label)).toBe(true)
    expect(t.summary.trim()).not.toBe('')
    expect(t.steps.length).toBeGreaterThanOrEqual(2)
    t.steps.forEach((s, i) => {
      expect(s.text.trim(), `${id} ${i + 1}단계 글`).not.toBe('')
      expect(s.left.trim(), `${id} ${i + 1}단계 왼손`).not.toBe('')
      expect(s.right.trim(), `${id} ${i + 1}단계 오른손`).not.toBe('')
    })
  })

  it('손이 할 일은 그림에 그리지 않고 글로만 둔다', () => {
    for (const id of KNIT_SYMBOLS) {
      for (const s of TUTORIALS[id].steps) {
        expect(s.scene.tags.map((t) => t.id)).not.toContain('hL')
        expect(s.scene.tags.map((t) => t.id)).not.toContain('hR')
        expect(s.left).not.toMatch(/^왼손/)
        expect(s.right).not.toMatch(/^오른손/)
      }
    }
  })

  it('장면이 가리키는 바늘과 고리가 모두 그 장면 안에 있다', () => {
    for (const id of KNIT_SYMBOLS) {
      TUTORIALS[id].steps.forEach((s, i) => {
        const where = `${id} ${i + 1}단계`
        for (const [k, r] of Object.entries(s.scene.rings)) {
          if (r.on) expect(s.scene.needles[r.on], `${where} 고리 ${k}의 바늘`).toBeDefined()
          else expect([typeof r.x, typeof r.y], `${where} 고리 ${k}의 자리`).toEqual(['number', 'number'])
        }
        const points = [...s.scene.yarn.flatMap((y) => y.pts), ...s.scene.arrows.flatMap((a) => a.pts), ...s.scene.tags.map((t) => t.at), ...s.scene.marks.map((m) => m.at)]
        for (const q of points) {
          if (Array.isArray(q)) continue
          if ('ring' in q) expect(s.scene.rings[q.ring], `${where} 고리 ${q.ring}`).toBeDefined()
          else expect(s.scene.needles[q.n], `${where} 바늘 ${q.n}`).toBeDefined()
        }
        for (const a of s.scene.arrows) expect(a.pts, `${where} 화살표`).toHaveLength(3)
      })
    }
  })
})
