/**
 * git에서 제외한 prototype/site/tut.js(원래의 자바스크립트)를 읽어 옵니다.
 * 파일이 없으면 null을 돌려주고, 그 파일과 견주는 테스트는 건너뜁니다.
 *
 * 파일을 node:vm 안에서 그대로 실행합니다. 파일은 window.KnitTut에 자료와 함수를 올리고,
 * DOM은 mount 안에서만 쓰므로 빈 window 하나면 됩니다.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const file = join(root, 'prototype/site/tut.js')

export type ProtoStep = { s: unknown; cap: string; hands?: { L?: string; R?: string } }
export type ProtoTutorial = { title: string; intro: string; steps: ProtoStep[] }

/** 파일 안쪽의 함수들. 파일 끝의 `})();` 바로 앞에 한 줄을 끼워 꺼냅니다. */
export type ProtoInternals = {
  getStates(sym: string): unknown[]
  tween(a: unknown, b: unknown, t: number): unknown
  render(g: unknown, state: unknown): void
}

export type Prototype = {
  list: string[]
  get(sym: string): ProtoTutorial
  /** 그 단계의 끝 모습을 720×430 캔버스에 그립니다. */
  snap(canvas: unknown, sym: string, step: number): void
  /** 파일의 모양이 달라져 꺼내지 못하면 null */
  internals: ProtoInternals | null
}

type ProtoWindow = { KnitTut?: Omit<Prototype, 'internals'>; __internals?: ProtoInternals }

function run(src: string): ProtoWindow | null {
  const window: ProtoWindow = {}
  try {
    vm.runInNewContext(src, { window }, { filename: 'tut.js' })
  } catch {
    return null
  }
  return window.KnitTut ? window : null
}

export function loadPrototype(): Prototype | null {
  if (!existsSync(file)) return null
  const src = readFileSync(file, 'utf8')
  const tail = /\}\)\(\);\s*$/
  const opened = tail.test(src) ? run(src.replace(tail, 'window.__internals = { getStates, tween, render };\n})();')) : null
  const w = opened ?? run(src)
  if (!w?.KnitTut) throw new Error('prototype/site/tut.js를 실행했지만 window.KnitTut이 없습니다.')
  return { list: w.KnitTut.list, get: w.KnitTut.get, snap: w.KnitTut.snap, internals: w.__internals ?? null }
}

/** vm 안에서 만든 값을 이쪽의 평범한 값으로 바꿉니다. */
export const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
