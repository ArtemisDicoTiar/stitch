/**
 * 기호 10가지의 뜨는 법.
 * 단계마다 앞 단계의 장면을 복사해 달라진 것만 고쳐 적습니다.
 * 좌표는 720×430 그림 기준입니다.
 */
import type { SymbolId } from '@stitch/pattern-ir'
import { npt } from './scene'
import type { Layer, NeedlePose, SceneSpec, TagSpec, Tutorial, TutorialStep } from './types'

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T

const P = (tx: number, ty: number, bx: number, by: number, z: number): NeedlePose => ({ tx, ty, bx, by, z })

/** 자주 쓰는 바늘 자세 */
const NP = {
  L: P(330, 185, 30, 205, 1),
  Lfar: P(300, 186, 0, 206, 1),
  Rrest: P(410, 204, 705, 250, 2),
  RknitIn: P(286, 177, 690, 262, 0),
  RknitIn2: P(252, 172, 690, 262, 0),
  RpurlIn: P(286, 199, 690, 236, 2),
  RpullK: P(330, 214, 705, 258, 2),
  RpullP: P(330, 220, 705, 262, 0),
}

/** 실타래 쪽 (그림 밖 오른쪽 아래) */
const ball: [number, number] = [700, 440]

/** 손이 따로 할 일이 없는 단계에 적는 말 */
const SAME = '그대로'

/** 왼쪽 바늘에 nL코, 오른쪽 바늘에 2코가 걸린 기본 장면 */
function base(o: { nL?: number; front?: boolean } = {}): SceneSpec {
  const s: SceneSpec = { needles: { L: NP.L, R: NP.Rrest }, rings: {}, yarn: [], arrows: [], tags: [], marks: [] }
  const nL = o.nL ?? 5
  for (let i = 0; i < nL; i++) s.rings['L' + (i + 1)] = { on: 'L', d: 24 + 34 * i }
  s.rings.R1 = { on: 'R', d: 112 }
  s.rings.R2 = { on: 'R', d: 142 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'R1' }, [470, 330], ball], z: o.front ? 'f' : 'b' }]
  return s
}

const hands = (L: string, R: string): TagSpec[] => [
  { id: 'hL', at: [110, 70], text: '왼손 · ' + L },
  { id: 'hR', at: [560, 70], text: '오른손 · ' + R },
]

/** 왼쪽 바늘의 코를 n코만큼 바늘 끝으로 당깁니다. */
function shiftL(s: SceneSpec, n: number): void {
  for (const k in s.rings) {
    const r = s.rings[k]
    if (r.on === 'L') r.d = (r.d ?? 0) - 34 * n
  }
}

/** 바늘을 옮기되, 걸린 코는 제자리에 있도록 바늘 위의 거리를 고칩니다. */
function moveNeedle(s: SceneSpec, n: string, pose: NeedlePose, except: string[] = []): void {
  const o = s.needles[n]
  const dx = pose.tx - o.tx
  const dy = pose.ty - o.ty
  const u = npt(pose, 1)
  for (const k in s.rings) {
    const r = s.rings[k]
    if (r.on === n && !except.includes(k)) r.d = Math.max(4, (r.d ?? 0) - (dx * u.ux + dy * u.uy))
  }
  s.needles[n] = pose
}

function yarnTo(s: SceneSpec, ringId: string, z: Layer = 'b'): void {
  s.yarn = [{ id: 'y1', pts: [{ ring: ringId }, [470, 330], ball], z }]
}

/** 오른쪽 바늘 끝에 실을 감은 모습. k는 겉뜨기(뒤에서), p는 안뜨기(앞에서). */
function wrap(s: SceneSpec, dir: 'k' | 'p'): void {
  const k = dir === 'k'
  s.yarn = [
    { id: 'y1', pts: [{ ring: 'R1' }, { n: 'R', d: 40, off: [6, 34] }, { n: 'R', d: 12, off: [10, -15] }], z: k ? 'b' : 'f' },
    { id: 'y2', pts: [{ n: 'R', d: 12, off: [10, -15] }, { n: 'R', d: 3, off: [-6, -9] }, { n: 'R', d: 4, off: [-6, 10] }, { n: 'R', d: 16, off: [2, 20] }], z: k ? 'f' : 'b' },
    { id: 'y3', pts: [{ n: 'R', d: 16, off: [2, 20] }, [430, 330], ball], z: k ? 'b' : 'f' },
  ]
}

