import { z } from 'zod'

export const GaugeInput = z.object({ stitches: z.number().min(4).max(60), rows: z.number().min(4).max(90) })
export const SetGaugeInput = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('as_is'), gauge: GaugeInput.nullable().optional() }),
  z.object({ mode: z.literal('recalc'), gauge: GaugeInput }),
  z.object({ mode: z.literal('remeasure'), gauge: GaugeInput.nullable().optional() }),
])
export const ProgressInput = z.object({
  row: z.number().int().min(0),
  stitch: z.number().int().min(0),
  finishingStep: z.number().int().min(0).nullable().optional(),
  memo: z.string().max(500).optional(),
  at: z.string().optional(),
})
export const RingInput = z.object({ row: z.number().int().min(1), x: z.number().int().min(0), color: z.string(), name: z.string().max(40).optional() })
export const RingPatch = z.object({ color: z.string().optional(), name: z.string().max(40).optional() })
