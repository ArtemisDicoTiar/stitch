/**
 * 장면 하나를 2D 컨텍스트에 그립니다.
 * 같은 장면과 크기를 주면 언제나 같은 그리기 명령이 나옵니다.
 * 바깥 상태(시간, DOM)를 읽지 않으므로 Node에서 가짜 컨텍스트로 시험할 수 있습니다.
 */
import type {
  ArrowState,
  FabricGlyph,
  NeedleState,
  Pt,
  RingState,
  SceneState,
  TagState,
  ThumbState,
  TutorialColors,
  TutorialContext2D,
  TutorialSize,
  TutorialStyle,
  YarnColor,
} from './types'

/** 기준 그림 크기. 캔버스의 가로세로 비율로 쓰면 됩니다. */
export const STAGE: TutorialSize = { width: 720, height: 430 }

/** 그림 좌표에서 실제로 보여 주는 영역. 캔버스 크기에 맞춰 이 영역을 가운데에 꽉 채웁니다. */
const VIEW = { x: 140, y: 92, w: 500, h: 315 }

export const DEFAULT_COLORS: TutorialColors = {
  yarn: '#a4826b',
  yarnDark: '#6c5243',
  yarnLight: '#d7bba5',
  work: '#7f9fc6',
  workDark: '#4d6a91',
  workLight: '#c4d6ec',
  highlight: '#e8590c',
  background: '#fbf8f3',
  needleEdge: '#9c7840',
  needleShine: '#f0d39c',
  needleShade: '#a8844b',
  needleLine: '#7d5f30',
  tag: '#2a201b',
  tagText: '#fff',
  skin: '#efcdb2',
  skinLine: '#c99d7f',
  nail: '#f7e2d3',
}

export const DEFAULT_FONT_FAMILY = '"IBM Plex Sans KR","Noto Sans KR",sans-serif'

type Look = { c: TutorialColors; font: string }

function lookOf(style?: TutorialStyle): Look {
  return { c: { ...DEFAULT_COLORS, ...style?.colors }, font: style?.fontFamily ?? DEFAULT_FONT_FAMILY }
}

/** 점들을 지나는 부드러운 선(Catmull-Rom)의 경로를 만듭니다. prog만큼만 그립니다. */
function smoothPath(g: TutorialContext2D, pts: Pt[], prog = 1): void {
  if (pts.length < 2) return
  const seg: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    for (let s = 0; s <= 12; s++) {
      const t = s / 12
      const t2 = t * t
      const t3 = t2 * t
      seg.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  const n = Math.max(2, Math.round(seg.length * prog))
  g.beginPath()
  g.moveTo(seg[0].x, seg[0].y)
  for (let i = 1; i < n; i++) g.lineTo(seg[i].x, seg[i].y)
}

/** 실 한 가닥: 어두운 테두리, 바탕, 밝은 결을 겹쳐 그립니다. */
function strand(g: TutorialContext2D, L: Look, draw: () => void, col: YarnColor, a: number, w = 7): void {
  const dark = col === 'work' ? L.c.workDark : L.c.yarnDark
  const mid = col === 'work' ? L.c.work : L.c.yarn
  const light = col === 'work' ? L.c.workLight : L.c.yarnLight
  g.globalAlpha = a
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = dark
  g.lineWidth = w + 2.4
  draw()
  g.stroke()
  g.strokeStyle = mid
  g.lineWidth = w
  draw()
  g.stroke()
  g.strokeStyle = light
  g.lineWidth = 1.6
  g.globalAlpha = a * 0.8
  draw()
  g.stroke()
  g.globalAlpha = 1
}

function ringPts(r: RingState): Pt[] {
  const pts: Pt[] = []
  const c = Math.cos(r.rot)
  const s = Math.sin(r.rot)
  for (let i = 0; i < 48; i++) {
    const th = (i / 48) * Math.PI * 2
    const lx = r.rx * Math.cos(th)
    const ly = r.ry * Math.sin(th)
    pts.push({ x: r.x + lx * c - ly * s, y: r.y + lx * s + ly * c })
  }
  return pts
}

/** 고리의 반쪽. 앞쪽 가닥은 화면 오른쪽(바른 코)이고, 꼬인 코는 반대입니다. */
function ringHalf(g: TutorialContext2D, L: Look, r: RingState, front: boolean): void {
  const pts = ringPts(r)
  const side = (p: Pt): boolean => (p.x - r.x >= 0) !== r.tw > 0.5
  const keep = pts.map((p) => side(p) === front)
  const start = keep.findIndex((k, i) => k && !keep[(i + 47) % 48])
  if (start < 0) return
  const draw = (): void => {
    g.beginPath()
    let i = start
    let first = true
    while (keep[i % 48]) {
      const p = pts[i % 48]
      if (first) g.moveTo(p.x, p.y)
      else g.lineTo(p.x, p.y)
      first = false
      i++
      if (i - start > 48) break
    }
  }
  if (r.hl > 0.01) {
    g.globalAlpha = r.a * r.hl * 0.45
    g.strokeStyle = L.c.highlight
    g.lineWidth = 16
    g.lineCap = 'round'
    draw()
    g.stroke()
    g.globalAlpha = 1
  }
  strand(g, L, draw, r.col, r.a)
}

/** 편물 속의 코 하나 */
function vStitch(g: TutorialContext2D, L: Look, x: number, y: number, type: FabricGlyph, a: number, col: YarnColor, hl: number): void {
  const draw1 = (): void => {
    g.beginPath()
    g.moveTo(x - 9, y - 9)
    g.quadraticCurveTo(x - 3, y + 2, x, y + 9)
  }
  const draw2 = (): void => {
    g.beginPath()
    g.moveTo(x + 9, y - 9)
    g.quadraticCurveTo(x + 3, y + 2, x, y + 9)
  }
  if (hl > 0.01) {
    g.globalAlpha = a * hl * 0.4
    g.fillStyle = L.c.highlight
    g.beginPath()
    g.arc(x, y, 15, 0, 7)
    g.fill()
    g.globalAlpha = 1
  }
  if (type === 'P') {
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.ellipse(x, y, 11, 6, 0, Math.PI, 0)
      },
      col,
      a,
      6,
    )
    return
  }
  strand(g, L, draw1, col, a, 6)
  strand(g, L, draw2, col, a, 6)
  if (type === 'K2' || type === 'S2' || type === 'S3') {
    const dir = type === 'K2' ? 1 : -1
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.moveTo(x - 9 * dir, y - 12)
        g.lineTo(x + 6 * dir, y + 4)
      },
      col,
      a,
      5,
    )
  }
  if (type === 'S3') {
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.moveTo(x, y - 13)
        g.lineTo(x, y + 4)
      },
      col,
      a,
      5,
    )
  }
  if (type === 'T') {
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.moveTo(x - 9, y + 2)
        g.lineTo(x + 9, y - 6)
      },
      col,
      a,
      4,
    )
  }
}

