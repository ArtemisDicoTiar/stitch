/**
 * 장면을 좌표로 풀고(resolve) 두 장면 사이를 잇습니다(tween).
 * 캔버스나 DOM을 쓰지 않는 순수한 계산입니다.
 */
import type {
  ArrowState,
  MarkState,
  NeedlePose,
  NeedleState,
  PointSpec,
  Pt,
  RingState,
  SceneSpec,
  SceneState,
  TagState,
  YarnState,
} from './types'

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** 바늘 끝에서 d만큼 들어온 점과 바늘 방향 */
export function npt(p: NeedlePose, d: number): { x: number; y: number; ux: number; uy: number } {
  const dx = p.bx - p.tx
  const dy = p.by - p.ty
  const L = Math.hypot(dx, dy)
  return { x: p.tx + (dx / L) * d, y: p.ty + (dy / L) * d, ux: dx / L, uy: dy / L }
}

/** 바늘에 수직이고 아래를 향하는 방향 */
function normal(ux: number, uy: number): { nx: number; ny: number } {
  let nx = -uy
  let ny = ux
  if (ny < 0) {
    nx = -nx
    ny = -ny
  }
  return { nx, ny }
}

function resolvePoint(q: PointSpec, needles: Record<string, NeedlePose>, rings: Record<string, RingState>): Pt {
  if (Array.isArray(q)) return { x: q[0], y: q[1] }
  if ('ring' in q) {
    const r: RingState | undefined = rings[q.ring]
    if (!r) return { x: 0, y: 0 }
    return { x: r.x + (q.off ? q.off[0] : 0), y: r.y + r.ry * (q.at === 'top' ? -1 : 1) + (q.off ? q.off[1] : 0) }
  }
  const pose: NeedlePose | undefined = needles[q.n]
  if (!pose) return { x: 0, y: 0 }
  const p = npt(pose, q.d)
  return { x: p.x + (q.off ? q.off[0] : 0), y: p.y + (q.off ? q.off[1] : 0) }
}

/** 적는 꼴 → 그리는 꼴. 넘겨받은 장면은 바꾸지 않습니다. */
export function resolve(s: SceneSpec): SceneState {
  const out: SceneState = { needles: {}, rings: {}, yarn: {}, arrows: {}, tags: {}, thumb: null, marks: {} }
  for (const k in s.needles) out.needles[k] = { ...s.needles[k], a: 1 }
  for (const id in s.rings) {
    const r = s.rings[id]
    let x: number
    let y: number
    let rot: number
    const rx = r.rx || 10
    const ry = r.ry || 22
    const pose: NeedlePose | undefined = r.on ? s.needles[r.on] : undefined
    if (pose) {
      const p = npt(pose, r.d ?? 0)
      const n = normal(p.ux, p.uy)
      x = p.x + n.nx * 8
      y = p.y + n.ny * 8
      rot = Math.atan2(p.uy, p.ux)
    } else {
      x = r.x ?? 0
      y = r.y ?? 0
      rot = r.rot || 0
    }
    out.rings[id] = {
      x,
      y,
      rot,
      rx,
      ry,
      a: r.a ?? 1,
      hl: r.hl || 0,
      tw: r.tw || 0,
      col: r.col || 'yarn',
      vb: r.vb ?? 1,
      vt: r.vt || 'K',
      thru: r.thru || r.on || '',
      lab: r.lab || '',
    }
  }
  const at = (q: PointSpec): Pt => resolvePoint(q, s.needles, out.rings)
  for (const y of s.yarn || []) out.yarn[y.id] = { pts: y.pts.map(at), z: y.z || 'b', a: y.a ?? 1, prog: 1, col: y.col || 'work' }
  for (const a of s.arrows || []) out.arrows[a.id] = { pts: a.pts.map(at), a: 1, t: a.t || '' }
  for (const t of s.tags || []) {
    const p = at(t.at)
    out.tags[t.id] = { x: p.x, y: p.y, text: t.text, a: 1 }
  }
  for (const m of s.marks || []) {
    const p = at(m.at)
    out.marks[m.id] = { x: p.x, y: p.y, kind: m.kind, a: 1, col: m.col || 'yarn' }
  }
  if (s.thumb) out.thumb = { ...s.thumb, a: 1 }
  return out
}

