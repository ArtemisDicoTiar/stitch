/**
 * 코바늘 뜨는 법: 매직링, 사슬, 짧은뜨기, 늘림, 줄임, 빼뜨기.
 * 대바늘과 같은 장면 틀을 씁니다. 바늘은 갈고리가 있는 코바늘 하나이고, 바늘에는 보통 고리가 하나만 걸려 있습니다.
 * 좌표는 720×430 그림 기준입니다.
 *
 * 그림에서 아래 줄은 아랫단의 코 머리, 그 위 오른쪽은 이번 단에 이미 뜬 코(머리와 기둥)입니다.
 * 오른손잡이 기준으로 오른쪽에서 왼쪽으로 떠 나갑니다.
 */
import type { MarkSpec, NeedlePose, RingSpec, SceneSpec, TagSpec, Tutorial, TutorialId, TutorialStep, YarnSpec } from './types'

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T
const SAME = '그대로'

const H = (tx: number, ty: number, bx = 700, by = ty - 96): NeedlePose => ({ tx, ty, bx, by, z: 2, kind: 'hook' })

/** 아랫단 머리의 높이, 이번 단 머리의 높이 */
const BASE_Y = 300
const TOP_Y = 252
/** 다음에 뜰 코의 자리와, 그 왼쪽(아직 안 뜬 코), 오른쪽(이번 단에 뜬 코) */
const NEXT_X = 365
const TODO_X = [315, 265, 215]
const DONE_X = [415, 465, 515, 565]

/** 쉬고 있는 바늘과, 코 머리 아래로 넣은 바늘 */
const REST = H(396, 236)
// 넣을 때는 바늘을 세워서, 이미 뜬 코들 위를 가로지르지 않게 합니다.
const into = (x: number): NeedlePose => H(x - 18, BASE_Y + 8, x + 215, 96)
/** 코 하나를 다 뜨고 난 뒤의 바늘: 새 코 바로 위로 옮겨 옵니다. */
const restAt = (x: number): NeedlePose => H(x - 19, 236)

const loop = (d: number, col: RingSpec['col'] = 'yarn', lab = ''): RingSpec => ({ on: 'H', d, vb: 0, rx: 8, ry: 14, col, ...(lab ? { lab } : {}) })

const hands = (L: string, R: string): TagSpec[] => [
  { id: 'hL', at: [110, 70], text: '왼손 · ' + L },
  { id: 'hR', at: [560, 70], text: '오른손 · ' + R },
]

/** 왼손 검지에 건 실: 바늘의 고리에서 왼쪽 위로 */
const feed = (from: YarnSpec['pts'][number]): YarnSpec => ({ id: 'w', pts: [from, [330, 168], [215, 122], [120, 104]], z: 'b', col: 'work' })
/** 바늘 끝에 실을 건 모습 */
const over: YarnSpec = { id: 'w', pts: [{ n: 'H', d: 10, off: [0, 13] }, { n: 'H', d: 4, off: [-7, -4] }, { n: 'H', d: 14, off: [-4, -16] }, [215, 122], [120, 104]], z: 'f', col: 'work' }

/** 이번 단의 코 하나: 머리와 기둥 */
function stitch(id: string, x: number, col: MarkSpec['col'] = 'yarn'): MarkSpec[] {
  return [
    { id: `${id}p`, kind: 'post', at: [x, TOP_Y + 4], h: BASE_Y - TOP_Y - 6, col },
    { id: `${id}t`, kind: 'top', at: [x, TOP_Y], col },
  ]
}

/** 기본 장면: 아랫단의 머리들, 이번 단에 이미 뜬 코들, 고리 하나가 걸린 바늘 */
function base(): SceneSpec {
  const marks: MarkSpec[] = []
  // 강조(hl)는 0이라도 적어 둡니다. 적혀 있어야 단계 사이에 서서히 켜지고 꺼집니다.
  ;[NEXT_X, ...TODO_X].forEach((x, i) => marks.push({ id: `b${i}`, kind: 'top', at: [x, BASE_Y], hl: 0 }))
  DONE_X.forEach((x, i) => marks.push(...stitch(`d${i}`, x)))
  return {
    needles: { H: REST },
    rings: { H1: loop(34) },
    // 바늘의 고리는 방금 뜬 코의 머리에서 올라옵니다.
    yarn: [{ id: 'tail', pts: [{ ring: 'H1' }, [DONE_X[0] - 2, TOP_Y - 6]], z: 'f', col: 'yarn' }, feed({ ring: 'H1', at: 'top' })],
    arrows: [],
    tags: [],
    marks,
  }
}