/**
 * 장면을 한 단계로 굳힙니다.
 * 손이 할 일(hL, hR)은 그림에 그리지 않고 글로 따로 보여 주므로 장면에서 빼냅니다.
 */
function st(s: SceneSpec, text: string): TutorialStep {
  const c = clone(s)
  const h: { L?: string; R?: string } = {}
  for (const t of c.tags || []) {
    if (t.id === 'hL' || t.id === 'hR') {
      h[t.id === 'hL' ? 'L' : 'R'] = t.text.replace(/^(왼손|오른손)( 엄지)? · /, (_m: string, _a: string, b: string | undefined) => (b ? '엄지 · ' : ''))
    }
  }
  c.tags = (c.tags || []).filter((t) => t.id !== 'hL' && t.id !== 'hR')
  return { text, left: h.L || SAME, right: h.R || SAME, scene: c }
}

function tut(id: SymbolId, title: string, summary: string, steps: TutorialStep[]): Tutorial {
  return { id, title, label: title.split(' (')[0], summary, steps }
}

// ===== 겉뜨기 =====
function knit(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  s.rings.L1.hl = 1
  s.tags = hands('코가 걸린 바늘 잡기', '빈 바늘과 실 잡기')
  s.tags.push({ id: 'yb', at: [560, 330], text: '실은 바늘 뒤에' })
  L.push(st(s, '왼쪽 바늘의 첫 코(주황색)를 뜰 거예요. 실은 바늘 뒤쪽에 둡니다.'))

  s = clone(s)
  s.needles.R = NP.RknitIn
  s.rings.L1.thru = 'LR'
  s.tags = hands('그대로 고정', '앞에서 뒤로 찔러 넣기')
  s.arrows = [{ id: 'a', pts: [[400, 250], [330, 250], [272, 176]], t: '앞 → 뒤' }]
  L.push(st(s, '오른쪽 바늘 끝을 첫 코의 앞쪽에서 넣어, 왼쪽 바늘 뒤로 X자가 되게 통과시켜요.'))

  s = clone(s)
  wrap(s, 'k')
  s.arrows = [{ id: 'a', pts: [[300, 140], [250, 140], [252, 190]], t: '반시계 방향' }]
  s.tags = hands('X자 유지', '검지로 실을 감기')
  L.push(st(s, '오른손 검지로 실을 오른쪽 바늘에 아래에서 위로, 반시계 방향으로 한 번 감아요.'))

  s = clone(s)
  s.needles.R = NP.RpullK
  s.rings.L1.thru = 'L'
  s.rings.N = { on: 'R', d: 14, col: 'work', hl: 1, vb: 0 }
  yarnTo(s, 'N')
  s.arrows = [{ id: 'a', pts: [[262, 178], [280, 220], [334, 214]], t: '앞으로 빼기' }]
  s.tags = hands('그대로 고정', '감은 실을 코 사이로 빼내기')
  L.push(st(s, '감은 실을 걸친 채 오른쪽 바늘을 원래 들어온 길로 빼내면, 새 코가 오른쪽 바늘에 생겨요.'))

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.L1 = { x: 352, y: 192, a: 0, rot: 3.1 }
  s.rings.N = { on: 'R', d: 82, col: 'work', hl: 1, vb: 1 }
  shiftL(s, 1)
  yarnTo(s, 'N')
  s.arrows = [{ id: 'a', pts: [[322, 160], [345, 150], [360, 175]], t: '빼기' }]
  s.tags = hands('바늘 끝으로 원래 코 밀어 빼기', '새 코 유지')
  L.push(st(s, '왼쪽 바늘에서 원래 코를 빼면 겉뜨기 1코 완성! 빠진 코는 새 코 아래의 v자가 돼요.'))

  return tut('K', '겉뜨기', '겉면 단에서 v 모양이 되는 가장 기본 코. 실을 뒤에 두고 앞에서 뒤로 찔러 떠요.', L)
}

