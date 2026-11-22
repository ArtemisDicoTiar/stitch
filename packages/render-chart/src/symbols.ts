/**
 * 뜨개 기호 (한국·JIS 방식). 대바늘 10가지와 코바늘 9가지.
 * 한 칸을 0~1 좌표로 본 선과 원으로 적어 두고, 도안과 범례가 같은 모양을 씁니다.
 */
import type { Craft, CrochetSymbolId, KnitSymbolId, SymbolId } from '@stitch/pattern-ir'
import { esc, num } from './util'

export type Pt = readonly [number, number]

export type SymbolPrim =
  /** 꺾은선 */
  | { t: 'poly'; p: Pt[] }
  /** 속이 빈 원 */
  | { t: 'circle'; c: Pt; r: number }
  /** 속이 찬 점 */
  | { t: 'dot'; c: Pt; r: number }

export type SymbolDef = {
  /** 한국어 이름 */
  name: string
  en: string
  /** 칸 바탕색. 흰색(#ffffff)이면 바탕을 칠하지 않습니다. */
  bg: string
  prims: SymbolPrim[]
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
  return out
}

/** 꼬인 고리와 기운 다리. lean -1은 왼쪽, +1은 오른쪽 */
function loopLeg(lean: -1 | 1): SymbolPrim[] {
  const loop = arc(0.5, 0.36, 0.15, Math.PI * 0.25, Math.PI * 0.25 + 2 * Math.PI * 0.88)
  return [
    { t: 'poly', p: loop },
    { t: 'poly', p: [[0.5 - 0.02 * lean, 0.5], [0.5 - 0.27 * lean, 0.86]] },
    { t: 'poly', p: [[0.5 + 0.12 * lean, 0.5], [0.5 + 0.2 * lean, 0.62]] },
  ]
}

/** 감아코: 밑줄에서 한 바퀴 감아 올린 고리 */
function eLoop(): SymbolPrim[] {
  const pts: Pt[] = [[0.22, 0.56], [0.74, 0.56], ...arc(0.5, 0.56, 0.24, 0, -Math.PI * 1.72).slice(1)]
  return [{ t: 'poly', p: pts }]
}

/** 닫힌 타원을 꺾은선으로 */
function oval(cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = (2 * Math.PI * i) / n
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return out
}

/** 긴 코의 기둥: 세로 기둥과 머리 가로줄, 그리고 실을 감은 횟수만큼의 빗금 */
function post(slashes: number): SymbolPrim[] {
  const prims: SymbolPrim[] = [
    { t: 'poly', p: [[0.5, 0.2], [0.5, 0.86]] },
    { t: 'poly', p: [[0.28, 0.2], [0.72, 0.2]] },
  ]
  const ys = slashes === 1 ? [0.52] : [0.44, 0.62]
  for (let i = 0; i < slashes; i++) prims.push({ t: 'poly', p: [[0.37, ys[i] + 0.07], [0.63, ys[i] - 0.07]] })
  return prims
}

const KNIT: Record<KnitSymbolId, SymbolDef> = {
  K: { name: '겉뜨기', en: 'knit', bg: '#ffffff', prims: [{ t: 'poly', p: [[0.5, 0.2], [0.5, 0.8]] }] },
  P: { name: '안뜨기', en: 'purl', bg: '#ffffff', prims: [{ t: 'poly', p: [[0.2, 0.5], [0.8, 0.5]] }] },
  YO: { name: '바늘비우기', en: 'yo', bg: '#d7ebff', prims: [{ t: 'circle', c: [0.5, 0.5], r: 0.26 }] },
  K2TOG: {
    name: '왼코 겹치기 (k2tog)',
    en: 'k2tog',
    bg: '#ffdcdc',
    prims: [
      { t: 'poly', p: [[0.58, 0.16], [0.2, 0.84]] },
      { t: 'poly', p: [[0.42, 0.45], [0.8, 0.84]] },
    ],
  },
  SSK: {
    name: '오른코 겹치기 (ssk)',
    en: 'ssk',
    bg: '#ffdcdc',
    prims: [
      { t: 'poly', p: [[0.42, 0.16], [0.8, 0.84]] },
      { t: 'poly', p: [[0.58, 0.45], [0.2, 0.84]] },
    ],
  },
  SK2P: {
    name: '3코 모아뜨기',
    en: 'sk2p',
    bg: '#ffc2c2',
    prims: [
      { t: 'poly', p: [[0.4, 0.13], [0.85, 0.87]] },
      { t: 'poly', p: [[0.53, 0.34], [0.15, 0.87]] },
      { t: 'poly', p: [[0.53, 0.34], [0.53, 0.87]] },
    ],
  },
  M1L: { name: 'M1L (왼쪽 꼬아 늘리기)', en: 'M1L', bg: '#d9f2cf', prims: loopLeg(-1) },
  M1R: { name: 'M1R (오른쪽 꼬아 늘리기)', en: 'M1R', bg: '#d9f2cf', prims: loopLeg(1) },
  CO: { name: '감아코', en: 'backward-loop CO', bg: '#fff0b3', prims: eLoop() },
  BO: { name: '코막음', en: 'bind off', bg: '#e8e0ff', prims: [{ t: 'dot', c: [0.5, 0.5], r: 0.2 }] },
}

