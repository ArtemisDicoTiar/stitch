/**
 * 실 질감 그림. 기호마다 칸 하나씩, 가로로 ATLAS_TILES 칸을 그립니다.
 * 브라우저에서만 부릅니다 (2D 캔버스를 씁니다).
 */
import * as THREE from 'three'
import type { Craft, CrochetSymbolId, SymbolId } from '@stitch/pattern-ir'
import { ATLAS_TILES, CROCHET_SYMBOL_ORDER, SYMBOL_ORDER } from './garment'

const TS = 128

export type RGB = [number, number, number]

/** CSS 색을 0~255의 sRGB로. 읽지 못하면 fallback */
export function parseColor(css: string | null | undefined, fallback: string): RGB {
  const hex = (s: string): RGB | null => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s.trim())
    if (!m) return null
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  return (css ? hex(css) : null) ?? hex(fallback) ?? [176, 147, 127]
}

const css = (c: RGB): string => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`
/** 어둡게 (k < 1) */
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
/** 흰색 쪽으로 */
export const tint = (c: RGB, k: number): RGB => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]
export const toHex = (c: RGB): number => (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])

type Palette = {
  bgTop: string
  bgBottom: string
  legDark: string
  legLight: string
  shine: string
  purlTop: string
  purlBottom: string
  purlShine: string
  hole: string
  cross: string
}

function paletteOf(yarn: RGB): Palette {
  return {
    bgTop: css(shade(yarn, 0.6)),
    bgBottom: css(shade(yarn, 0.53)),
    legDark: css(shade(yarn, 0.89)),
    legLight: css(yarn),
    shine: css(tint(yarn, 0.26)),
    purlTop: css(shade(yarn, 0.96)),
    purlBottom: css(shade(yarn, 0.87)),
    purlShine: css(tint(yarn, 0.2)),
    hole: css(shade(yarn, 0.17)),
    cross: css(tint(yarn, 0.22)),
  }
}

function drawKnitTile(g: CanvasRenderingContext2D, sym: SymbolId, x0: number, p: Palette) {
  const grd = g.createLinearGradient(x0, 0, x0, TS)
  grd.addColorStop(0, p.bgTop)
  grd.addColorStop(1, p.bgBottom)
  g.fillStyle = grd
  g.fillRect(x0, 0, TS, TS)

  // 겉뜨기의 V자: 다리 두 개와 빛 받는 줄
  const leg = (ax: number, ay: number, bx: number, by: number, color: string) => {
    g.strokeStyle = color
    g.lineWidth = 30
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(x0 + ax, ay)
    g.quadraticCurveTo(x0 + (ax + bx) / 2 + (bx > ax ? -6 : 6), (ay + by) / 2 + 10, x0 + bx, by)
    g.stroke()
  }
  const vee = (lean = 0) => {
    leg(22 + lean, 14, 64, 112, p.legDark)
    leg(106 + lean, 14, 64, 112, p.legLight)
    g.strokeStyle = p.shine
    g.lineWidth = 6
    g.beginPath()
    g.moveTo(x0 + 34 + lean, 24)
    g.lineTo(x0 + 58, 86)
    g.stroke()
  }

  if (sym === 'P') {
    // 안뜨기의 가로 혹 두 개
    for (const y of [34, 92]) {
      g.fillStyle = y < 60 ? p.purlTop : p.purlBottom
      g.beginPath()
      g.ellipse(x0 + 64, y, 52, 22, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = p.purlShine
      g.beginPath()
      g.ellipse(x0 + 58, y - 7, 30, 7, 0, 0, Math.PI * 2)
      g.fill()
    }
  } else if (sym === 'YO') {
    vee()
    g.fillStyle = p.hole
    g.beginPath()
    g.ellipse(x0 + 64, 64, 30, 34, 0, 0, Math.PI * 2)
    g.fill()
  } else if (sym === 'BO') {
    g.strokeStyle = p.legLight
    g.lineWidth = 22
    g.beginPath()
    g.ellipse(x0 + 64, 64, 50, 26, 0, 0, Math.PI * 2)
    g.stroke()
  } else {
    vee(sym === 'K2TOG' ? 12 : sym === 'SSK' ? -12 : 0)
    if (sym === 'K2TOG' || sym === 'SSK' || sym === 'SK2P') {
      // 겹친 코
      g.strokeStyle = p.cross
      g.lineWidth = 16
      g.beginPath()
      g.moveTo(x0 + (sym === 'SSK' ? 104 : 24), 20)
      g.lineTo(x0 + 64, 104)
      g.stroke()
    }
  }
}

/**
 * 코바늘 코 한 칸. 위쪽에 코 머리(V자로 누운 고리)가 있고 그 아래로 기둥이 내려옵니다.
 * 긴 코는 기둥에 실이 감긴 자국이 더 많습니다. 칸은 단 높이에 맞춰 늘어납니다.
 */
function drawCrochetTile(g: CanvasRenderingContext2D, sym: CrochetSymbolId, x0: number, p: Palette) {
  const grd = g.createLinearGradient(x0, 0, x0, TS)
  grd.addColorStop(0, p.bgTop)
  grd.addColorStop(1, p.bgBottom)
  g.fillStyle = grd
  g.fillRect(x0, 0, TS, TS)
  g.lineCap = 'round'

  const stroke = (color: string, width: number, pts: [number, number][]) => {
    g.strokeStyle = color
    g.lineWidth = width
    g.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x0 + x, y) : g.lineTo(x0 + x, y)))
    g.stroke()
  }
  const loop = (cx: number, cy: number, rx: number, ry: number, width: number) => {
    g.strokeStyle = p.legLight
    g.lineWidth = width
    g.beginPath()
    g.ellipse(x0 + cx, cy, rx, ry, 0, 0, Math.PI * 2)
    g.stroke()
    g.strokeStyle = p.shine
    g.lineWidth = Math.max(3, width / 4)
    g.beginPath()
    g.ellipse(x0 + cx, cy, rx, ry, 0, Math.PI * 1.15, Math.PI * 1.65)
    g.stroke()
  }
  /** 코 머리: 단 위쪽을 가로지르는 고리 */
  const head = () => {
    stroke(p.legDark, 30, [[6, 22], [122, 22]])
    stroke(p.legLight, 20, [[6, 20], [122, 20]])
    stroke(p.shine, 5, [[18, 14], [96, 14]])
  }
  /** 기둥: 머리 아래로 내려오는 V자 다리 둘. 긴 코는 실이 감긴 자국이 더 많습니다. */
  const post = (x: number, top: number, wraps: number, lean = 0) => {
    const half = 30
    stroke(p.legDark, 30, [[x - half + lean, top], [x, 116]])
    stroke(p.legLight, 30, [[x + half + lean, top], [x, 116]])
    stroke(p.shine, 5, [[x - half + lean + 8, top + 8], [x - 6, 100]])
    for (let i = 0; i < wraps; i++) {
      const y = top + ((116 - top) * (i + 1)) / (wraps + 1)
      stroke(p.cross, 10, [[x - 30, y + 8], [x + 30, y - 8]])
    }
  }

  if (sym === 'CH') {
    loop(64, 64, 46, 26, 22)
  } else if (sym === 'SL') {
    loop(64, 70, 44, 14, 18)
  } else if (sym === 'SC2' || sym === 'DC2') {
    // 두 기둥이 한 머리로 모입니다.
    head()
    stroke(p.legDark, 28, [[16, 116], [64, 46]])
    stroke(p.legLight, 28, [[112, 116], [64, 46]])
    if (sym === 'DC2') stroke(p.cross, 10, [[30, 86], [98, 74]])
  } else if (sym === 'CL') {
    head()
    g.fillStyle = p.legLight
    g.beginPath()
    g.ellipse(x0 + 64, 78, 40, 36, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = p.shine
    g.beginPath()
    g.ellipse(x0 + 52, 66, 14, 9, -0.5, 0, Math.PI * 2)
    g.fill()
  } else {
    head()
    post(64, 46, sym === 'HDC' ? 1 : sym === 'DC' ? 2 : sym === 'TR' ? 3 : 0)
  }
}

/** 실 색으로 실 질감 그림을 만듭니다. craft에 따라 대바늘 코나 코바늘 코를 그립니다. */
export function createYarnAtlas(yarn: RGB, maxAnisotropy: number, craft: Craft = 'knit'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = TS * ATLAS_TILES
  canvas.height = TS
  const g = canvas.getContext('2d')
  if (g) {
    const pal = paletteOf(yarn)
    g.fillStyle = pal.bgTop
    g.fillRect(0, 0, canvas.width, canvas.height)
    if (craft === 'crochet') CROCHET_SYMBOL_ORDER.forEach((sym, i) => drawCrochetTile(g, sym, i * TS, pal))
    else SYMBOL_ORDER.forEach((sym, i) => drawKnitTile(g, sym, i * TS, pal))
  }
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = Math.max(1, Math.min(8, maxAnisotropy))
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

/** 대바늘 실 질감 그림 */
export const createKnitAtlas = (yarn: RGB, maxAnisotropy: number): THREE.CanvasTexture => createYarnAtlas(yarn, maxAnisotropy, 'knit')

const LABEL_FONT = '700 12px "IBM Plex Sans KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'

export type LabelStyle = { background: string; color: string; border: string }

/** 이름표 그림. 화면에서의 크기(px)를 함께 돌려줍니다. */
export function createLabelTexture(text: string, style: LabelStyle): { texture: THREE.CanvasTexture; width: number; height: number } {
  const S = 3 // 또렷하게 보이도록 크게 그립니다
  const padX = 9
  const border = 2
  const height = 24
  const canvas = document.createElement('canvas')
  const g = canvas.getContext('2d')
  let width = 40
  if (g) {
    g.font = LABEL_FONT
    width = Math.ceil(g.measureText(text).width) + padX * 2 + border * 2
    canvas.width = width * S
    canvas.height = height * S
    g.scale(S, S)
    g.font = LABEL_FONT
    const r = height / 2
    g.beginPath()
    g.roundRect(border / 2, border / 2, width - border, height - border, r - border / 2)
    g.fillStyle = style.background
    g.fill()
    g.lineWidth = border
    g.strokeStyle = style.border
    g.stroke()
    g.fillStyle = style.color
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, width / 2, height / 2 + 0.5)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.generateMipmaps = false
  texture.minFilter = THREE.LinearFilter
  return { texture, width, height }
}