// ===== 안뜨기 =====
function purl(): Tutorial {
  const L: TutorialStep[] = []
  let s = base({ front: true })
  s.rings.L1.hl = 1
  s.tags = hands('코가 걸린 바늘 잡기', '빈 바늘과 실 잡기')
  s.tags.push({ id: 'yb', at: [560, 330], text: '실은 바늘 앞에' })
  L.push(st(s, '이번에는 실을 바늘 앞쪽(나를 향한 쪽)에 둡니다.'))

  s = clone(s)
  s.needles.R = NP.RpurlIn
  s.rings.L1.thru = 'LR'
  s.tags = hands('그대로 고정', '오른쪽에서 왼쪽으로 넣기')
  s.arrows = [{ id: 'a', pts: [[420, 245], [340, 245], [272, 200]], t: '오른쪽 → 왼쪽' }]
  L.push(st(s, '오른쪽 바늘을 첫 코에 오른쪽에서 왼쪽으로, 왼쪽 바늘 앞쪽으로 넣어요.'))

  s = clone(s)
  wrap(s, 'p')
  s.arrows = [{ id: 'a', pts: [[300, 168], [240, 160], [250, 215]], t: '반시계 방향' }]
  s.tags = hands('그대로 고정', '실을 위에서 앞→아래로 감기')
  L.push(st(s, '실을 오른쪽 바늘 위로 넘겨 반시계 방향으로 감아요.'))

  s = clone(s)
  s.needles.R = NP.RpullP
  s.rings.L1.thru = 'L'
  s.rings.N = { on: 'R', d: 14, col: 'work', hl: 1, vb: 0 }
  yarnTo(s, 'N', 'f')
  s.arrows = [{ id: 'a', pts: [[262, 200], [285, 240], [336, 222]], t: '뒤로 빼기' }]
  s.tags = hands('그대로 고정', '코 뒤쪽으로 빼내기')
  L.push(st(s, '감은 실을 코 안으로 밀어 뒤쪽으로 빼내요.'))

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.L1 = { x: 352, y: 192, a: 0, rot: 3.1 }
  s.rings.N = { on: 'R', d: 82, col: 'work', hl: 1, vb: 1, vt: 'P' }
  shiftL(s, 1)
  yarnTo(s, 'N', 'f')
  s.arrows = []
  s.tags = hands('원래 코 빼기', '새 코 유지')
  L.push(st(s, '원래 코를 빼면 안뜨기 완성! 겉면에서 보면 가로로 볼록한 - 모양이에요.'))

  return tut('P', '안뜨기', '겉면에서 - 모양이 되는 코. 실을 앞에 두고 오른쪽에서 왼쪽으로 찔러 떠요.', L)
}

// ===== 바늘비우기 =====
function yarnOver(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  s.tags = hands('그대로', '실 잡기')
  L.push(st(s, '겉뜨기를 막 끝낸 상태예요. 실은 뒤쪽에 있어요.'))

  s = clone(s)
  s.yarn = [{ id: 'y1', pts: [{ ring: 'R1' }, [385, 236], [380, 330]], z: 'f' }]
  s.arrows = [{ id: 'a', pts: [[430, 330], [400, 270], [384, 300]], t: '바늘 사이로 앞으로' }]
  s.tags = hands('그대로', '실을 바늘 사이로 앞으로')
  L.push(st(s, '실을 두 바늘 사이로 빼서 앞쪽으로 가져와요.'))

  s = clone(s)
  s.rings.Y = { on: 'R', d: 70, col: 'work', hl: 1, vb: 0 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'Y' }, [470, 330], ball], z: 'b' }]
  s.arrows = [{ id: 'a', pts: [[470, 250], [480, 165], [520, 200]], t: '앞 → 위 → 뒤' }]
  s.tags = hands('그대로', '실을 오른쪽 바늘 위로 넘기기')
  L.push(st(s, '앞에 있는 실을 오른쪽 바늘 위로 넘겨 다시 뒤로 보내면, 바늘에 실이 한 번 걸려요. 이것이 바늘비우기예요.'))

  s = clone(s)
  s.arrows = []
  s.tags = [{ id: 'n', at: [520, 150], text: '다음 2코는 k2tog' }]
  L.push(st(s, '이어서 다음 2코를 k2tog로 뜨면 코 수는 그대로이고, 다음 단에서 이 자리에 구멍(단춧구멍)이 생겨요.'))

  return tut('YO', '바늘비우기', '단춧구멍을 만드는 코. 실을 오른쪽 바늘에 한 번 걸어 새 코를 하나 만들어요.', L)
}

