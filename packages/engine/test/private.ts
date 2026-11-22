/**
 * git에서 제외한 private/, prototype/ 폴더의 자료를 읽습니다.
 * 자료가 없으면 null을 돌려주고, 그 자료를 쓰는 테스트는 건너뜁니다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePattern, type Pattern } from '@stitch/pattern-ir'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

export function loadPrivateJson<T = unknown>(rel: string): T | null {
  // STITCH_NO_PRIVATE=1 이면 비공개 자료가 없는 것처럼 돕니다. (새로 받은 저장소에서의 동작 확인용)
  if (process.env.STITCH_NO_PRIVATE) return null
  const p = join(root, rel)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

export function loadBalaclava(): Pattern | null {
  const raw = loadPrivateJson('private/balaclava.ir.json')
  return raw ? parsePattern(raw) : null
}

/** 실제 도안의 기대값(단수, 코 수 흐름, 게이지 다시 계산 결과). 숫자 자체는 private/ 에만 둡니다. */
export type BalaclavaExpected = {
  totalRows: number
  sections: [number, number][]
  countChanges: number[]
  countAt: [number, number][]
  original: { castOn: number; gaugeStitches: number }
  regauge: {
    mine: { stitches: number; rows: number }
    counts: Record<string, { from: number; to: number }>
    rows: Record<string, { from: number; to: number }>
    crownDecreaseRows: number
    width: { pattern: number; asIs: number; recalculated: number }
  }
}

export function loadBalaclavaExpected(): BalaclavaExpected | null {
  return loadPrivateJson<BalaclavaExpected>('private/balaclava.expected.json')
}

export type OracleRow = {
  g: number
  side: string
  count: number
  cells: { x: number; k: number; s: string }[]
  markers: number[]
}
export type Oracle = { blocks: { name: string; W: number; rows: OracleRow[] }[] }

export function loadOracle(): Oracle | null {
  return loadPrivateJson<Oracle>('prototype/pattern.json')
}
