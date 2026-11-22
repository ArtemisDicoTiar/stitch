/**
 * LLM이 채우는 형식. IR과 뜻은 같지만 JSON 스키마 제약(재귀 금지, 모든 필드 필수)에 맞춰
 * 반복을 세 겹까지만 허용하고, 없는 값은 null로 받습니다.
 * LLM의 응답은 이 스키마와 엔진 검산을 통과한 것만 씁니다.
 */
import { z } from 'zod'
import type { Op, Pattern, RowGroup, Section, Until } from '@stitch/pattern-ir'

const text = z.string().nullable().describe('이 조각의 원문 표현. 없으면 null')

const StitchW = z.object({
  op: z.literal('st'),
  st: z.string().describe('코 사전의 id. 대바늘 예: k, p, pat, yo, k2tog, ssk. 코바늘 예: ch, sc, dc, inc, sc2tog, skip, tch'),
  n: z.number().int().describe('이 코를 몇 번 뜨는지'),
  into: z
    .enum(['next', 'one', 'same', 'space'])
    .nullable()
    .describe('코바늘에서 코를 넣는 자리. next: 다음 코들에 하나씩, one: n코를 다음 한 코에 모두, same: 방금 뜬 자리에 n코 더, space: 다음 사슬 공간이나 매직링에 n코. 대바늘과, 다음 코에 하나씩 뜨는 보통의 경우는 null'),
  text,
})
const MarkerW = z.object({ op: z.literal('marker'), action: z.enum(['place', 'slip', 'remove']), text })
const EndW = z.object({
  kind: z.enum(['times', 'end', 'marker', 'remaining', 'before_marker', 'before_center']),
  n: z.number().int().describe('times: 반복 횟수, remaining: 남길 코 수, before_marker/before_center: 그 앞에서 멈출 코 수. end와 marker는 0'),
})

const Leaf = z.union([StitchW, MarkerW])
const Repeat3 = z.object({ op: z.literal('repeat'), body: z.array(Leaf), end: EndW, text })
const Level2 = z.union([StitchW, MarkerW, Repeat3])
const Repeat2 = z.object({ op: z.literal('repeat'), body: z.array(Level2), end: EndW, text })
const Level1 = z.union([StitchW, MarkerW, Repeat2])

const RowW = z.object({
  side: z.enum(['RS', 'WS', 'round']),
  label: z.string().nullable().describe('도안이 붙인 단 이름. 없으면 null'),
  text: z.string().describe('이 단의 원문 지시문. 도안에 적힌 그대로'),
  expect_count: z.number().int().nullable().describe('도안에 이 단을 뜬 뒤의 코 수가 적혀 있으면 그 수. 없으면 null. 계산해서 넣지 않는다'),
  ops: z.array(Level1),
})

const GroupW = z.object({
  rows: z.array(RowW),
  repeat: z.object({
    kind: z.enum(['times', 'until_cm']),
    times: z.number().int().describe('kind가 times일 때 이 묶음을 반복하는 횟수. until_cm이면 0'),
    cm: z.number().describe('kind가 until_cm일 때의 길이(cm). times면 0'),
    from: z.string().describe('until_cm일 때 길이를 재기 시작하는 구간의 id. times면 빈 문자열'),
  }),
})