// ===== k2tog =====
function k2tog(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  s.rings.L1.hl = 1
  s.rings.L2.hl = 1
  s.rings.L1.lab = '1'
  s.rings.L2.lab = '2'
  s.tags = hands('코가 걸린 바늘', '빈 바늘과 실')
  L.push(st(s, '왼쪽 바늘의 앞 2코를 한 번에 겉뜨기로 떠요.'))

  s = clone(s)
  s.needles.R = NP.RknitIn2
  s.rings.L1.thru = 'LR'
  s.rings.L2.thru = 'LR'
  s.tags = hands('그대로 고정', '2번째 코부터 2코에 함께 넣기')
  s.arrows = [{ id: 'a', pts: [[400, 255], [320, 255], [240, 174]], t: '2코 한 번에' }]
  L.push(st(s, '오른쪽 바늘을 두 번째 코, 첫 번째 코 순서로 2코에 한꺼번에 겉뜨기 방향으로 넣어요.'))

  s = clone(s)
  wrap(s, 'k')
  s.arrows = []
  s.tags = hands('그대로', '실 감기')
  L.push(st(s, '겉뜨기처럼 실을 반시계 방향으로 감아요.'))

  s = clone(s)
  s.needles.R = NP.RpullK
  s.rings.L1.thru = 'L'
  s.rings.L2.thru = 'L'
  s.rings.N = { on: 'R', d: 14, col: 'work', hl: 1, vb: 0 }
  yarnTo(s, 'N')
  s.tags = hands('그대로', '2코 사이로 빼내기')
  L.push(st(s, '감은 실을 2코 사이로 함께 빼내요.'))

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.L1 = { x: 352, y: 192, a: 0, rot: 3.1 }
  s.rings.L2 = { x: 345, y: 195, a: 0, rot: 3.1 }
  s.rings.N = { on: 'R', d: 82, col: 'work', hl: 1, vb: 1, vt: 'K2' }
  shiftL(s, 2)
  yarnTo(s, 'N')
  s.tags = hands('2코를 함께 빼기', '새 코 유지')
  L.push(st(s, '2코를 함께 빼면 1코가 줄어요. 줄인 코는 오른쪽으로 기울어요.'))

  return tut('K2TOG', 'k2tog (왼코 겹치기)', '2코를 한 번에 겉뜨기. 1코가 줄고 오른쪽으로 기울어요.', L)
}

// ===== ssk =====
function ssk(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  s.rings.L1.hl = 1
  s.rings.L2.hl = 1
  s.rings.L1.lab = '1'
  s.rings.L2.lab = '2'
  s.tags = hands('코가 걸린 바늘', '빈 바늘')
  L.push(st(s, '앞 2코를 하나씩 옮긴 뒤 함께 떠서 줄여요.'))

  s = clone(s)
  s.rings.L1 = { on: 'R', d: 82, hl: 1, tw: 1, lab: '1', vb: 0 }
  shiftL(s, 1)
  s.rings.L2.d = 26
  s.arrows = [{ id: 'a', pts: [[312, 160], [360, 130], [470, 190]], t: '겉뜨기 방향으로 옮기기' }]
  s.tags = hands('그대로', '첫 코를 거르기')
  L.push(st(s, '첫 코에 겉뜨기하듯 바늘을 넣어 뜨지 않고 오른쪽 바늘로 옮겨요. 코가 살짝 돌아가요.'))

  s = clone(s)
  s.rings.L2 = { on: 'R', d: 56, hl: 1, tw: 1, lab: '2', vb: 0 }
  shiftL(s, 1)
  s.arrows = [{ id: 'a', pts: [[312, 160], [360, 130], [440, 190]], t: '하나 더' }]
  s.tags = hands('그대로', '두 번째 코도 거르기')
  L.push(st(s, '두 번째 코도 같은 방법으로 옮겨요.'))

  s = clone(s)
  moveNeedle(s, 'L', P(500, 204, 200, 226, 3))
  s.rings.L1.thru = 'RL'
  s.rings.L2.thru = 'RL'
  s.arrows = [{ id: 'a', pts: [[330, 150], [420, 130], [495, 195]], t: '왼쪽부터 앞쪽에' }]
  s.tags = hands('두 코 앞쪽에 넣기', '그대로')
  L.push(st(s, '왼쪽 바늘 끝을 옮긴 2코의 앞쪽에 왼쪽부터 넣어요.'))

  s = clone(s)
  moveNeedle(s, 'L', NP.L)
  s.rings.L1 = { x: 480, y: 210, a: 0, rot: 0 }
  s.rings.L2 = { x: 450, y: 205, a: 0, rot: 0 }
  s.rings.N = { on: 'R', d: 70, col: 'work', hl: 1, vb: 1, vt: 'S2' }
  yarnTo(s, 'N')
  s.arrows = []
  s.tags = hands('바늘 빼기', '실 감아 함께 뜨기')
  L.push(st(s, '그 상태로 실을 감아 2코를 뒤쪽으로 함께 떠요. 줄인 코는 왼쪽으로 기울어요.'))

  return tut('SSK', 'ssk (오른코 겹치기)', '2코를 하나씩 옮긴 뒤 함께 떠요. 1코가 줄고 왼쪽으로 기울어요.', L)
}

