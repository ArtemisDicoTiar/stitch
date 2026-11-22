/**
 * 기호별 뜨는 법.
 * 기호마다 바늘과 실이 움직이는 모습을 한 단계씩 그리고, 단계마다 왼손과 오른손이 할 일을 적습니다.
 *
 * - TUTORIALS: 글과 장면 자료
 * - mountTutorial: 캔버스에 띄우는 재생기 (브라우저)
 * - drawTutorialFrame: (기호, 단계, t, 크기)로 한 프레임 그리기 (어디서나)
 * - symbolsIn, tutorialFor: 도안에 나온 기호 고르기
 */
export { TUTORIALS } from './data'
export { DEFAULT_COLORS, DEFAULT_FONT_FAMILY, STAGE, drawScene } from './draw'
export { TUTORIAL_IDS, drawTutorialFrame, sceneAt, tutorialStates, type FrameOptions } from './frame'
export { HOLD_MS, TRANSITION_MS, mountTutorial, type MountOptions, type TutorialHandle } from './player'
export { resolve, tween } from './scene'
export { symbolsIn, tutorialFor } from './symbols'
export type {
  ArrowSpec,
  ArrowState,
  FabricGlyph,
  Layer,
  MarkSpec,
  MarkState,
  NeedlePose,
  NeedleState,
  PointSpec,
  Pt,
  RingSpec,
  RingState,
  SceneSpec,
  SceneState,
  TagSpec,
  TagState,
  ThumbSpec,
  ThumbState,
  Tutorial,
  TutorialColors,
  TutorialId,
  TutorialContext2D,
  TutorialSize,
  TutorialStep,
  TutorialStyle,
  YarnColor,
  YarnSpec,
  YarnState,
} from './types'

/** 그림 읽는 법. 뜨는 법 화면의 안내문에 씁니다. */
export const TUTORIAL_LEGEND = '주황색이 지금 다루는 코, 파란 실이 새로 뜨는 실이에요.'