const mark = (s: SceneSpec, id: string): MarkSpec => {
  const m = s.marks.find((x) => x.id === id)
  if (!m) throw new Error(`장면에 ${id}가 없습니다`)
  return m
}
const setYarn = (s: SceneSpec, y: YarnSpec): void => {
  s.yarn = [...s.yarn.filter((x) => x.id !== y.id), y]
}

function st(s: SceneSpec, text: string): TutorialStep {
  const c = clone(s)
  const h: { L?: string; R?: string } = {}
  for (const t of c.tags) if (t.id === 'hL' || t.id === 'hR') h[t.id === 'hL' ? 'L' : 'R'] = t.text.replace(/^(왼손|오른손) · /, '')
  c.tags = c.tags.filter((t) => t.id !== 'hL' && t.id !== 'hR')
  return { text, left: h.L || SAME, right: h.R || SAME, scene: c }
}

function tut(id: TutorialId, title: string, summary: string, steps: TutorialStep[]): Tutorial {
  return { id, title, label: title.split(' (')[0], summary, steps }
}

// ---- 자주 나오는 움직임 ----

/** 코 머리 아래로 바늘을 넣습니다. */
function insert(s: SceneSpec, x: number): void {
  s.needles.H = into(x)
  s.arrows = [{ id: 'a', pts: [[x + 60, 246], [x + 26, 268], [x - 6, BASE_Y + 4]], t: '머리 두 가닥 아래로' }]
  s.yarn = s.yarn.filter((y) => y.id !== 'tail')
  setYarn(s, feed({ ring: 'H1', at: 'top' }))
}

/** 바늘 끝에 실을 겁니다. */
function yarnOver(s: SceneSpec): void {
  setYarn(s, over)
  s.arrows = [{ id: 'a', pts: [{ n: 'H', d: 30, off: [-30, -40] }, { n: 'H', d: 6, off: [-22, -22] }, { n: 'H', d: 8, off: [-2, 4] }], t: '실 걸기' }]
}

/** 건 실을 코 밖으로 끌어내 바늘에 고리를 하나 더 올립니다. */
function pullUp(s: SceneSpec, id: string, d: number): void {
  s.needles.H = REST
  s.rings[id] = loop(d, 'work')
  setYarn(s, feed({ ring: id, at: 'top' }))
  s.arrows = []
}

/** 바늘의 고리를 모두 빼고 새 고리 하나를 남깁니다. */
function pullThrough(s: SceneSpec, keep: string): void {
  for (const k of Object.keys(s.rings)) if (k !== keep) delete s.rings[k]
  s.rings[keep] = loop(34, 'work')
  s.needles.H = REST
  setYarn(s, feed({ ring: keep, at: 'top' }))
  s.arrows = []
}

// ===== 짧은뜨기 =====
function singleCrochet(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  mark(s, 'b0').hl = 1
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, '바늘에 고리가 하나 걸려 있어요. 다음 코의 머리(주황색)에 뜰 거예요.'))

  s = clone(s)
  insert(s, NEXT_X)
  s.tags = hands(SAME, '코 머리 아래로 바늘 넣기')
  L.push(st(s, '코 머리의 두 가닥 아래로 바늘을 앞에서 뒤로 넣어요.'))

  s = clone(s)
  yarnOver(s)
  s.tags = hands('실을 팽팽하게', '바늘 끝에 실 걸기')
  L.push(st(s, '바늘 끝의 갈고리에 실을 걸어요.'))

  s = clone(s)
  pullUp(s, 'H2', 14)
  s.rings.H1.lab = '1'
  s.rings.H2.lab = '2'
  s.tags = hands(SAME, '코 밖으로 끌어내기')
  L.push(st(s, '건 실을 코 밖으로 끌어내요. 바늘에 고리가 2개가 됐어요.'))

  s = clone(s)
  yarnOver(s)
  s.tags = hands(SAME, '다시 실 걸기')
  L.push(st(s, '한 번 더 실을 걸어요.'))

  s = clone(s)
  pullThrough(s, 'H3')
  s.needles.H = restAt(NEXT_X)
  mark(s, 'b0').hl = 0
  s.marks.push(...stitch('n', NEXT_X, 'work'))
  s.yarn.push({ id: 'tail', pts: [{ ring: 'H3' }, [NEXT_X - 2, TOP_Y - 6]], z: 'f', col: 'work' })
  s.tags = hands(SAME, '고리 2개를 한 번에 빼기')
  L.push(st(s, '건 실을 고리 2개 사이로 한 번에 빼내면 짧은뜨기 1코예요. 바늘에는 다시 고리 하나가 남아요.'))

  return tut('SC', '짧은뜨기', '코바늘의 가장 기본이 되는 코예요. 코 머리에 바늘을 넣어 실을 끌어내고, 다시 걸어 고리 2개를 빼요.', L)
}

