/**
 * 기호별 뜨는 법의 자료 구조.
 * 장면(Scene)은 두 겹입니다. 사람이 쓰기 쉬운 "적는 꼴"(…Spec)과
 * 그것을 좌표로 풀어 그리기와 보간에 쓰는 "그리는 꼴"(…State).
 */
import type { KnitSymbolId } from '@stitch/pattern-ir'

// ---------- 적는 꼴 ----------

/** 바늘 자세. 끝(tx,ty)과 뒤끝(bx,by), z는 그리는 순서(작을수록 먼저). */
export type NeedlePose = { tx: number; ty: number; bx: number; by: number; z: number }

/** 실 색. yarn은 이미 떠 놓은 실, work는 지금 새로 뜨는 실. */
export type YarnColor = 'yarn' | 'work'

/** 고리 아래 편물에 그리는 코 모양. 겉, 안, 왼코 겹치기, 오른코 겹치기, 3코 모아뜨기, 꼬아 늘리기. */
export type FabricGlyph = 'K' | 'P' | 'K2' | 'S2' | 'S3' | 'T'

/** 바늘 뒤(b)에 그릴지 앞(f)에 그릴지 */
export type Layer = 'b' | 'f'

/**
 * 점을 적는 세 가지 방법.
 * - [x, y]: 그림 좌표
 * - { ring }: 그 고리의 아래 끝 (at: 'top'이면 위 끝)
 * - { n, d }: 바늘 n의 끝에서 d만큼 들어온 자리
 */
export type PointSpec =
  | [number, number]
  | { ring: string; at?: 'top'; off?: [number, number] }
  | { n: string; d: number; off?: [number, number] }

/** 코 하나(고리). 바늘에 걸려 있으면 on과 d, 빠져 있으면 x, y, rot. */
export type RingSpec = {
  /** 걸려 있는 바늘 */
  on?: string
  /** 바늘 끝에서의 거리 */
  d?: number
  x?: number
  y?: number
  rot?: number
  rx?: number
  ry?: number
  /** 불투명도 (기본 1) */
  a?: number
  /** 강조. 1이면 "지금 다루는 코" */
  hl?: number
  /** 꼬인 코 (1이면 앞뒤 가닥이 바뀜) */
  tw?: number
  col?: YarnColor
  /** 아래 편물을 그리는 정도 (기본 1, 0이면 고리만) */
  vb?: number
  vt?: FabricGlyph
  /** 고리를 꿰고 있는 바늘들. 값이 있으면 고리 절반은 바늘 뒤에 그립니다. */
  thru?: string
  /** 고리 위에 적는 글자 */
  lab?: string
}

export type YarnSpec = { id: string; pts: PointSpec[]; z?: Layer; a?: number; col?: YarnColor }
/** 움직임을 가리키는 화살표. 점 3개(시작, 휘는 점, 끝)와 글자. */
export type ArrowSpec = { id: string; pts: PointSpec[]; t?: string }
export type TagSpec = { id: string; at: PointSpec; text: string }
/** bar는 코와 코 사이 가로실, chain은 막은 코 */
export type MarkSpec = { id: string; kind: 'bar' | 'chain'; at: PointSpec; col?: YarnColor }
export type ThumbSpec = { x: number; y: number; rot?: number }

/** 한 단계가 끝났을 때의 그림 */
export type SceneSpec = {
  needles: Record<string, NeedlePose>
  rings: Record<string, RingSpec>
  yarn: YarnSpec[]
  arrows: ArrowSpec[]
  tags: TagSpec[]
  marks: MarkSpec[]
  thumb?: ThumbSpec
}

// ---------- 그리는 꼴 ----------

export type Pt = { x: number; y: number }
export type NeedleState = NeedlePose & { a: number }
export type RingState = {
  x: number
  y: number
  rot: number
  rx: number
  ry: number
  a: number
  hl: number
  tw: number
  col: YarnColor
  vb: number
  vt: FabricGlyph
  thru: string
  lab: string
}
/** prog는 실을 그려 나간 정도 (0~1) */
export type YarnState = { pts: Pt[]; z: Layer; a: number; prog: number; col: YarnColor }
export type ArrowState = { pts: Pt[]; a: number; t: string }
export type TagState = { x: number; y: number; text: string; a: number }
export type MarkState = { x: number; y: number; kind: 'bar' | 'chain'; a: number; col: YarnColor }
export type ThumbState = { x: number; y: number; rot?: number; a: number }

export type SceneState = {
  needles: Record<string, NeedleState>
  rings: Record<string, RingState>
  yarn: Record<string, YarnState>
  arrows: Record<string, ArrowState>
  tags: Record<string, TagState>
  marks: Record<string, MarkState>
  thumb: ThumbState | null
}

// ---------- 뜨는 법 ----------

export type TutorialStep = {
  /** 이 단계에서 하는 일 */
  text: string
  /** 왼손이 할 일. 따로 할 일이 없으면 '그대로'. */
  left: string
  /** 오른손이 할 일. 따로 할 일이 없으면 '그대로'. */
  right: string
  /** 이 단계가 끝났을 때의 그림 */
  scene: SceneSpec
}

/**
 * 뜨는 법의 열쇠. 지금은 대바늘 기호와 같습니다.
 * 코바늘에는 기호가 아닌 동작(매직링, 기둥코)도 있어서 기호 목록과 따로 둡니다.
 */
export type TutorialId = KnitSymbolId

export type Tutorial = {
  id: TutorialId
  /** 제목. 예: 'k2tog (왼코 겹치기)' */
  title: string
  /** 탭에 쓰는 짧은 이름. 예: 'k2tog' */
  label: string
  /** 한 줄 설명 */
  summary: string
  steps: TutorialStep[]
}

// ---------- 그리기 ----------

/** 그림 크기 (CSS 픽셀) */
export type TutorialSize = { width: number; height: number }

export type TutorialColors = {
  /** 이미 떠 놓은 실: 바탕, 어두운 테두리, 밝은 결 */
  yarn: string
  yarnDark: string
  yarnLight: string
  /** 지금 새로 뜨는 실 (파란 실) */
  work: string
  workDark: string
  workLight: string
  /** 지금 다루는 코와 화살표 (주황색) */
  highlight: string
  background: string
  /** 바늘: 가장자리, 가운데 빛, 반대쪽 가장자리, 테두리 */
  needleEdge: string
  needleShine: string
  needleShade: string
  needleLine: string
  /** 그림 위 꼬리표 */
  tag: string
  tagText: string
  /** 엄지: 살, 테두리, 손톱 */
  skin: string
  skinLine: string
  nail: string
}

export type TutorialStyle = {
  colors?: Partial<TutorialColors>
  /** 그림 속 글자의 글꼴 (CSS font-family) */
  fontFamily?: string
}

/** 그리기에 쓰는 2D 컨텍스트의 부분. CanvasRenderingContext2D와 OffscreenCanvas의 컨텍스트가 모두 맞습니다. */
export type TutorialContext2D = Pick<
  CanvasRenderingContext2D,
  | 'globalAlpha'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'strokeStyle'
  | 'fillStyle'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'clearRect'
  | 'fillRect'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'quadraticCurveTo'
  | 'arc'
  | 'ellipse'
  | 'roundRect'
  | 'stroke'
  | 'fill'
  | 'setLineDash'
  | 'createLinearGradient'
  | 'measureText'
  | 'fillText'
  | 'strokeText'
>
