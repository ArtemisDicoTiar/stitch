/**
 * (기호, 단계, t, 크기)만으로 정해지는 한 장면.
 * 재생기(player)와 테스트가 같은 함수를 씁니다.
 */
import { TUTORIALS } from './data'
import { STAGE, drawScene } from './draw'
import { resolve, tween } from './scene'
import type { SceneState, TutorialContext2D, TutorialId, TutorialSize, TutorialStyle } from './types'

const cache = new Map<TutorialId, SceneState[]>()

/**
 * 뜨는 법이 있는 기호들. 순서는 코 사전(KNIT_SYMBOLS)과 같습니다.
 * 코 사전을 값으로 들여오면 브라우저 묶음에 IR 검사기(zod)까지 따라오므로, 여기서는 자료의 키를 씁니다.
 */
export const TUTORIAL_IDS: readonly TutorialId[] = Object.keys(TUTORIALS) as TutorialId[]

export function isSymbolId(v: unknown): v is TutorialId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TUTORIALS, v)
}

/** 그 기호의 단계별 끝 장면. 한 번 풀어 두고 다시 씁니다. 돌려받은 값은 고치지 마세요. */
export function tutorialStates(id: TutorialId): readonly SceneState[] {
  let states = cache.get(id)
  if (!states) {
    if (!isSymbolId(id)) throw new RangeError(`뜨는 법이 없는 기호입니다: ${String(id)}`)
    states = TUTORIALS[id].steps.map((s) => resolve(s.scene))
    cache.set(id, states)
  }
  return states
}

/** 단계 번호를 0..n-1로 맞춥니다. 범위를 벗어나면 돌아서 이어집니다 (-1은 마지막 단계). */
export function wrapStep(step: number, count: number): number {
  if (!Number.isFinite(step) || count <= 0) return 0
  return ((Math.trunc(step) % count) + count) % count
}

/**
 * step 단계로 들어가는 움직임의 t 지점 장면.
 * - t = 1 (이상): 그 단계가 끝난 모습
 * - t = 0: 앞 단계가 끝난 모습에서 막 움직이기 시작한 때
 * - from: 어느 단계에서 넘어오는지. 기본은 바로 앞 단계이고, 첫 단계는 마지막 단계에서 넘어옵니다
 *   (자동 재생이 한 바퀴 돌아 처음으로 올 때의 움직임).
 */
export function sceneAt(id: TutorialId, step: number, t = 1, from?: number): SceneState {
  const states = tutorialStates(id)
  const i = wrapStep(step, states.length)
  if (!(t < 1)) return states[i]
  const j = wrapStep(from ?? i - 1, states.length)
  return tween(states[j], states[i], Math.max(0, t))
}

export type FrameOptions = TutorialStyle & {
  /** 어느 단계에서 넘어오는지 (기본: 바로 앞 단계) */
  from?: number
}

/**
 * 한 프레임을 그립니다. (기호, 단계, t, 크기)가 같으면 같은 그림입니다.
 * size는 CSS 픽셀이고, 고해상도 화면은 부르는 쪽에서 ctx.scale(dpr, dpr)을 먼저 겁니다.
 */
export function drawTutorialFrame(
  ctx: TutorialContext2D,
  id: TutorialId,
  step: number,
  t = 1,
  size: TutorialSize = STAGE,
  opts: FrameOptions = {},
): void {
  drawScene(ctx, sceneAt(id, step, t, opts.from), size, opts)
}