// ===== 사슬뜨기 =====
function chain(): Tutorial {
  const L: TutorialStep[] = []
  const links = (n: number, col: MarkSpec['col'][]): MarkSpec[] => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, kind: 'chain' as const, at: [430 + i * 30, 262 + i * 6] as [number, number], col: col[i] ?? 'yarn' }))
  let s: SceneSpec = { needles: { H: REST }, rings: { H1: loop(34) }, yarn: [feed({ ring: 'H1', at: 'top' })], arrows: [], tags: [], marks: links(3, []) }
  s.tags = hands('실을 검지에 걸고 사슬 잡기', '코바늘 잡기')
  L.push(st(s, '바늘에 고리가 하나 걸려 있어요. 아래로 이어진 것이 지금까지 뜬 사슬이에요.'))

  s = clone(s)
  yarnOver(s)
  s.tags = hands('실을 팽팽하게', '바늘 끝에 실 걸기')
  L.push(st(s, '바늘 끝의 갈고리에 실을 걸어요.'))

  // 새 사슬은 바늘 바로 아래에 생기고, 먼저 뜬 사슬은 한 칸씩 밀려 내려갑니다.
  s = clone(s)
  s.rings = { H2: loop(34, 'work') }
  s.marks = links(4, ['work'])
  setYarn(s, feed({ ring: 'H2', at: 'top' }))
  s.arrows = []
  s.tags = hands(SAME, '고리 사이로 빼기')
  L.push(st(s, '건 실을 바늘의 고리 사이로 빼내요. 사슬 1코(파란색)가 생겼어요.'))

  s = clone(s)
  s.marks = links(5, ['work', 'work'])
  s.tags = hands('뜬 사슬 바로 아래 잡기', SAME)
  L.push(st(s, '같은 방법으로 필요한 만큼 떠요. 사슬은 조이지 말고 고른 크기로 뜨면 다음 단에 바늘을 넣기 쉬워요.'))

  return tut('CH', '사슬뜨기', '실을 걸어 고리 사이로 빼는 것을 되풀이해요. 시작 사슬과 기둥코, 무늬의 구멍에 써요.', L)
}

// ===== 빼뜨기 =====
function slipStitch(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  mark(s, 'b0').hl = 1
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, '빼뜨기는 높이가 없는 코예요. 단의 끝을 첫 코에 잇거나 자리를 옮길 때 써요.'))

  s = clone(s)
  insert(s, NEXT_X)
  s.tags = hands(SAME, '코 머리 아래로 바늘 넣기')
  L.push(st(s, '다음 코의 머리 아래로 바늘을 넣어요.'))

  s = clone(s)
  yarnOver(s)
  s.tags = hands('실을 팽팽하게', '바늘 끝에 실 걸기')
  L.push(st(s, '바늘 끝에 실을 걸어요.'))

  s = clone(s)
  pullThrough(s, 'H2')
  mark(s, 'b0').hl = 0
  s.marks.push({ id: 'nt', kind: 'chain', at: [NEXT_X, BASE_Y - 13], col: 'work' })
  s.tags = hands(SAME, '코와 고리를 한 번에 빼기')
  L.push(st(s, '건 실을 코와 바늘의 고리까지 한 번에 빼내요. 납작한 코가 하나 생기고, 코 수에는 넣지 않아요.'))

  return tut('SL', '빼뜨기', '실을 걸어 코와 고리를 한 번에 빼요. 높이가 없어서 단을 잇거나 옮겨 갈 때 써요.', L)
}

