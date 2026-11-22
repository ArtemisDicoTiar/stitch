/**
 * git에서 제외한 private/, prototype/ 폴더의 자료를 읽습니다.
 * 자료가 없으면 null을 돌려주고, 그 자료를 쓰는 테스트는 건너뜁니다.
 * 여기서 읽은 내용은 비교에만 쓰고 파일이나 스냅샷으로 남기지 않습니다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePattern, type Pattern } from '@stitch/pattern-ir'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

export function loadPrivateText(rel: string): string | null {
  const p = join(root, rel)
  if (!existsSync(p)) return null
  return readFileSync(p, 'utf8')
}

export function loadPrivateJson<T = unknown>(rel: string): T | null {
  const text = loadPrivateText(rel)
  return text === null ? null : (JSON.parse(text) as T)
}

export function loadBalaclava(): Pattern | null {
  const raw = loadPrivateJson('private/balaclava.ir.json')
  return raw ? parsePattern(raw) : null
}

export type OracleRow = {
  g: number
  side: string
  count: number
  cells: { x: number; k: number; s: string }[]
  markers: number[]
}
export type Oracle = { blocks: { name: string; W: number; rows: OracleRow[] }[] }

/** 프로토타입이 펼친 결과 */
export function loadOracle(): Oracle | null {
  return loadPrivateJson<Oracle>('prototype/pattern.json')
}

/** 프로토타입이 그린 기호 도안 */
export function loadPrototypeChart(): string | null {
  return loadPrivateText('prototype/site/chart.svg')
}

/** 프로토타입의 기호 모양 */
export function loadPrototypeSymbols(): Record<string, { bg: string; prims: unknown[] }> | null {
  return loadPrivateJson('prototype/symbols.json')
}