function needle(g: TutorialContext2D, L: Look, p: NeedleState, a: number): void {
  const dx = p.tx - p.bx
  const dy = p.ty - p.by
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const w = 6.5
  const tl = 34
  const ex = p.tx - ux * tl
  const ey = p.ty - uy * tl
  g.globalAlpha = a
  const grd = g.createLinearGradient(p.bx + nx * w, p.by + ny * w, p.bx - nx * w, p.by - ny * w)
  grd.addColorStop(0, L.c.needleEdge)
  grd.addColorStop(0.45, L.c.needleShine)
  grd.addColorStop(1, L.c.needleShade)
  g.fillStyle = grd
  g.strokeStyle = L.c.needleLine
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(p.bx + nx * w, p.by + ny * w)
  g.lineTo(ex + nx * w, ey + ny * w)
  g.quadraticCurveTo(p.tx + nx * 1.5 - ux * 6, p.ty + ny * 1.5 - uy * 6, p.tx, p.ty)
  g.quadraticCurveTo(p.tx - nx * 1.5 - ux * 6, p.ty - ny * 1.5 - uy * 6, ex - nx * w, ey - ny * w)
  g.lineTo(p.bx - nx * w, p.by - ny * w)
  g.closePath()
  g.fill()
  g.stroke()
  g.globalAlpha = 1
}

function arrow(g: TutorialContext2D, L: Look, ar: ArrowState): void {
  const [p0, c, p1] = ar.pts
  g.globalAlpha = ar.a
  g.strokeStyle = L.c.highlight
  g.fillStyle = L.c.highlight
  g.lineWidth = 3
  g.setLineDash([7, 5])
  g.beginPath()
  g.moveTo(p0.x, p0.y)
  g.quadraticCurveTo(c.x, c.y, p1.x, p1.y)
  g.stroke()
  g.setLineDash([])
  const ang = Math.atan2(p1.y - c.y, p1.x - c.x)
  g.beginPath()
  g.moveTo(p1.x, p1.y)
  g.lineTo(p1.x - 13 * Math.cos(ang - 0.45), p1.y - 13 * Math.sin(ang - 0.45))
  g.lineTo(p1.x - 13 * Math.cos(ang + 0.45), p1.y - 13 * Math.sin(ang + 0.45))
  g.closePath()
  g.fill()
  if (ar.t) {
    g.font = `700 14px ${L.font}`
    g.textAlign = 'center'
    g.lineWidth = 4
    g.strokeStyle = L.c.background
    g.strokeText(ar.t, c.x, c.y - 6)
    g.fillText(ar.t, c.x, c.y - 6)
  }
  g.globalAlpha = 1
}

function tag(g: TutorialContext2D, L: Look, t: TagState): void {
  if (t.a < 0.02) return
  g.globalAlpha = t.a
  g.font = `700 14px ${L.font}`
  const w = g.measureText(t.text).width + 22
  g.fillStyle = L.c.tag
  g.beginPath()
  g.roundRect(t.x - w / 2, t.y - 15, w, 30, 15)
  g.fill()
  g.fillStyle = L.c.tagText
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(t.text, t.x, t.y + 1)
  g.textBaseline = 'alphabetic'
  g.globalAlpha = 1
}