/** 한 코에서 두 코가 나온 모습: 머리 둘이 한 자리로 모입니다. */
function fan(id: string, x: number, at: number, col: MarkSpec['col']): { marks: MarkSpec[]; yarn: YarnSpec } {
  return {
    marks: [{ id: `${id}t`, kind: 'top', at: [at, TOP_Y], col }],
    yarn: { id: `${id}p`, pts: [[at, TOP_Y + 6], [(at + x) / 2 + (at < x ? -2 : 2), (TOP_Y + BASE_Y) / 2], [x, BASE_Y - 6]], z: 'b', col },
  }
}

// ===== 늘림 =====
function increase(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  // 다음 코에 이미 짧은뜨기를 1번 뜬 모습에서 시작합니다.
  const first = fan('n1', NEXT_X, NEXT_X + 20, 'yarn')
  s.marks.push(...first.marks)
  s.yarn = [first.yarn, { id: 'tail', pts: [{ ring: 'H1' }, [NEXT_X + 22, TOP_Y - 6]], z: 'f', col: 'yarn' }, feed({ ring: 'H1', at: 'top' })]
  s.needles.H = H(376, 236)
  mark(s, 'b0').hl = 1
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, '늘림은 한 코에 짧은뜨기를 2번 뜨는 거예요. 먼저 다음 코에 짧은뜨기를 1번 떴어요. 그 코(주황색)에 한 번 더 뜹니다.'))

  s = clone(s)
  s.needles.H = into(NEXT_X - 6)
  s.arrows = [{ id: 'a', pts: [[NEXT_X + 50, 246], [NEXT_X + 14, 270], [NEXT_X - 12, BASE_Y + 4]], t: '같은 코에 한 번 더' }]
  s.yarn = s.yarn.filter((y) => y.id !== 'tail')
  s.tags = hands(SAME, '같은 코에 바늘 넣기')
  L.push(st(s, '방금 뜬 바로 그 코의 머리 아래로 바늘을 다시 넣어요.'))

  s = clone(s)
  s.needles.H = H(376, 236)
  s.rings.H2 = loop(14, 'work')
  s.rings.H1.lab = '1'
  s.rings.H2.lab = '2'
  setYarn(s, feed({ ring: 'H2', at: 'top' }))
  s.arrows = []
  s.tags = hands(SAME, '실을 걸어 끌어내기')
  L.push(st(s, '실을 걸어 코 밖으로 끌어내요. 바늘에 고리가 2개.'))

  s = clone(s)
  const second = fan('n2', NEXT_X, NEXT_X - 22, 'work')
  s.rings = { H3: loop(34, 'work') }
  s.needles.H = restAt(NEXT_X - 22)
  s.marks.push(...second.marks)
  mark(s, 'b0').hl = 0
  s.yarn = [first.yarn, second.yarn, { id: 'tail', pts: [{ ring: 'H3' }, [NEXT_X - 20, TOP_Y - 6]], z: 'f', col: 'work' }, feed({ ring: 'H3', at: 'top' })]
  s.tags = hands(SAME, '실을 걸어 고리 2개 빼기')
  L.push(st(s, '다시 실을 걸어 고리 2개를 빼요. 한 코에서 2코가 나와 코 수가 1코 늘었어요.'))

  return tut('INC', '늘림 (한 코에 2번)', '같은 코에 짧은뜨기를 2번 떠서 코를 하나 늘려요. 둥글게 뜰 때 판을 넓히는 방법이에요.', L)
}

