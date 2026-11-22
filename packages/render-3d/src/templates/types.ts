import type { ExpandedRow, GaugeSize } from '@stitch/pattern-ir'
import type { MannequinFit, Vec3 } from '../mannequin-dims'

/** 템플릿이 받는 단 하나 */
export type RowInfo = {
  row: ExpandedRow
  /** 전체에서의 순서 (0부터) */
  index: number
  /** 이 단의 칸 수 */
  n: number
  /** expanded.sections 에서의 순서. 찾지 못하면 -1 */
  section: number
  /** expanded.blocks 에서의 순서 */
  block: number
  /** 그 격자의 폭 */
  blockW: number
}

export type GarmentOptions = {
  /** 10cm 기준 코와 단. Expanded에는 게이지가 없어서 따로 받습니다. 없으면 DEFAULT_GAUGE */
  gauge?: GaugeSize | null
  /** hood: 목(원통)으로 볼 앞쪽 구간 수. 기본값은 구간이 둘 이상이면 1, 아니면 0 */
  neckSections?: number
  /**
   * hood: 얼굴 가장자리의 접는 단.
   * - 'auto' (기본): 머리 구간 내내 양쪽 가장자리 가까이에 안뜨기 세로줄이 하나씩 있으면 그 줄에서 안으로 접습니다
   * - 숫자: 양쪽에서 그 코 수만큼 접습니다 (그 다음 코가 접는 선)
   * - 'none': 접지 않습니다
   */
  faceHem?: 'auto' | 'none' | number
}

export type HoodDetails = {
  template: 'hood'
  /** 코 하나의 폭과 단 하나의 높이 (cm) */
  stitchWidth: number
  rowHeight: number
  neckRows: number
  bodyRows: number
  /** 목 부분의 높이 (cm). 마네킹 목보다 길면 줄여서 그립니다. */
  neckHeight: number
  /** 머리 부분 편물의 길이 (cm): 머리 단수 × 단 높이 */
  bodyLength: number
  /** 머리 부분 편물의 보이는 폭 (cm): 접는 단을 뺀 코 수 × 코 폭 */
  wrapWidth: number
  /** 목 원통의 반지름 (아래, 위) */
  neckRadius: [number, number]
  /** 머리를 감싸는 타원체 */
  shell: { center: Vec3; radius: Vec3 }
  /** 접는 단: 양쪽에서 접힌 코 수. 접지 않으면 null */
  hem: { right: number; left: number } | null
}

export type FlatDetails = {
  template: 'flat'
  stitchWidth: number
  rowHeight: number
  /** 가장 넓은 단의 폭과 전체 높이 (cm) */
  width: number
  height: number
}

/** 따로 뜬 조각 하나 */
export type PieceDetails = {
  /** round: 둥글게 떠서 회전체로 그린 조각, flat: 왕복으로 떠서 펼쳐 놓은 조각 */
  kind: 'round' | 'flat'
  /** 이 조각의 첫 단과 마지막 단 (전체 단 번호) */
  firstRow: number
  lastRow: number
  /** 구간 이름 */
  section: string
  /** 조각 가운데의 x (cm) */
  x: number
  width: number
  height: number
  /** 가장 넓은 곳의 반지름 (둥근 조각만) */
  maxRadius?: number
}

export type RoundDetails = {
  template: 'round'
  stitchWidth: number
  rowHeight: number
  /** 왼쪽부터 놓인 순서 */
  pieces: PieceDetails[]
  /** 모든 조각을 나란히 놓았을 때의 폭과 가장 높은 조각의 높이 (cm) */
  width: number
  height: number
}

export type GarmentDetails = HoodDetails | FlatDetails | RoundDetails

/** 템플릿이 돌려주는 것: 칸의 모서리를 놓는 방법과 마네킹 맞춤 */
export type TemplatePlan = {
  /**
   * ri번째 단의 모서리 c (0..n). c는 겉면에서 본 순서로, 0이 도안의 오른쪽 끝입니다.
   * top이 true면 단의 위쪽 가장자리. 자리와 바깥쪽 법선을 씁니다.
   */
  corner(ri: number, c: number, top: boolean, pos: Vec3, nrm: Vec3): void
  mannequin: MannequinFit | null
  details: GarmentDetails
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x))
export const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