function thumb(g: TutorialContext2D, L: Look, t: ThumbState): void {
  g.globalAlpha = t.a
  g.save()
  g.translate(t.x, t.y)
  g.rotate(t.rot || 0)
  g.fillStyle = L.c.skin
  g.strokeStyle = L.c.skinLine
  g.lineWidth = 2
  g.beginPath()
  g.roundRect(-22, -70, 44, 120, 22)
  g.fill()
  g.stroke()
  g.fillStyle = L.c.nail
  g.beginPath()
  g.roundRect(-13, -62, 26, 30, 11)
  g.fill()
  g.stroke()
  g.restore()
  g.globalAlpha = 1
}

function paint(g: TutorialContext2D, L: Look, S: SceneState): void {
  const rings = Object.values(S.rings)
  // 편물: 고리마다 다리와 그 아래 코들
  for (const r of rings) {
    const va = Math.min(r.a, 1) * r.vb
    if (va < 0.02) continue
    const bx = r.x
    const bottom = Math.abs(r.ry) + 2
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.moveTo(bx - 4, r.y + bottom - 4)
        g.lineTo(bx - 6, r.y + bottom + 10)
      },
      r.col,
      va,
      5,
    )
    strand(
      g,
      L,
      () => {
        g.beginPath()
        g.moveTo(bx + 4, r.y + bottom - 4)
        g.lineTo(bx + 6, r.y + bottom + 10)
      },
      r.col,
      va,
      5,
    )
    vStitch(g, L, bx, r.y + bottom + 22, r.vt, va, 'yarn', r.vt === 'K' ? 0 : r.hl)
    vStitch(g, L, bx, r.y + bottom + 46, 'K', va * 0.6, 'yarn', 0)
  }
  for (const m of Object.values(S.marks)) {
    if (!(m.a > 0.02)) continue
    if (m.kind === 'bar') {
      strand(
        g,
        L,
        () => {
          g.beginPath()
          g.moveTo(m.x - 16, m.y)
          g.quadraticCurveTo(m.x, m.y + 6, m.x + 16, m.y)
        },
        m.col,
        m.a,
        6,
      )
    }
    if (m.kind === 'chain') {
      strand(
        g,
        L,
        () => {
          g.beginPath()
          g.ellipse(m.x, m.y, 12, 6, 0, 0, 7)
        },
        m.col,
        m.a,
        5,
      )
    }
  }
  // 바늘 뒤: 꿰인 고리의 뒤쪽 가닥과 뒤에 있는 실
  for (const r of rings) if (r.a > 0.02 && r.thru) ringHalf(g, L, r, false)
  for (const y of Object.values(S.yarn)) if (y.z === 'b' && y.a > 0.02) strand(g, L, () => smoothPath(g, y.pts, y.prog), y.col, y.a)
  const ns = Object.values(S.needles).sort((a, b) => a.z - b.z)
  for (const n of ns) needle(g, L, n, n.a ?? 1)
  // 바늘 앞: 고리의 앞쪽 가닥과 앞에 있는 실
  for (const r of rings) {
    if (!(r.a > 0.02)) continue
    if (r.thru) ringHalf(g, L, r, true)
    else {
      ringHalf(g, L, r, true)
      ringHalf(g, L, r, false)
    }
  }
  for (const y of Object.values(S.yarn)) if (y.z === 'f' && y.a > 0.02) strand(g, L, () => smoothPath(g, y.pts, y.prog), y.col, y.a)
  if (S.thumb && S.thumb.a > 0.02) thumb(g, L, S.thumb)
  for (const r of rings) {
    if (r.lab && r.a > 0.3) {
      g.font = `700 13px ${L.font}`
      g.textAlign = 'center'
      g.fillStyle = L.c.highlight
      g.fillText(r.lab, r.x, r.y - r.ry - 8)
    }
  }
  for (const a of Object.values(S.arrows)) if (a.a > 0.02) arrow(g, L, a)
  for (const t of Object.values(S.tags)) tag(g, L, t)
}

/**
 * 장면 하나를 그립니다. size는 CSS 픽셀 기준의 그림 크기이고,
 * devicePixelRatio는 부르는 쪽이 컨텍스트 변환으로 미리 걸어 둡니다.
 */
export function drawScene(g: TutorialContext2D, S: SceneState, size: TutorialSize = STAGE, style?: TutorialStyle): void {
  const L = lookOf(style)
  const W = size.width
  const H = size.height
  g.clearRect(0, 0, W, H)
  g.fillStyle = L.c.background
  g.fillRect(0, 0, W, H)
  const k = Math.min(W / VIEW.w, H / VIEW.h)
  g.save()
  g.translate((W - VIEW.w * k) / 2, (H - VIEW.h * k) / 2)
  g.scale(k, k)
  g.translate(-VIEW.x, -VIEW.y)
  try {
    paint(g, L, S)
  } finally {
    g.restore()
  }
}