// ===== 줄임 =====
function decrease(): Tutorial {
  const L: TutorialStep[] = []
  let s = base()
  mark(s, 'b0').hl = 1
  mark(s, 'b1').hl = 1
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, '줄임은 2코를 1코로 모으는 거예요. 다음 두 코(주황색)를 한 번에 떠요.'))

  s = clone(s)
  insert(s, NEXT_X)
  s.tags = hands(SAME, '첫째 코에 바늘 넣기')
  L.push(st(s, '첫째 코의 머리 아래로 바늘을 넣어요.'))

  s = clone(s)
  pullUp(s, 'H2', 14)
  s.rings.H1.lab = '1'
  s.rings.H2.lab = '2'
  s.tags = hands(SAME, '실을 걸어 끌어내기')
  L.push(st(s, '실을 걸어 끌어내요. 고리가 2개. 여기서 고리를 빼지 않고 그대로 둡니다.'))

  s = clone(s)
  s.needles.H = into(TODO_X[0])
  s.arrows = [{ id: 'a', pts: [[TODO_X[0] + 60, 246], [TODO_X[0] + 26, 268], [TODO_X[0] - 6, BASE_Y + 4]], t: '둘째 코에도' }]
  s.tags = hands(SAME, '둘째 코에 바늘 넣기')
  L.push(st(s, '그다음 코의 머리 아래로도 바늘을 넣어요.'))

  s = clone(s)
  s.needles.H = H(350, 236)
  s.rings.H3 = loop(4, 'work', '3')
  setYarn(s, feed({ ring: 'H3', at: 'top' }))
  s.arrows = []
  s.tags = hands(SAME, '실을 걸어 끌어내기')
  L.push(st(s, '실을 걸어 끌어내요. 바늘에 고리가 3개가 됐어요.'))

  s = clone(s)
  const at = (NEXT_X + TODO_X[0]) / 2
  s.rings = { H4: loop(34, 'work') }
  s.needles.H = restAt(at)
  mark(s, 'b0').hl = 0
  mark(s, 'b1').hl = 0
  s.marks.push({ id: 'nt', kind: 'top', at: [at, TOP_Y], col: 'work' })
  s.yarn = [
    { id: 'p1', pts: [[at + 4, TOP_Y + 6], [NEXT_X - 6, (TOP_Y + BASE_Y) / 2], [NEXT_X, BASE_Y - 6]], z: 'b', col: 'work' },
    { id: 'p2', pts: [[at - 4, TOP_Y + 6], [TODO_X[0] + 6, (TOP_Y + BASE_Y) / 2], [TODO_X[0], BASE_Y - 6]], z: 'b', col: 'work' },
    { id: 'tail', pts: [{ ring: 'H4' }, [at + 2, TOP_Y - 6]], z: 'f', col: 'work' },
    feed({ ring: 'H4', at: 'top' }),
  ]
  s.tags = hands(SAME, '실을 걸어 고리 3개 빼기')
  L.push(st(s, '실을 걸어 고리 3개를 한 번에 빼내요. 2코가 1코로 모여 코 수가 1코 줄었어요.'))

  return tut('SC2', '줄임 (2코 모아뜨기)', '두 코에서 실을 하나씩 끌어낸 뒤 한 번에 빼서 1코로 모아요. 둥근 모양을 오므릴 때 써요.', L)
}

