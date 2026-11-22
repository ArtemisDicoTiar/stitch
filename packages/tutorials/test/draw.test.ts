import { describe, expect, it } from 'vitest'
import { KNIT_SYMBOLS } from '@stitch/pattern-ir'
import { DEFAULT_COLORS, STAGE, TUTORIALS, drawScene, drawTutorialFrame, sceneAt, tutorialStates, tween } from '../src'
import { countOf, lines, numbersIn, recordingContext } from './fake-context'

const SIZES = [STAGE, { width: 360, height: 215 }, { width: 320, height: 480 }, { width: 1440, height: 860 }]
const TS = [0, 0.5, 1]

describe('한 프레임 그리기', () => {
  it.each(KNIT_SYMBOLS)('%s: 모든 단계를 t = 0, 0.5, 1에서 그려도 오류가 없고 좌표가 모두 유한하다', (id) => {
    const n = TUTORIALS[id].steps.length
    for (const size of SIZES) {
      for (let step = 0; step < n; step++) {
        for (const t of TS) {
          const r = recordingContext()
          const where = `${id} ${step + 1}단계 t=${t} ${size.width}×${size.height}`
          expect(() => drawTutorialFrame(r.ctx, id, step, t, size), where).not.toThrow()
          expect(countOf(r.calls, 'stroke', 'fill'), `${where} 그리기 명령`).toBeGreaterThan(20)
          const nums = numbersIn(r.calls)
          expect(nums.length, where).toBeGreaterThan(100)
          expect(nums.filter((v) => !Number.isFinite(v)), `${where} NaN`).toEqual([])
          expect(countOf(r.calls, 'save'), `${where} save/restore`).toBe(countOf(r.calls, 'restore'))
          // 바탕부터 칠하고 시작합니다.
          expect(lines(r.calls.slice(0, 3)), where).toEqual([
            `clearRect(0,0,${size.width},${size.height})`,
            `fillStyle=("${DEFAULT_COLORS.background}")`,
            `fillRect(0,0,${size.width},${size.height})`,
          ])
          // 다 그린 뒤 불투명도와 점선을 되돌려 둡니다.
          expect(r.ctx.globalAlpha, where).toBe(1)
        }
      }
    }
  })

  it('같은 (기호, 단계, t, 크기)는 언제나 같은 그림이다', () => {
    for (const id of KNIT_SYMBOLS) {
      const a = recordingContext()
      const b = recordingContext()
      drawTutorialFrame(a.ctx, id, 2, 0.37, STAGE)
      drawTutorialFrame(b.ctx, id, 0, 1, STAGE) // 사이에 다른 것을 그려도
      b.reset()
      drawTutorialFrame(b.ctx, id, 2, 0.37, STAGE)
      expect(lines(b.calls)).toEqual(lines(a.calls))
    }
  })

  it('t = 1은 그 단계의 끝 장면이고, t = 0은 앞 단계에서 출발한다', () => {
    for (const id of KNIT_SYMBOLS) {
      const S = tutorialStates(id)
      S.forEach((end, i) => {
        expect(sceneAt(id, i, 1)).toBe(end)
        expect(sceneAt(id, i)).toBe(end)
        expect(sceneAt(id, i, 7)).toBe(end)
        const prev = S[(i - 1 + S.length) % S.length]
        const start = sceneAt(id, i, 0)
        expect(start.needles).toEqual(prev.needles)
        for (const [k, r] of Object.entries(prev.rings)) expect(start.rings[k], `${id} ${i + 1}단계 고리 ${k}`).toEqual(r)
        expect(sceneAt(id, i, 0.5)).toEqual(tween(prev, end, 0.5))
      })
    }
  })

  it('단계 번호는 범위를 벗어나면 돌아서 이어진다', () => {
    const n = TUTORIALS.K.steps.length
    expect(sceneAt('K', n)).toBe(sceneAt('K', 0))
    expect(sceneAt('K', -1)).toBe(sceneAt('K', n - 1))
    expect(sceneAt('K', Number.NaN)).toBe(sceneAt('K', 0))
  })

  it('from으로 건너뛰는 움직임도 그린다', () => {
    const r = recordingContext()
    drawTutorialFrame(r.ctx, 'SK2P', 5, 0.5, STAGE, { from: 1 })
    expect(numbersIn(r.calls).every(Number.isFinite)).toBe(true)
    expect(sceneAt('SK2P', 5, 0.5, 1)).toEqual(tween(tutorialStates('SK2P')[1], tutorialStates('SK2P')[5], 0.5))
  })

  it('그림은 캔버스 크기에 맞춰 비율을 지키며 가운데에 놓인다', () => {
    const scaleOf = (width: number, height: number): { k: number; dx: number; dy: number } => {
      const r = recordingContext()
      drawTutorialFrame(r.ctx, 'K', 0, 1, { width, height })
      const scale = r.calls.find((c) => c.op === 'scale')
      const move = r.calls.find((c) => c.op === 'translate')
      expect(scale?.args[0]).toBe(scale?.args[1])
      return { k: scale?.args[0] as number, dx: move?.args[0] as number, dy: move?.args[1] as number }
    }
    const one = scaleOf(720, 430)
    const two = scaleOf(1440, 860)
    expect(two.k).toBeCloseTo(one.k * 2, 10)
    // 세로로 긴 상자: 폭에 맞추고 위아래로 남는 만큼 내려 그립니다.
    const tall = scaleOf(360, 800)
    expect(tall.k).toBeCloseTo(360 / 500, 10)
    expect(tall.dx).toBeCloseTo(0, 10)
    expect(tall.dy).toBeGreaterThan(200)
  })

  it('색과 글꼴을 바꿀 수 있고, 주지 않은 색은 기본값이다', () => {
    const base = recordingContext()
    drawTutorialFrame(base.ctx, 'K', 1, 1, STAGE)
    const defaults = lines(base.calls).join('\n')
    expect(defaults).toContain(DEFAULT_COLORS.highlight)
    expect(defaults).toContain(DEFAULT_COLORS.work)
    expect(defaults).toContain('IBM Plex Sans KR')

    const r = recordingContext()
    drawTutorialFrame(r.ctx, 'K', 1, 1, STAGE, { colors: { highlight: '#010203', background: '#0a0b0c' }, fontFamily: 'Pretendard' })
    const custom = lines(r.calls).join('\n')
    expect(custom).toContain('#010203')
    expect(custom).toContain('#0a0b0c')
    expect(custom).not.toContain(DEFAULT_COLORS.highlight)
    expect(custom).not.toContain(DEFAULT_COLORS.background)
    expect(custom).toContain(DEFAULT_COLORS.yarn)
    expect(custom).toContain('700 14px Pretendard')
    expect(custom).not.toContain('IBM Plex Sans KR')
  })

  it('새로 뜨는 실은 파란색, 지금 다루는 코는 주황색으로 그린다', () => {
    // 겉뜨기 4단계: 새 코 N이 오른쪽 바늘에 생깁니다.
    const S = tutorialStates('K')[3]
    expect(S.rings.N).toMatchObject({ col: 'work', hl: 1 })
    const r = recordingContext()
    drawScene(r.ctx, S, STAGE)
    const strokes = r.calls.filter((c) => c.op === 'strokeStyle=').map((c) => c.args[0])
    expect(strokes).toContain(DEFAULT_COLORS.work)
    expect(strokes).toContain(DEFAULT_COLORS.highlight)
  })

  it('움직이는 동안 새 실은 조금씩 그려진다', () => {
    // 겉뜨기 3단계에서 실을 바늘에 감습니다 (y2가 새로 생김).
    const lineTos = (t: number): number => {
      const r = recordingContext()
      drawTutorialFrame(r.ctx, 'K', 2, t, STAGE)
      return countOf(r.calls, 'lineTo')
    }
    expect(sceneAt('K', 2, 0.5).yarn.y2.prog).toBeCloseTo(0.5, 10)
    expect(lineTos(0.2)).toBeLessThan(lineTos(0.6))
    expect(lineTos(0.6)).toBeLessThan(lineTos(1))
  })
})