export const OutlineSchema = z.object({
  craft: z.enum(['knit', 'crochet']),
  terms: z.enum(['kr', 'us', 'uk', 'jp']).describe('약어 체계'),
  title: z.string(),
  materials: z.array(z.object({ kind: z.string(), spec: z.string(), qty: z.string().nullable() })),
  gauge: z
    .object({
      stitches: z.number(),
      rows: z.number(),
      in_stitch: z.string().describe('게이지를 잰 무늬. 예: 메리야스뜨기'),
      tool_mm: z.number().describe('바늘 굵기(mm)'),
    })
    .nullable()
    .describe('10cm 기준 게이지. 도안에 없으면 null'),
  finished: z.object({ width_cm: z.number().nullable(), height_cm: z.number().nullable() }),
  template: z.enum(['hood', 'flat', 'tube', 'hat', 'none']).describe('완성 형태에 가장 가까운 3D 템플릿. 맞는 것이 없으면 none'),
  sections: z.array(
    z.object({
      id: z.string().describe('영문 소문자와 숫자로 된 짧은 id'),
      name: z.string().describe('도안에 적힌 구간 이름'),
      shape: z.enum(['flat', 'round', 'spiral']),
      start: z.object({
        kind: z.enum(['cast_on', 'chain', 'ring', 'continue']),
        count: z.number().int().describe('이 구간을 시작할 때의 코 수'),
        from: z.string().nullable().describe('continue일 때 이어지는 앞 구간의 id'),
      }),
      multiple: z.object({ of: z.number().int(), plus: z.number().int() }).nullable().describe('무늬 반복 단위. 코 수 = of × k + plus'),
    }),
  ),
  finishing: z.array(z.object({ name: z.string(), text: z.string() })),
  unclear: z
    .array(
      z.object({
        kind: z.enum(['picture_only', 'unclear']).describe('picture_only: 그림이나 도식으로만 설명되어 글로 옮길 수 없는 부분. unclear: 읽었지만 뜻이 애매한 부분'),
        page: z.number().int().nullable().describe('그 부분이 있는 쪽 번호. 모르면 null'),
        text: z.string().describe('무엇이 어디에 그림으로만 나와 있는지 한 문장으로'),
      }),
    )
    .describe('사람이 원문을 직접 봐야 하는 곳. 없으면 빈 배열'),
})

export const RowsSchema = z.object({
  sections: z.array(z.object({ id: z.string(), groups: z.array(GroupW) })),
})

export type Outline = z.infer<typeof OutlineSchema>
export type WireRows = z.infer<typeof RowsSchema>
type WireOp = z.infer<typeof Level1>
type WireEnd = z.infer<typeof EndW>

function toUntil(end: WireEnd): Until | null {
  switch (end.kind) {
    case 'end':
      return 'end'
    case 'marker':
      return 'marker'
    case 'remaining':
      return { remaining: Math.max(0, end.n) }
    case 'before_marker':
      return { before_marker: Math.max(0, end.n) }
    case 'before_center':
      return { before_center: Math.max(0, end.n) }
    default:
      return null
  }
}

function toOp(w: WireOp | z.infer<typeof Level2> | z.infer<typeof Leaf>): Op {
  const t = w.text ? { text: w.text } : {}
  if (w.op === 'st') return { st: w.st.trim().toLowerCase(), n: Math.max(1, w.n), ...(w.into && w.into !== 'next' ? { into: w.into } : {}), ...t }
  if (w.op === 'marker') return { marker: w.action, ...t }
  const body = (w.body as (WireOp | z.infer<typeof Leaf>)[]).map(toOp)
  const until = toUntil(w.end)
  return until === null ? { repeat: body, times: Math.max(1, w.end.n), ...t } : { repeat: body, until, ...t }
}

export function toGroups(groups: WireRows['sections'][number]['groups']): RowGroup[] {
  return groups
    .filter((g) => g.rows.length > 0)
    .map((g) => ({
      rows: g.rows.map((r) => ({
        side: r.side,
        ops: r.ops.map(toOp),
        text: r.text,
        ...(r.label ? { label: r.label } : {}),
        ...(r.expect_count !== null && r.expect_count >= 0 ? { expect_count: r.expect_count } : {}),
      })),
      repeat: g.repeat.kind === 'until_cm' ? { until_cm: g.repeat.cm, from: g.repeat.from } : { times: Math.max(1, g.repeat.times) },
    }))
}