// ---------- 보간 ----------

/**
 * 양쪽에 다 있는 것은 fn으로 섞고, 새로 생기는 것은 서서히 나타나게,
 * 없어지는 것은 서서히 사라지게 합니다.
 */
function mixMap<T extends { a: number }>(
  A: Record<string, T>,
  B: Record<string, T>,
  t: number,
  fn: (a: T, b: T, t: number) => T,
  appear?: (v: T, t: number, incoming: boolean) => T,
): Record<string, T> {
  const o: Record<string, T> = {}
  const keys = new Set([...Object.keys(A || {}), ...Object.keys(B || {})])
  for (const k of keys) {
    const a: T | undefined = A && A[k]
    const b: T | undefined = B && B[k]
    if (a && b) o[k] = fn(a, b, t)
    else if (b) o[k] = appear ? appear(b, t, true) : { ...b, a: b.a * t }
    else if (a) o[k] = appear ? appear(a, t, false) : { ...a, a: a.a * (1 - t) }
  }
  return o
}

/** 숫자는 사이값으로, 숫자가 아닌 값은 절반을 지날 때 바꿉니다. */
function num<T extends object>(a: T, b: T, t: number): T {
  const A = a as Record<string, unknown>
  const B = b as Record<string, unknown>
  const o: Record<string, unknown> = { ...B }
  for (const k in A) {
    const av = A[k]
    const bv = B[k]
    if (typeof av === 'number' && typeof bv === 'number') o[k] = lerp(av, bv, t)
  }
  if (t < 0.5) for (const k in A) if (typeof A[k] !== 'number') o[k] = A[k]
  return o as T
}

function mixRot(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

const mixPts = (a: Pt[], b: Pt[], t: number): Pt[] => a.map((p, i) => ({ x: lerp(p.x, b[i].x, t), y: lerp(p.y, b[i].y, t) }))

/** A에서 B로 가는 길의 t(0~1) 지점. 속도 곡선(ease)은 여기서 입힙니다. */
export function tween(A: SceneState, B: SceneState, t: number): SceneState {
  const e = ease(t)
  return {
    needles: mixMap<NeedleState>(A.needles, B.needles, e, num),
    rings: mixMap<RingState>(A.rings, B.rings, e, (a, b, t) => {
      const o = num(a, b, t)
      o.rot = mixRot(a.rot, b.rot, t)
      return o
    }),
    yarn: mixMap<YarnState>(
      A.yarn,
      B.yarn,
      e,
      (a, b, t) => {
        if (a.pts.length !== b.pts.length) return t < 0.5 ? { ...a, a: a.a * (1 - 2 * t) } : { ...b, a: b.a * (2 * t - 1) }
        return { ...num(a, b, t), pts: mixPts(a.pts, b.pts, t) }
      },
      // 새 실은 처음부터 끝까지 그려 나가고, 없어지는 실은 흐려집니다.
      (y, t, incoming) => (incoming ? { ...y, prog: t } : { ...y, a: y.a * (1 - t) }),
    ),
    arrows: mixMap<ArrowState>(A.arrows, B.arrows, e, (a, b, t) => ({ ...b, pts: mixPts(a.pts, b.pts, t) })),
    tags: mixMap<TagState>(A.tags, B.tags, e, (a, b, t) => (t < 0.5 ? { ...a, a: 1 - t * 2 } : { ...b, a: t * 2 - 1 })),
    marks: mixMap<MarkState>(A.marks, B.marks, e, num),
    thumb: A.thumb && B.thumb ? num(A.thumb, B.thumb, e) : B.thumb ? { ...B.thumb, a: e } : A.thumb ? { ...A.thumb, a: 1 - e } : null,
  }
}
