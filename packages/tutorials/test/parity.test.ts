/**
 * 원래의 자바스크립트(prototype/site/tut.js)와 견주기.
 * 그 파일은 git에서 제외되어 있으므로, 없으면 이 테스트는 건너뜁니다.
 */
import { describe, expect, it } from 'vitest'
import { KNIT_SYMBOLS, type KnitSymbolId } from '@stitch/pattern-ir'
import { STAGE, TUTORIALS, drawScene, drawTutorialFrame, tutorialStates, tween } from '../src'
import { lines, recordingContext } from './fake-context'
import { loadPrototype, plain } from './prototype'

const proto = loadPrototype()

describe.skipIf(!proto)('원래 자료와 같은지 (prototype/site/tut.js)', () => {
  const each = (fn: (id: KnitSymbolId) => void): void => KNIT_SYMBOLS.forEach(fn)

  it('기호 목록이 같다', () => {
    expect([...proto!.list].sort()).toEqual([...KNIT_SYMBOLS].sort())
  })

  it('제목, 설명, 단계 수가 같다', () => {
    each((id) => {
      const p = proto!.get(id)
      const t = TUTORIALS[id]
      expect(t.title, id).toBe(p.title)
      expect(t.label, id).toBe(p.title.split(' (')[0])
      expect(t.summary, id).toBe(p.intro)
      expect(t.steps.length, id).toBe(p.steps.length)
    })
  })

  it('단계마다 글과 두 손이 할 일이 같다', () => {
    each((id) => {
      const p = proto!.get(id)
      TUTORIALS[id].steps.forEach((s, i) => {
        const where = `${id} ${i + 1}단계`
        expect(s.text, where).toBe(p.steps[i].cap)
        // 원래 화면은 손이 할 일이 비어 있으면 '그대로'라고 적습니다.
        expect(s.left, `${where} 왼손`).toBe(p.steps[i].hands?.L || '그대로')
        expect(s.right, `${where} 오른손`).toBe(p.steps[i].hands?.R || '그대로')
      })
    })
  })

  it('단계마다 장면(바늘, 고리, 실, 화살표, 꼬리표)이 값과 순서까지 같다', () => {
    each((id) => {
      const p = proto!.get(id)
      TUTORIALS[id].steps.forEach((s, i) => {
        expect(s.scene, `${id} ${i + 1}단계`).toEqual(plain(p.steps[i].s))
        // 그리는 순서는 키 순서를 따르므로 순서도 봅니다.
        expect(JSON.stringify(s.scene), `${id} ${i + 1}단계 순서`).toBe(JSON.stringify(p.steps[i].s))
      })
    })
  })

  it('단계의 끝 모습을 그리는 명령이 하나하나 같다', () => {
    each((id) => {
      TUTORIALS[id].steps.forEach((_s, i) => {
        const theirs = recordingContext()
        proto!.snap({ getContext: () => theirs.ctx, width: 0, height: 0 }, id, i)
        const ours = recordingContext()
        drawTutorialFrame(ours.ctx, id, i, 1, STAGE)
        expect(theirs.calls.length, `${id} ${i + 1}단계`).toBeGreaterThan(100)
        expect(lines(ours.calls), `${id} ${i + 1}단계`).toEqual(lines(theirs.calls))
      })
    })
  })

  it.skipIf(!proto?.internals)('단계 사이를 잇는 움직임도 그리는 명령이 하나하나 같다', () => {
    const inner = proto!.internals!
    each((id) => {
      const theirStates = inner.getStates(id)
      const ourStates = tutorialStates(id)
      const n = ourStates.length
      expect(plain(theirStates), id).toEqual(plain(ourStates))
      // 바로 앞 단계에서 넘어오는 움직임(첫 단계는 마지막에서)과, 점을 눌러 건너뛰는 움직임
      const pairs: [number, number][] = []
      for (let i = 0; i < n; i++) pairs.push([(i - 1 + n) % n, i], [(i + 2) % n, i])
      for (const [a, b] of pairs) {
        for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
          const where = `${id} ${a + 1}→${b + 1}단계 t=${t}`
          const theirs = recordingContext()
          inner.render(theirs.ctx, inner.tween(theirStates[a], theirStates[b], t))
          const ours = recordingContext()
          drawScene(ours.ctx, tween(ourStates[a], ourStates[b], t), STAGE)
          expect(lines(ours.calls), where).toEqual(lines(theirs.calls))
          if (t < 1) {
            const viaFrame = recordingContext()
            drawTutorialFrame(viaFrame.ctx, id, b, t, STAGE, { from: a })
            expect(lines(viaFrame.calls), `${where} (drawTutorialFrame)`).toEqual(lines(theirs.calls))
          }
        }
      }
    })
  })
})