/** 두 번의 응답(개요, 구간별 단)을 IR 하나로 합칩니다. */
export function toPattern(outline: Outline, rows: WireRows): Pattern {
  const byId = new Map(rows.sections.map((s) => [s.id, s.groups]))
  const sections: Section[] = outline.sections.map((s) => ({
    id: s.id,
    name: s.name,
    shape: s.shape,
    start: { kind: s.start.kind, count: Math.max(0, s.start.count), ...(s.start.from ? { from: s.start.from } : {}) },
    ...(s.multiple && s.multiple.of > 0 ? { multiple: { of: s.multiple.of, plus: Math.max(0, s.multiple.plus) } } : {}),
    groups: toGroups(byId.get(s.id) ?? []),
  }))
  return {
    craft: outline.craft,
    terms: outline.terms,
    title: outline.title,
    materials: outline.materials.map((m) => ({ kind: m.kind, spec: m.spec, ...(m.qty ? { qty: m.qty } : {}) })),
    gauge:
      outline.gauge && outline.gauge.stitches > 0 && outline.gauge.rows > 0
        ? { stitches: outline.gauge.stitches, rows: outline.gauge.rows, over_cm: 10, in_stitch: outline.gauge.in_stitch, tool_mm: outline.gauge.tool_mm > 0 ? outline.gauge.tool_mm : 4 }
        : null,
    finished: {
      ...(outline.finished.width_cm && outline.finished.width_cm > 0 ? { width_cm: outline.finished.width_cm } : {}),
      ...(outline.finished.height_cm && outline.finished.height_cm > 0 ? { height_cm: outline.finished.height_cm } : {}),
    },
    template: outline.template,
    sections,
    finishing: outline.finishing,
    ...(outline.unclear.length > 0
      ? { notes: outline.unclear.map((n) => ({ kind: n.kind, text: n.text, ...(n.page && n.page > 0 ? { page: n.page } : {}) })) }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// IR → LLM 형식. 테스트용 응답을 만들거나 되먹임 프롬프트에 지금 상태를 보여 줄 때 씁니다.

function fromUntil(u: Until): WireEnd {
  if (u === 'end') return { kind: 'end', n: 0 }
  if (u === 'marker') return { kind: 'marker', n: 0 }
  if ('remaining' in u) return { kind: 'remaining', n: u.remaining }
  if ('before_marker' in u) return { kind: 'before_marker', n: u.before_marker }
  return { kind: 'before_center', n: u.before_center }
}

function fromOp(op: Op, depth: number): WireOp {
  const text = op.text ?? null
  if ('st' in op) return { op: 'st', st: op.st, n: op.n, into: op.into && op.into !== 'next' ? op.into : null, text }
  if ('marker' in op) return { op: 'marker', action: op.marker, text }
  if (depth >= 3) throw new Error('반복이 세 겹을 넘는 단은 LLM 형식으로 옮길 수 없습니다.')
  const body = op.repeat.map((o) => fromOp(o, depth + 1))
  const end: WireEnd = 'times' in op ? { kind: 'times', n: op.times } : fromUntil(op.until)
  return { op: 'repeat', body, end, text } as WireOp
}

export function toWire(pattern: Pattern): { outline: Outline; rows: WireRows } {
  const outline: Outline = {
    craft: pattern.craft,
    terms: pattern.terms,
    title: pattern.title,
    materials: pattern.materials.map((m) => ({ kind: m.kind, spec: m.spec, qty: m.qty ?? null })),
    gauge: pattern.gauge ? { stitches: pattern.gauge.stitches, rows: pattern.gauge.rows, in_stitch: pattern.gauge.in_stitch, tool_mm: pattern.gauge.tool_mm } : null,
    finished: { width_cm: pattern.finished.width_cm ?? null, height_cm: pattern.finished.height_cm ?? null },
    template: pattern.template ?? 'none',
    sections: pattern.sections.map((s) => ({
      id: s.id,
      name: s.name,
      shape: s.shape,
      start: { kind: s.start.kind, count: s.start.count, from: s.start.from ?? null },
      multiple: s.multiple ?? null,
    })),
    finishing: pattern.finishing,
    unclear: (pattern.notes ?? []).map((n) => ({ kind: n.kind, page: n.page ?? null, text: n.text })),
  }
  const rows: WireRows = {
    sections: pattern.sections.map((s) => ({
      id: s.id,
      groups: s.groups.map((g) => ({
        rows: g.rows.map((r) => ({
          side: r.side,
          label: r.label ?? null,
          text: r.text,
          expect_count: r.expect_count ?? null,
          ops: r.ops.map((o) => fromOp(o, 1)),
        })),
        repeat: 'times' in g.repeat ? { kind: 'times' as const, times: g.repeat.times, cm: 0, from: '' } : { kind: 'until_cm' as const, times: 0, cm: g.repeat.until_cm, from: g.repeat.from },
      })),
    })),
  }
  return { outline, rows }
}