const CROCHET: Record<CrochetSymbolId, SymbolDef> = {
  CH: { name: '사슬뜨기', en: 'chain', bg: '#fff6cc', prims: [{ t: 'poly', p: oval(0.5, 0.5, 0.3, 0.16) }] },
  SL: { name: '빼뜨기', en: 'slip stitch', bg: '#e8e0ff', prims: [{ t: 'dot', c: [0.5, 0.5], r: 0.14 }] },
  SC: {
    name: '짧은뜨기',
    en: 'single crochet',
    bg: '#ffffff',
    prims: [
      { t: 'poly', p: [[0.26, 0.26], [0.74, 0.74]] },
      { t: 'poly', p: [[0.74, 0.26], [0.26, 0.74]] },
    ],
  },
  HDC: { name: '긴뜨기', en: 'half double crochet', bg: '#eaf4ff', prims: post(0) },
  DC: { name: '한길긴뜨기', en: 'double crochet', bg: '#d7ebff', prims: post(1) },
  TR: { name: '두길긴뜨기', en: 'treble crochet', bg: '#c2dcff', prims: post(2) },
  SC2: {
    name: '짧은뜨기 모아뜨기 (줄임)',
    en: 'sc2tog',
    bg: '#ffdcdc',
    prims: [
      { t: 'poly', p: [[0.2, 0.84], [0.5, 0.18], [0.8, 0.84]] },
      { t: 'poly', p: [[0.34, 0.56], [0.66, 0.56]] },
    ],
  },
  DC2: {
    name: '긴 코 모아뜨기 (줄임)',
    en: 'dc2tog',
    bg: '#ffc2c2',
    prims: [
      { t: 'poly', p: [[0.24, 0.86], [0.5, 0.2], [0.76, 0.86]] },
      { t: 'poly', p: [[0.3, 0.2], [0.7, 0.2]] },
      { t: 'poly', p: [[0.27, 0.6], [0.47, 0.5]] },
      { t: 'poly', p: [[0.53, 0.5], [0.73, 0.6]] },
    ],
  },
  CL: {
    name: '구슬뜨기',
    en: 'cluster',
    bg: '#d9f2cf',
    prims: [
      { t: 'poly', p: oval(0.5, 0.44, 0.18, 0.27) },
      { t: 'poly', p: [[0.5, 0.71], [0.5, 0.88]] },
    ],
  },
}

export const SYMBOLS: Record<SymbolId, SymbolDef> = { ...KNIT, ...CROCHET }

const KNIT_ORDER: readonly KnitSymbolId[] = ['K', 'P', 'YO', 'K2TOG', 'SSK', 'SK2P', 'M1L', 'M1R', 'CO', 'BO']
const CROCHET_ORDER: readonly CrochetSymbolId[] = ['CH', 'SL', 'SC', 'HDC', 'DC', 'TR', 'SC2', 'DC2', 'CL']

/** 기호를 그리는 순서. 범례도 이 순서를 씁니다. 대바늘 다음에 코바늘입니다. */
export const SYMBOL_ORDER: readonly SymbolId[] = [...KNIT_ORDER, ...CROCHET_ORDER]

