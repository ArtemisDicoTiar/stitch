/**
 * 패턴 IR: 도안 하나를 담는 JSON 문서.
 * 검산과 모든 화면이 이 문서에서 나옵니다. 대바늘과 코바늘이 같은 틀을 씁니다.
 * LLM은 이 문서를 채우기만 하고, 코의 뜻은 코 사전(stitches.ts)에 둡니다.
 */
import { z } from 'zod'

export const CraftSchema = z.enum(['knit', 'crochet'])
export const TermsSchema = z.enum(['kr', 'us', 'uk', 'jp'])
export const SideSchema = z.enum(['RS', 'WS', 'round'])
export const ShapeSchema = z.enum(['flat', 'round', 'spiral'])

/** 3D 형태 템플릿. 맞는 것이 없으면 none (기호 도안과 진행 표시만). */
export const TemplateSchema = z.enum(['hood', 'flat', 'tube', 'hat', 'none'])

const StitchOp = z.object({
  /** 코 사전의 id. 예: k, p, pat, k2tog */
  st: z.string().min(1),
  n: z.number().int().min(1),
  /** 코바늘에서 코를 넣는 자리 */
  into: z.enum(['next', 'same', 'space']).optional(),
  /** 이 조각의 원문 표현. 단계별 안내에 씁니다. */
  text: z.string().optional(),
})

const MarkerOp = z.object({
  marker: z.enum(['place', 'slip', 'remove']),
  text: z.string().optional(),
})

/**
 * 반복을 끝내는 자리.
 * - end: 단 끝까지
 * - marker: 다음 마커까지
 * - remaining: 마지막 n코가 남을 때까지
 * - before_marker: 다음 마커 n코 전까지
 * - before_center: 단의 한가운데 n코 전까지 (코 수가 바뀌어도 가운데를 따라갑니다)
 */
export type Until = 'end' | 'marker' | { remaining: number } | { before_marker: number } | { before_center: number }

export type Op =
  | { st: string; n: number; into?: 'next' | 'same' | 'space'; text?: string }
  | { repeat: Op[]; times: number; text?: string }
  | { repeat: Op[]; until: Until; text?: string }
  | { marker: 'place' | 'slip' | 'remove'; text?: string }

const UntilSchema = z.union([
  z.literal('end'),
  z.literal('marker'),
  z.object({ remaining: z.number().int().min(0) }),
  z.object({ before_marker: z.number().int().min(0) }),
  z.object({ before_center: z.number().int().min(0) }),
])

export const OpSchema: z.ZodType<Op> = z.lazy(() =>
  z.union([
    StitchOp,
    MarkerOp,
    z.object({ repeat: z.array(OpSchema).min(1), times: z.number().int().min(1), text: z.string().optional() }),
    z.object({ repeat: z.array(OpSchema).min(1), until: UntilSchema, text: z.string().optional() }),
  ]),
)

export const RowSchema = z.object({
  side: SideSchema,
  ops: z.array(OpSchema),
  /** 도안에 적힌 코 수. 검산 기준입니다. */
  expect_count: z.number().int().min(0).optional(),
  /** 원문 지시문 */
  text: z.string(),
  /** 단의 이름. 없으면 "n단"으로 붙입니다. */
  label: z.string().optional(),
  /** 원문에서의 위치 (쪽, 상자). 확인 화면에서 강조하는 데 씁니다. */
  source: z
    .object({ page: z.number().int().min(1), box: z.tuple([z.number(), z.number(), z.number(), z.number()]) })
    .optional(),
})

export const RepeatSchema = z.union([
  z.object({ times: z.number().int().min(1) }),
  z.object({
    until_cm: z.number().positive(),
    /** 길이를 재기 시작하는 구간의 id. 그 구간의 첫 단부터 잽니다. */
    from: z.string(),
    /** 사람이 확인한 단수. 있으면 게이지 추정 대신 이 값을 씁니다. */
    rows: z.number().int().min(0).optional(),
  }),
])

export const RowGroupSchema = z.object({
  rows: z.array(RowSchema).min(1),
  repeat: RepeatSchema,
})

export const SectionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  shape: ShapeSchema,
  start: z.object({
    kind: z.enum(['cast_on', 'chain', 'ring', 'continue']),
    count: z.number().int().min(0),
    from: z.string().optional(),
  }),
  /** 무늬 반복 단위. 코 수 = of × k + plus. 게이지 재계산이 지킵니다. */
  multiple: z.object({ of: z.number().int().min(1), plus: z.number().int().min(0) }).optional(),
  groups: z.array(RowGroupSchema),
})

export const GaugeSchema = z.object({
  stitches: z.number().positive(),
  rows: z.number().positive(),
  over_cm: z.literal(10),
  in_stitch: z.string(),
  tool_mm: z.number().positive(),
})

export const PatternSchema = z.object({
  craft: CraftSchema,
  terms: TermsSchema,
  title: z.string(),
  materials: z.array(z.object({ kind: z.string(), spec: z.string(), qty: z.string().optional() })),
  gauge: GaugeSchema.nullable(),
  finished: z.object({ width_cm: z.number().positive().optional(), height_cm: z.number().positive().optional() }),
  /** 3D 형태 템플릿. LLM이 고르고 확인 화면에서 바꿀 수 있습니다. */
  template: TemplateSchema.optional(),
  sections: z.array(SectionSchema),
  finishing: z.array(z.object({ name: z.string(), text: z.string() })),
  /**
   * 글로 옮기지 못해 사람이 원문을 봐야 하는 곳.
   * picture_only: 그림이나 도식으로만 설명된 부분, unclear: 읽었지만 뜻이 애매한 부분
   */
  notes: z
    .array(z.object({ kind: z.enum(['picture_only', 'unclear']), page: z.number().int().min(1).optional(), text: z.string() }))
    .optional(),
})

export type Craft = z.infer<typeof CraftSchema>
export type Terms = z.infer<typeof TermsSchema>
export type Side = z.infer<typeof SideSchema>
export type Shape = z.infer<typeof ShapeSchema>
export type Template = z.infer<typeof TemplateSchema>
export type Row = z.infer<typeof RowSchema>
export type Repeat = z.infer<typeof RepeatSchema>
export type RowGroup = z.infer<typeof RowGroupSchema>
export type Section = z.infer<typeof SectionSchema>
export type Gauge = z.infer<typeof GaugeSchema>
export type Pattern = z.infer<typeof PatternSchema>
export type PatternNote = NonNullable<Pattern['notes']>[number]

/** 치수만 담은 게이지 (10cm 기준 코와 단) */
export type GaugeSize = { stitches: number; rows: number }

export function parsePattern(input: unknown): Pattern {
  return PatternSchema.parse(input)
}

export function safeParsePattern(input: unknown) {
  return PatternSchema.safeParse(input)
}

/** IR의 JSON 스키마. 문서화와 외부 검증에 씁니다. */
export function patternJsonSchema(): unknown {
  return z.toJSONSchema(PatternSchema, { reused: 'ref' })
}
