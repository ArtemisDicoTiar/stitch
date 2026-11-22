import type { Issue } from '@stitch/pattern-ir'

/** 원문 한 쪽에서 뽑은 글과 글자 위치. 확인 화면에서 원문 위치를 강조하는 데 씁니다. */
export type SourceLine = { text: string; box: [number, number, number, number] }
export type SourcePage = { page: number; width: number; height: number; lines: SourceLine[] }

/** 변환 작업에 남기는 검산 결과 */
export type JobVerification = {
  ok: boolean
  totalRows: number
  errors: Issue[]
  warnings: Issue[]
  notes: Issue[]
}
