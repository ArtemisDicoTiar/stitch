/**
 * 단의 뜨는 순서(ops)를 고치는 작은 도구들.
 * 모두 이미 복사해 둔 IR(draft)을 바로 고칩니다. 고친 조각과 그 위 반복의 원문 표현(text)은 지웁니다.
 * 더는 맞지 않는 글이 단계별 안내에 남지 않게 하려는 것이고, 단의 원문(row.text)은 건드리지 않습니다.
 */
import type { Craft, Op, Until } from '@stitch/pattern-ir'

/** 반복 안으로 들어가는 길. [2, 0]은 세 번째 조각(반복)의 첫 번째 조각 */
export type OpPath = number[]

type RepeatOp = Extract<Op, { repeat: Op[] }>
export const isRepeat = (op: Op): op is RepeatOp => 'repeat' in op

function listOf(ops: Op[], parent: OpPath): Op[] {
  let list = ops
  for (const i of parent) {
    const op = list[i]
    if (!op || !isRepeat(op)) throw new Error('반복이 아닌 조각 안으로 들어갈 수 없습니다.')
    list = op.repeat
  }
  return list
}

/** path에 있는 조각들(위 반복부터 그 조각까지)의 원문 표현을 지웁니다. */
function clearTexts(ops: Op[], path: OpPath) {
  let list = ops
  for (const i of path) {
    const op = list[i]
    if (!op) return
    delete op.text
    if (!isRepeat(op)) return
    list = op.repeat
  }
}

export function setOp(ops: Op[], path: OpPath, next: Op) {
  const parent = path.slice(0, -1)
  const clean = { ...next }
  delete clean.text
  listOf(ops, parent)[path[path.length - 1]] = clean
  clearTexts(ops, parent)
}

/** 조각을 지웁니다. 반복이 비면 그 반복도 지웁니다. (IR에서 반복은 한 조각 이상이어야 합니다.) */
export function removeOp(ops: Op[], path: OpPath) {
  const parent = path.slice(0, -1)
  const list = listOf(ops, parent)
  list.splice(path[path.length - 1], 1)
  if (list.length === 0 && parent.length > 0) removeOp(ops, parent)
  else clearTexts(ops, parent)
}

export function moveOp(ops: Op[], path: OpPath, dir: -1 | 1) {
  const parent = path.slice(0, -1)
  const list = listOf(ops, parent)
  const i = path[path.length - 1]
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  clearTexts(ops, parent)
}

export function addOp(ops: Op[], parent: OpPath, op: Op) {
  listOf(ops, parent).push(op)
  clearTexts(ops, parent)
}

export const newStitch = (craft: Craft): Op => ({ st: craft === 'crochet' ? 'sc' : 'k', n: 1 })
export const newMarker = (): Op => ({ marker: 'slip' })
export const newRepeat = (craft: Craft): Op => ({ repeat: [newStitch(craft)], until: 'end' })

// --- 반복을 끝내는 자리 ---------------------------------------------------------

export type EndKind = 'times' | 'end' | 'marker' | 'remaining' | 'before_marker' | 'before_center'

export const END_KINDS: { id: EndKind; name: string; unit: string | null }[] = [
  { id: 'times', name: '정해진 횟수만큼', unit: '번' },
  { id: 'end', name: '단 끝까지', unit: null },
  { id: 'remaining', name: '마지막 몇 코가 남을 때까지', unit: '코 남김' },
  { id: 'marker', name: '다음 마커까지', unit: null },
  { id: 'before_marker', name: '다음 마커 몇 코 전까지', unit: '코 전' },
  { id: 'before_center', name: '단 가운데 몇 코 전까지', unit: '코 전' },
]

export function endOf(op: RepeatOp): { kind: EndKind; n: number } {
  if ('times' in op) return { kind: 'times', n: op.times }
  const u = op.until
  if (u === 'end' || u === 'marker') return { kind: u, n: 0 }
  if ('remaining' in u) return { kind: 'remaining', n: u.remaining }
  if ('before_marker' in u) return { kind: 'before_marker', n: u.before_marker }
  return { kind: 'before_center', n: u.before_center }
}

/** 같은 내용의 반복에 끝내는 자리만 바꿔 새 조각을 만듭니다. */
export function withEnd(op: RepeatOp, kind: EndKind, n: number): Op {
  const repeat = op.repeat
  if (kind === 'times') return { repeat, times: Math.max(1, n) }
  const count = Math.max(0, n)
  const until: Until = kind === 'end' || kind === 'marker' ? kind : kind === 'remaining' ? { remaining: count } : kind === 'before_marker' ? { before_marker: count } : { before_center: count }
  return { repeat, until }
}