// ===== 겉안겉 3코 모아뜨기 =====
function sk2p(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  ;['L1', 'L2', 'L3'].forEach((k, i) => {
    s.rings[k].hl = 1
    s.rings[k].lab = ['겉', '안', '겉'][i]
  })
  s.tags = hands('코가 걸린 바늘', '빈 바늘')
  L.push(st(s, '겉·안·겉 3코를 1코로 모아요. 2코가 줄어들어요.'))

  s = clone(s)
  s.rings.L1 = { on: 'R', d: 82, hl: 1, tw: 1, lab: '겉', vb: 0 }
  shiftL(s, 1)
  s.arrows = [{ id: 'a', pts: [[312, 160], [360, 130], [470, 190]], t: '첫 코 거르기' }]
  s.tags = hands('그대로', '겉뜨기 방향으로 거르기')
  L.push(st(s, '첫 코를 겉뜨기 방향으로 걸러 오른쪽 바늘로 옮겨요.'))

  s = clone(s)
  s.needles.R = NP.RknitIn2
  s.rings.L2.thru = 'LR'
  s.rings.L3.thru = 'LR'
  s.rings.L1.d = 160
  s.tags = hands('그대로', '다음 2코에 함께 넣기')
  s.arrows = [{ id: 'a', pts: [[400, 255], [320, 255], [240, 174]], t: 'k2tog' }]
  L.push(st(s, '다음 2코(안·겉)에 k2tog처럼 한 번에 바늘을 넣어요.'))

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.L2 = { x: 352, y: 192, a: 0, rot: 3.1 }
  s.rings.L3 = { x: 345, y: 195, a: 0, rot: 3.1 }
  shiftL(s, 2)
  s.rings.N = { on: 'R', d: 60, col: 'work', hl: 1, vb: 1, vt: 'K2' }
  s.rings.L1.d = 90
  yarnTo(s, 'N')
  s.arrows = []
  s.tags = hands('2코 빼기', '실 감아 함께 뜨기')
  L.push(st(s, '실을 감아 2코를 함께 떠요(k2tog). 오른쪽 바늘에는 걸러 둔 코와 새 코가 있어요.'))

  s = clone(s)
  moveNeedle(s, 'L', P(455, 180, 160, 196, 3))
  s.arrows = [{ id: 'a', pts: [[505, 230], [470, 150], [415, 205]], t: '덮어씌우기' }]
  s.tags = hands('걸러 둔 코를 들어 올리기', '그대로')
  L.push(st(s, '왼쪽 바늘 끝으로 걸러 둔 코를 들어 올려요.'))

  s = clone(s)
  moveNeedle(s, 'L', NP.L)
  s.rings.L1 = { x: 420, y: 200, a: 0, rot: 0 }
  s.rings.N.vt = 'S3'
  s.arrows = []
  s.tags = hands('바늘 제자리', '새 코만 남김')
  L.push(st(s, '새 코 위로 덮어씌워 바늘에서 빼면 완성. 3코가 1코가 됐어요.'))

  return tut('SK2P', '겉안겉 3코 모아뜨기', '고무단 줄임에 쓰여요. 1코 거르고 2코 k2tog 한 뒤, 걸러 둔 코를 덮어씌워요.', L)
}