/** 한 공예의 기호만, 그리는 순서로 */
export function symbolOrder(craft: Craft): readonly SymbolId[] {
  return craft === 'crochet' ? CROCHET_ORDER : KNIT_ORDER
}

/** 기호의 기본 선 색과, 12px 칸에서의 선 굵기 */
export const SYMBOL_INK = '#262626'
export const SYMBOL_STROKE = 1.05

/**
 * 기호 하나의 모양을 SVG 조각으로. (x, y)에서 시작하는 size 크기의 칸에 그립니다.
 * 선 색과 굵기는 바깥 요소에서 물려받습니다. 점(dot)만 fill을 직접 답니다.
 */
export function symbolGlyph(id: SymbolId, x: number, y: number, size: number, ink = SYMBOL_INK): string {
  let out = ''
  for (const p of SYMBOLS[id].prims) {
    if (p.t === 'poly') {
      out += `<path d="M${p.p.map(([px, py]) => `${num(x + px * size)},${num(y + py * size)}`).join('L')}"/>`
    } else {
      const at = `cx="${num(x + p.c[0] * size)}" cy="${num(y + p.c[1] * size)}" r="${num(p.r * size)}"`
      out += p.t === 'circle' ? `<circle ${at}/>` : `<circle ${at} fill="${esc(ink)}" stroke="none"/>`
    }
  }
  return out
}

/** 기호 모양을 감싸는 선 속성 */
export function strokeAttrs(ink: string, width: number): string {
  return `fill="none" stroke="${esc(ink)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"`
}

export type SymbolSvgOptions = {
  /** 선 색. 기본 #262626 */
  ink?: string
  /** 선 굵기. 기본은 칸 크기에 맞춘 값 */
  strokeWidth?: number
  /** 칸 바탕색. null이면 칠하지 않습니다. 기본은 기호의 바탕색 */
  bg?: string | null
  /** 칸 테두리 색. null이면 그리지 않습니다. 기본 #888 */
  border?: string | null
  /** 스크린 리더가 읽을 이름. 기본은 기호의 한국어 이름 */
  label?: string
}

/** 범례에 쓰는 기호 하나짜리 SVG */
export function symbolSvg(id: SymbolId, size = 24, opts: SymbolSvgOptions = {}): string {
  const def = SYMBOLS[id]
  const ink = opts.ink ?? SYMBOL_INK
  const sw = opts.strokeWidth ?? Math.max(SYMBOL_STROKE, size * 0.07)
  const bg = opts.bg === undefined ? def.bg : opts.bg
  const border = opts.border === undefined ? '#888' : opts.border
  const s = num(size)
  let body = ''
  if (bg) body += `<rect width="${s}" height="${s}" fill="${esc(bg)}"/>`
  body += `<g ${strokeAttrs(ink, sw)}>${symbolGlyph(id, 0, 0, size, ink)}</g>`
  if (border) body += `<rect x="0.4" y="0.4" width="${num(size - 0.8)}" height="${num(size - 0.8)}" fill="none" stroke="${esc(border)}" stroke-width="0.8"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" role="img" aria-label="${esc(opts.label ?? def.name)}">${body}</svg>`
}

/**
 * 한 줄짜리 기호(겉뜨기, 안뜨기)인지. 이런 기호는 이어진 칸을 점선 한 줄로 묶어 그립니다.
 * v는 세로선(칸이 위아래로 이어질 때 묶음), h는 가로선(좌우로 이어질 때 묶음).
 */
export type LineGlyph = { dir: 'v' | 'h'; /** 칸 안에서 선이 시작하는 자리 (0~1) */ at: Pt; /** 선 길이 (0~1) */ len: number }

export function lineGlyph(id: SymbolId): LineGlyph | null {
  const prims = SYMBOLS[id].prims
  if (prims.length !== 1 || prims[0].t !== 'poly' || prims[0].p.length !== 2) return null
  const [a, b] = prims[0].p
  if (a[0] === b[0] && a[1] !== b[1]) return { dir: 'v', at: [a[0], Math.min(a[1], b[1])], len: Math.abs(b[1] - a[1]) }
  if (a[1] === b[1] && a[0] !== b[0]) return { dir: 'h', at: [Math.min(a[0], b[0]), a[1]], len: Math.abs(b[0] - a[0]) }
  return null
}