// ===== 매직링 =====
function magicRing(): Tutorial {
  const L: TutorialStep[] = []
  const C: [number, number] = [372, 290]
  const ringMark = (h: number, hl = 0): MarkSpec => ({ id: 'ring', kind: 'loop', at: C, h, hl })
  /** 링에 둘러 놓인 코 머리 n개. 조이기 전에는 위쪽 반에 모여 있고, 조인 뒤(closed)에는 빙 둘러 놓입니다. */
  const around = (n: number, r: number, col: MarkSpec['col'][] = [], closed = false): MarkSpec[] =>
    Array.from({ length: n }, (_, i) => {
      const a = closed ? Math.PI * (0.5 - (2 * i) / n) : Math.PI * (0.12 + (0.76 * (i + 0.5)) / n)
      const wide = closed ? 1.15 : 1.25
      return { id: `r${i}`, kind: 'top' as const, at: [C[0] + Math.cos(a) * r * wide, C[1] - Math.sin(a) * r] as [number, number], col: col[i] ?? 'yarn' }
    })
  const tailYarn: YarnSpec = { id: 'tail', pts: [[C[0] + 44, C[1] + 22], [470, 350], [520, 392]], z: 'b', col: 'yarn' }

  let s: SceneSpec = { needles: { H: H(470, 214) }, rings: {}, yarn: [tailYarn, { id: 'w', pts: [[C[0] - 44, C[1] - 14], [250, 190], [170, 128], [120, 104]], z: 'b', col: 'work' }], arrows: [], tags: [], marks: [ringMark(48, 1)] }
  s.tags = hands('실을 손가락에 감아 고리 만들기', '코바늘 잡기')
  L.push(st(s, '실 끝을 손가락에 두 번 감아 고리를 만들어요. 이 고리(주황색)가 매직링이에요. 아래로 늘어진 것이 실 꼬리예요.'))

  s = clone(s)
  s.needles.H = H(C[0] - 6, C[1] + 6, 690, 190)
  s.marks = [ringMark(48)]
  s.arrows = [{ id: 'a', pts: [[C[0] + 76, 232], [C[0] + 40, 262], [C[0] + 2, C[1] + 2]], t: '고리 안으로' }]
  s.tags = hands('고리가 풀리지 않게 잡기', '고리 안으로 바늘 넣기')
  L.push(st(s, '고리 안으로 바늘을 넣고, 바늘 끝에 실을 걸어 고리 밖으로 끌어내요.'))

  s = clone(s)
  s.needles.H = H(C[0] + 26, 226)
  s.rings = { H1: loop(34, 'work') }
  s.yarn = [tailYarn, feed({ ring: 'H1', at: 'top' })]
  s.arrows = []
  s.tags = hands(SAME, '실을 걸어 한 번 빼기')
  L.push(st(s, '실을 걸어 한 번 빼면(사슬 1코) 실이 고정돼요. 이 사슬은 코로 세지 않아요.'))

  s = clone(s)
  s.marks = [ringMark(48), ...around(1, 46, ['work'])]
  s.tags = hands(SAME, '고리 안에 짧은뜨기')
  L.push(st(s, '이제 고리 안에 짧은뜨기를 떠요. 바늘을 고리 안으로 넣어 실을 끌어내고, 다시 걸어 고리 2개를 빼요.'))

  s = clone(s)
  s.marks = [ringMark(48), ...around(6, 46)]
  s.needles.H = H(C[0] - 30, 226)
  s.tags = hands(SAME, '적힌 코 수만큼 뜨기')
  L.push(st(s, '도안에 적힌 코 수만큼 고리 안에 떠요. 여기서는 6코를 떴어요.'))

  s = clone(s)
  s.marks = [ringMark(9), ...around(6, 30, [], true)]
  s.needles.H = H(C[0] - 4, 228)
  s.yarn = [{ id: 'tail', pts: [[C[0] + 8, C[1] + 6], [470, 350], [560, 400]], z: 'b', col: 'yarn' }, feed({ ring: 'H1', at: 'top' })]
  s.arrows = [{ id: 'a', pts: [[430, 330], [480, 360], [540, 392]], t: '실 꼬리 당기기' }]
  s.tags = hands('실 꼬리를 당기기', SAME)
  L.push(st(s, '실 꼬리를 당기면 고리가 조여져 가운데 구멍이 닫혀요. 이것이 1단이고, 2단부터는 이 코들의 머리에 떠요.'))

  return tut('RING', '매직링', '둥글게 뜨는 것을 시작하는 방법이에요. 실 고리 안에 첫 단을 뜨고 실 꼬리를 당겨 구멍을 닫아요.', L)
}

// ===== 긴 코: 긴뜨기, 한길긴뜨기, 두길긴뜨기 =====
/**
 * 긴 코는 바늘을 넣기 전에 실을 먼저 감습니다. 감는 횟수와 고리를 빼는 횟수만 다릅니다.
 * - 긴뜨기: 1번 감고, 끌어낸 뒤 고리 3개를 한 번에
 * - 한길긴뜨기: 1번 감고, 고리를 2개씩 두 번
 * - 두길긴뜨기: 2번 감고, 고리를 2개씩 세 번
 */
