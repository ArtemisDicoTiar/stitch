/**
 * git에서 제외한 private/ 폴더의 자료를 읽습니다.
 * 자료가 없으면 null을 돌려주고, 그 자료를 쓰는 테스트는 건너뜁니다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePattern, type Pattern } from '@stitch/pattern-ir'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')

export function loadPrivateJson<T = unknown>(rel: string): T | null {
  const p = join(root, rel)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

export function loadBalaclava(): Pattern | null {
  const raw = loadPrivateJson('private/balaclava.ir.json')
  return raw ? parsePattern(raw) : null
}
