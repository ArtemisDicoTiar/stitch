/**
 * 엔진이 IR을 한 코씩 따라가며 펼친 결과.
 * 기호 도안, 3D, 단계별 안내, 진행 표시가 모두 이 구조를 읽습니다.
 */
import type { Side } from './ir'
import type { SymbolId } from './stitches'

/** 격자 한 칸. x는 기둥 위치(0이 왼쪽 끝), k는 그 단에서 뜬 순서. */
export type ChartCell = { x: number; k: number; s: SymbolId }

/** 지시문의 한 조각과 그 조각이 만든 칸들 */
export type Segment = { text: string; tech: string; xs: number[] }

export type ExpandedRow = {
  /** 전체에서의 단 번호 (1부터) */
  g: number
  side: Side
  label: string
  /** 원문 지시문 */
  instr: string
  sectionId: string
  /** 구간 이름 */
  section: string
  /** 이 단을 뜬 뒤 바늘에 걸린 코 수 */
  count: number
  /** 도안에 적힌 코 수 */
  expect?: number
  /** 뜬 순서대로의 칸 */
  cells: ChartCell[]
  segments: Segment[]
  /** 마커 바로 앞 코의 x */
  markers: number[]
  /** 길이로 적힌 구간에서 게이지로 추정한 단 */
  estimated?: boolean
  /**
   * 코바늘 단의 높이. 그 단에서 가장 높은 코의 높이입니다 (짧은뜨기 1, 한길긴뜨기 3).
   * 대바늘 단에는 없습니다.
   */
  h?: number
  /**
   * 엔진이 구간의 시작에서 만들어 넣은 단 (시작 사슬, 매직링에 뜨는 첫 단).
   * IR에는 이 단이 없어서 ref.group과 ref.row가 -1입니다.
   */
  start?: 'chain' | 'ring'
  /** IR에서의 위치 */
  ref: { section: number; group: number; row: number; rep: number }
}

/** 기호 도안의 격자 하나. 구간이 바뀌며 죽은 기둥을 정리할 때 새 격자가 됩니다. */
export type ChartBlock = { name: string; W: number; rows: ExpandedRow[] }

export type IssueLevel = 'error' | 'warn' | 'info'

export type Issue = {
  level: IssueLevel
  code:
    | 'count_mismatch'
    | 'overrun'
    | 'leftover'
    | 'unknown_stitch'
    | 'marker_missing'
    | 'marker_inside'
    | 'side_order'
    | 'needs_gauge'
    | 'estimated_rows'
    | 'start_mismatch'
    | 'multiple_mismatch'
    | 'no_space'
    | 'empty'
  message: string
  g?: number
  ref?: { section: number; group?: number; row?: number }
  expected?: number
  actual?: number
}

export type SectionSummary = {
  id: string
  name: string
  block: number
  firstRow: number
  lastRow: number
  startCount: number
  endCount: number
  rows: number
}

export type Expanded = {
  blocks: ChartBlock[]
  sections: SectionSummary[]
  totalRows: number
  /** 전체 칸 수. 진행률의 분모입니다. */
  totalStitches: number
  issues: Issue[]
}

/** 진행 위치: 단과 그 단에서 뜬 코 수. 모든 출력이 같은 값을 씁니다. */
export type Progress = { row: number; stitch: number }