function tall(id: 'HDC' | 'DC' | 'TR', title: string, summary: string): Tutorial {
  const wraps = id === 'TR' ? 2 : 1
  const pulls = id === 'HDC' ? 1 : id === 'DC' ? 2 : 3
  const L: TutorialStep[] = []
  let s = base()
  mark(s, 'b0').hl = 1
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, `${title.split(' (')[0]}는 짧은뜨기보다 키가 큰 코예요. 다음 코의 머리(주황색)에 뜹니다.`))

  // 바늘을 넣기 전에 실을 감습니다. 감은 실은 바늘 위의 고리가 됩니다.
  s = clone(s)
  for (let i = 0; i < wraps; i++) s.rings[`W${i}`] = loop(20 - i * 10, 'work')
  setYarn(s, feed({ ring: `W${wraps - 1}`, at: 'top' }))
  s.arrows = [{ id: 'a', pts: [{ n: 'H', d: 30, off: [-30, -40] }, { n: 'H', d: 6, off: [-22, -22] }, { n: 'H', d: 8, off: [-2, 4] }], t: wraps === 2 ? '실을 2번 감기' : '실을 먼저 감기' }]
  s.tags = hands('실을 팽팽하게', `바늘에 실을 ${wraps}번 감기`)
  L.push(st(s, `바늘을 넣기 전에 바늘에 실을 ${wraps}번 감아요.`))

  s = clone(s)
  s.needles.H = into(NEXT_X)
  s.arrows = [{ id: 'a', pts: [[NEXT_X + 60, 246], [NEXT_X + 26, 268], [NEXT_X - 6, BASE_Y + 4]], t: '머리 두 가닥 아래로' }]
  s.yarn = s.yarn.filter((y) => y.id !== 'tail')
  s.tags = hands(SAME, '코 머리 아래로 바늘 넣기')
  L.push(st(s, '감은 실을 그대로 둔 채, 코 머리의 두 가닥 아래로 바늘을 넣어요.'))

  s = clone(s)
  s.needles.H = REST
  const up = `U`
  s.rings[up] = loop(wraps === 2 ? -4 : 6, 'work')
  // 바늘 위의 고리에 번호를 붙입니다. 바늘 끝 쪽이 큰 번호입니다.
  const order = ['H1', ...Array.from({ length: wraps }, (_, i) => `W${i}`), up]
  order.forEach((k, i) => (s.rings[k].lab = String(i + 1)))
  // 고리가 많으면 바늘 끝 쪽으로 고르게 벌려 놓습니다.
  order.forEach((k, i) => (s.rings[k].d = 36 - i * (wraps === 2 ? 11 : 13)))
  setYarn(s, feed({ ring: up, at: 'top' }))
  s.arrows = []
  s.tags = hands(SAME, '실을 걸어 끌어내기')
  L.push(st(s, `실을 걸어 코 밖으로 끌어내요. 바늘에 고리가 ${order.length}개가 됐어요.`))

  let left = order.length
  for (let p = 0; p < pulls; p++) {
    s = clone(s)
    const take = id === 'HDC' ? left : 2
    const last = p === pulls - 1
    // 바늘 끝 쪽 고리부터 take개를 빼고, 새 고리 하나가 생깁니다.
    const keys = Object.keys(s.rings).sort((a, b) => (s.rings[a].d ?? 0) - (s.rings[b].d ?? 0))
    for (const k of keys.slice(0, take)) delete s.rings[k]
    left = left - take + 1
    const fresh = `N${p}`
    s.rings[fresh] = loop(last ? 34 : 10, 'work')
    Object.keys(s.rings).sort((a, b) => (s.rings[b].d ?? 0) - (s.rings[a].d ?? 0)).forEach((k, i) => (s.rings[k].lab = last ? '' : String(i + 1)))
    if (last) for (const k of Object.keys(s.rings)) if (!s.rings[k].lab) delete s.rings[k].lab
    setYarn(s, feed({ ring: fresh, at: 'top' }))
    if (last) {
      s.needles.H = restAt(NEXT_X)
      mark(s, 'b0').hl = 0
      s.marks.push(...stitch('n', NEXT_X, 'work'))
      s.yarn.push({ id: 'tail', pts: [{ ring: fresh }, [NEXT_X - 2, TOP_Y - 6]], z: 'f', col: 'work' })
    }
    s.tags = hands(SAME, `실을 걸어 고리 ${take}개 빼기`)
    const done = `${title.split(' (')[0]} 1코예요. 바늘에는 다시 고리 하나가 남아요.`
    L.push(st(s, last ? `실을 걸어 ${id === 'HDC' ? `고리 ${take}개를 한 번에` : '남은 고리 2개를'} 빼내면 ${done}` : `실을 걸어 바늘 끝 쪽 고리 2개만 빼내요. 고리가 ${left}개 남아요.`))
  }
  return tut(id, title, summary, L)
}