// ===== M1L / M1R =====
function m1(id: 'M1L' | 'M1R', left: boolean): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  s.marks = [{ id: 'bar', kind: 'bar', at: [372, 238], col: 'work' }]
  s.tags = hands('그대로', '그대로')
  s.tags.push({ id: 'b', at: [372, 280], text: '코와 코 사이 가로실' })
  L.push(st(s, '오른쪽 바늘의 코와 왼쪽 바늘의 코 사이에 가로로 걸친 실이 있어요.'))

  s = clone(s)
  moveNeedle(s, 'L', P(380, 222, 80, 214, 3))
  s.marks = []
  s.rings.B = { on: 'L', d: 6, col: 'work', hl: 1, tw: left ? 1 : 0, vb: 0 }
  s.arrows = [
    {
      id: 'a',
      pts: left ? [[330, 270], [360, 280], [384, 232]] : [[420, 280], [400, 290], [380, 232]],
      t: left ? '앞 → 뒤로 들기' : '뒤 → 앞으로 들기',
    },
  ]
  s.tags = hands(left ? '가로실을 앞에서 뒤로 들기' : '가로실을 뒤에서 앞으로 들기', '그대로')
  L.push(st(s, left ? '왼쪽 바늘로 가로실을 앞에서 뒤로 떠 올려요.' : '왼쪽 바늘로 가로실을 뒤에서 앞으로 떠 올려요.'))

  s = clone(s)
  moveNeedle(s, 'L', NP.L, ['B'])
  s.rings.B.d = 8
  for (const k of ['L1', 'L2', 'L3', 'L4', 'L5']) if (s.rings[k]) s.rings[k].d = (s.rings[k].d ?? 0) + 22
  s.needles.R = left ? P(300, 178, 690, 262, 0) : P(300, 168, 690, 262, 0)
  s.rings.B.thru = 'LR'
  s.arrows = [
    {
      id: 'a',
      pts: left ? [[420, 160], [360, 140], [306, 176]] : [[420, 260], [350, 250], [306, 172]],
      t: left ? '뒤쪽 가닥에' : '앞쪽 가닥에',
    },
  ]
  s.tags = hands('그대로', left ? '뒤쪽 가닥에 찔러 넣기' : '앞쪽 가닥에 찔러 넣기')
  L.push(
    st(
      s,
      left
        ? '오른쪽 바늘을 들어 올린 실의 뒤쪽 가닥에 넣어요. 이렇게 하면 실이 꼬여서 구멍이 생기지 않아요.'
        : '오른쪽 바늘을 들어 올린 실의 앞쪽 가닥에 넣어요. 실이 꼬여서 구멍이 생기지 않아요.',
    ),
  )

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.B = { x: 345, y: 195, a: 0, rot: 3.1 }
  s.rings.N = { on: 'R', d: 82, col: 'work', hl: 1, vb: 1, vt: 'T' }
  yarnTo(s, 'N')
  s.arrows = []
  s.tags = hands('들어 올린 실 빼기', '겉뜨기로 뜨기')
  L.push(st(s, '겉뜨기로 떠서 빼면 1코가 늘어요. ' + (left ? '왼쪽' : '오른쪽') + '으로 기운 꼬인 코가 생겨요.'))

  return tut(
    id,
    left ? 'M1L (왼쪽 꼬아 늘리기)' : 'M1R (오른쪽 꼬아 늘리기)',
    left ? '가로실을 앞에서 뒤로 들어 올려 뒤쪽 가닥에 겉뜨기. 1코가 늘어요.' : '가로실을 뒤에서 앞으로 들어 올려 앞쪽 가닥에 겉뜨기. 1코가 늘어요.',
    L,
  )
}

// ===== 감아코 =====
function castOn(): Tutorial {
  const L: TutorialStep[] = []
  let s = base({ nL: 0 })
  s.needles.L = { ...NP.Lfar, tx: -200, bx: -500 }
  s.thumb = { x: 250, y: 300, rot: -0.25 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'R1' }, [330, 250], [250, 230], [230, 300], ball], z: 'f' }]
  s.tags = [
    { id: 'hL', at: [180, 70], text: '왼손 엄지 · 실 걸기' },
    { id: 'hR', at: [560, 70], text: '오른손 · 바늘 잡기' },
  ]
  L.push(st(s, '단 끝에서, 오른쪽 바늘에서 나온 실을 왼손 엄지에 앞에서 뒤로 걸어요.'))

  s = clone(s)
  s.rings.C = { x: 246, y: 222, rot: 0.2, rx: 12, ry: 20, col: 'work', hl: 1, vb: 0 }
  s.yarn = [
    { id: 'y1', pts: [{ ring: 'R1' }, [330, 250], [262, 240]], z: 'f' },
    { id: 'y2', pts: [[232, 240], [210, 300], ball], z: 'b' },
  ]
  s.arrows = [{ id: 'a', pts: [[440, 170], [330, 150], [256, 205]], t: '고리 아래에서 위로' }]
  s.tags = [
    { id: 'hL', at: [180, 70], text: '왼손 엄지 · 고리 유지' },
    { id: 'hR', at: [560, 70], text: '오른손 · 바늘 끝을 고리에' },
  ]
  L.push(st(s, '엄지에 걸린 실이 고리를 만들어요. 오른쪽 바늘 끝을 그 고리에 아래에서 위로 넣어요.'))

  s = clone(s)
  s.thumb = { x: 200, y: 360, rot: -0.6 }
  s.rings.C = { on: 'R', d: 82, col: 'work', hl: 1, tw: 1, vb: 0 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'C' }, [380, 320], ball], z: 'f' }]
  s.arrows = []
  s.tags = [
    { id: 'hL', at: [180, 70], text: '왼손 엄지 · 빼기' },
    { id: 'hR', at: [560, 70], text: '오른손 · 실 살짝 당기기' },
  ]
  L.push(st(s, '엄지를 빼고 실을 살짝 당기면 바늘에 새 코가 걸려요.'))

  s = clone(s)
  ;['C2', 'C3', 'C4', 'C5'].forEach((k, i) => {
    s.rings[k] = { on: 'R', d: 82 - 18 * (i + 1), col: 'work', hl: 1, tw: 1, vb: 0 }
  })
  s.yarn = [{ id: 'y1', pts: [{ ring: 'C5' }, [380, 320], ball], z: 'f' }]
  s.tags = [{ id: 'n', at: [400, 130], text: '5번 반복 = 감아코 5코' }]
  L.push(st(s, '같은 방법을 5번 반복해 5코를 만들어요. 다음 단에서 이 코들도 함께 떠요.'))

  return tut('CO', '감아코 만들기', '단 끝에 새 코를 더할 때 써요. 엄지에 실을 감아 바늘로 옮겨요.', L)
}