// ===== 기둥코를 세우고 편물 돌리기 =====
function turn(): Tutorial {
  const L: TutorialStep[] = []
  // 단의 끝: 이번 단의 코가 모두 떠져 있습니다.
  const xs = [215, 265, 315, 365, 415, 465, 515]
  const rowDone = (): MarkSpec[] => xs.flatMap((x, i) => stitch(`d${i}`, x))
  let s: SceneSpec = { needles: { H: restAt(xs[0]) }, rings: { H1: loop(34) }, yarn: [{ id: 'tail', pts: [{ ring: 'H1' }, [xs[0] - 2, TOP_Y - 6]], z: 'f', col: 'yarn' }, feed({ ring: 'H1', at: 'top' })], arrows: [], tags: [], marks: rowDone() }
  s.tags = hands('편물을 잡고 검지에 실 걸기', '코바늘 잡기')
  L.push(st(s, '단의 끝까지 떴어요. 다음 단을 뜨려면 먼저 그 단의 코 높이만큼 사슬을 세워야 해요. 이 사슬이 기둥코예요.'))

  s = clone(s)
  s.rings = { H2: loop(34, 'work') }
  s.needles.H = H(xs[0] - 30, 196)
  s.marks = [...rowDone(), ...[0, 1, 2].map((i) => ({ id: `t${i}`, kind: 'chain' as const, at: [xs[0] - 18 - i * 4, TOP_Y - 14 - i * 14] as [number, number], col: 'work' as const }))]
  s.yarn = [feed({ ring: 'H2', at: 'top' })]
  s.tags = hands(SAME, '사슬 뜨기')
  L.push(st(s, '사슬을 떠요. 짧은뜨기 단이면 1코, 긴뜨기 2코, 한길긴뜨기 3코, 두길긴뜨기 4코예요.'))

  s = clone(s)
  s.arrows = [{ id: 'a', pts: [[560, 330], [370, 372], [180, 330]], t: '편물을 돌려 반대쪽 면으로' }]
  s.tags = hands('편물을 책장 넘기듯 돌리기', '바늘은 그대로')
  L.push(st(s, '편물을 돌려요. 이제 방금 뜬 단의 머리들이 다음에 뜰 코가 됩니다.'))

  s = clone(s)
  s.arrows = []
  mark(s, 'd1t').hl = 1
  s.tags = hands(SAME, SAME)
  L.push(st(s, '도안이 기둥코를 1코로 세면(한길긴뜨기 단이 보통 그래요) 기둥코 바로 아래 코는 건너뛰고 그다음 코(주황색)부터 떠요. 세지 않으면(짧은뜨기 단) 첫 코부터 떠요.'))

  return tut('TURN', '기둥코 세우고 돌리기', '왕복으로 뜰 때 단을 바꾸는 방법이에요. 사슬로 다음 단의 높이를 세우고 편물을 돌려요.', L)
}

/** 코바늘 뜨는 법. 배우는 순서대로 놓았습니다. */
export const CROCHET_TUTORIALS = {
  RING: magicRing(),
  CH: chain(),
  SC: singleCrochet(),
  INC: increase(),
  SC2: decrease(),
  SL: slipStitch(),
  HDC: tall('HDC', '긴뜨기', '실을 한 번 감고 떠서 고리 3개를 한 번에 빼요. 짧은뜨기와 한길긴뜨기의 중간 높이예요.'),
  DC: tall('DC', '한길긴뜨기', '실을 한 번 감고 떠서 고리를 2개씩 두 번 빼요. 목도리와 블랭킷에 많이 쓰는 키 큰 코예요.'),
  TR: tall('TR', '두길긴뜨기', '실을 두 번 감고 떠서 고리를 2개씩 세 번 빼요. 가장 키가 큰 기본 코예요.'),
  TURN: turn(),
}