// ===== 3 needle bind off =====
function bindOff(): Tutorial {
  const L: TutorialStep[] = []
  const front = P(330, 196, 30, 214, 2)
  const back = P(318, 176, 18, 194, 1)
  const mk = (): SceneSpec => {
    const s: SceneSpec = { needles: { F: front, K: back, R: NP.Rrest }, rings: {}, yarn: [], arrows: [], tags: [], marks: [] }
    for (let i = 0; i < 4; i++) {
      s.rings['F' + (i + 1)] = { on: 'F', d: 26 + 32 * i, vb: 1 }
      s.rings['K' + (i + 1)] = { on: 'K', d: 40 + 32 * i, vb: 0, col: 'yarn' }
    }
    s.yarn = [{ id: 'y1', pts: [[520, 220], [470, 330], ball], z: 'b' }]
    return s
  }
  const pull = (s: SceneSpec, from: number): void => {
    for (const n of ['F', 'K']) for (let i = from; i <= 4; i++) s.rings[n + i].d = (s.rings[n + i].d ?? 0) - 32
  }

  let s = mk()
  s.rings.F1.hl = 1
  s.rings.K1.hl = 1
  s.tags = [
    { id: 'hL', at: [140, 70], text: '왼손 · 두 바늘을 나란히' },
    { id: 'hR', at: [560, 70], text: '오른손 · 세 번째 바늘' },
  ]
  s.tags.push({ id: 'n', at: [270, 340], text: '겉면끼리 마주 보게 접은 상태' })
  L.push(st(s, '반으로 접어 두 바늘을 나란히 왼손에 쥐어요. 앞뒤 바늘의 첫 코를 함께 떠요.'))

  s = clone(s)
  s.needles.R = P(240, 175, 690, 262, 0)
  s.rings.F1.thru = 'FR'
  s.rings.K1.thru = 'KR'
  s.arrows = [{ id: 'a', pts: [[400, 255], [320, 255], [246, 178]], t: '앞뒤 첫 코에 함께' }]
  s.tags = [{ id: 'hR', at: [560, 70], text: '오른손 · 앞뒤 2코에 넣기' }]
  L.push(st(s, '세 번째 바늘을 앞쪽 바늘 첫 코와 뒤쪽 바늘 첫 코에 겉뜨기 방향으로 한 번에 넣어요.'))

  s = clone(s)
  s.needles.R = NP.Rrest
  s.rings.F1 = { x: 352, y: 200, a: 0, rot: 3.1 }
  s.rings.K1 = { x: 340, y: 180, a: 0, rot: 3.1 }
  pull(s, 2)
  s.rings.N1 = { on: 'R', d: 82, col: 'work', hl: 1, vb: 0 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'N1' }, [470, 330], ball], z: 'b' }]
  s.arrows = []
  s.tags = [{ id: 'hR', at: [560, 70], text: '오른손 · 실 감아 함께 뜨기' }]
  L.push(st(s, '실을 감아 2코를 함께 떠서 빼요. 오른쪽 바늘에 1코가 생겨요.'))

  s = clone(s)
  s.rings.F2 = { x: 352, y: 200, a: 0, rot: 3.1 }
  s.rings.K2 = { x: 340, y: 180, a: 0, rot: 3.1 }
  pull(s, 3)
  s.rings.N1.d = 112
  s.rings.N1.hl = 1
  s.rings.N2 = { on: 'R', d: 82, col: 'work', hl: 0, vb: 0 }
  s.yarn = [{ id: 'y1', pts: [{ ring: 'N2' }, [470, 330], ball], z: 'b' }]
  s.tags = [{ id: 'hR', at: [560, 70], text: '오른손 · 다음 2코도 함께 뜨기' }]
  L.push(st(s, '다음 앞뒤 2코도 같은 방법으로 함께 떠요. 이제 오른쪽 바늘에 2코가 있어요.'))

  s = clone(s)
  moveNeedle(s, 'F', P(455, 186, 155, 204, 3))
  s.arrows = [{ id: 'a', pts: [[560, 240], [520, 150], [470, 215]], t: '덮어씌우기' }]
  s.tags = [{ id: 'hL', at: [140, 70], text: '왼손 · 바늘 끝으로 첫 코 들기' }]
  L.push(st(s, '왼쪽 바늘 끝으로 오른쪽 바늘의 첫 코(먼저 뜬 코)를 들어 올려요.'))

  s = clone(s)
  moveNeedle(s, 'F', front)
  s.rings.N1 = { x: 470, y: 200, a: 0, rot: 0 }
  s.marks = [{ id: 'c1', kind: 'chain', at: [520, 300], col: 'work' }]
  s.arrows = []
  s.tags = [{ id: 'n', at: [520, 340], text: '코막음 1코' }]
  L.push(st(s, '두 번째 코 위로 덮어씌워 빼면 1코 코막음 완료. 끝까지 반복해요.'))

  return tut('BO', '3 needle bind off', '두 바늘의 코를 함께 떠서 이어 붙이며 코막음해요. 꼭대기 이음에 써요.', L)
}

/** 기호별 뜨는 법. 순서는 코 사전(KNIT_SYMBOLS)과 같습니다. */
export const TUTORIALS: Record<SymbolId, Tutorial> = {
  K: knit(),
  P: purl(),
  YO: yarnOver(),
  K2TOG: k2tog(),
  SSK: ssk(),
  SK2P: sk2p(),
  M1L: m1('M1L', true),
  M1R: m1('M1R', false),
  CO: castOn(),
  BO: bindOff(),
}
