import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { garterScarf, practiceBall, practiceHood } from '@stitch/fixtures'
import type { Pattern } from '@stitch/pattern-ir'
import {
  AnthropicLlm,
  extractPages,
  locateText,
  readPattern,
  RecordingLlm,
  ReplayLlm,
  RowsSchema,
  sha256,
  toPattern,
  toWire,
  ZERO_USAGE,
  type Llm,
  type LlmRequest,
  type LlmResponse,
  type ReadStage,
} from '../src'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const pdf = new Uint8Array(readFileSync(join(root, 'fixtures/reading/practice-hood.pdf')))
const recordings = join(root, 'fixtures/reading/recordings')

/** 원문 위치(source)를 뺀 IR */
const withoutSource = (p: Pattern): Pattern => JSON.parse(JSON.stringify(p, (k, v) => (k === 'source' ? undefined : v)))

describe('LLM 형식과 IR 사이 변환', () => {
  it('IR → LLM 형식 → IR이 같다', () => {
    for (const p of [practiceHood, garterScarf, practiceBall]) {
      const w = toWire(p)
      expect(toPattern(w.outline, w.rows)).toEqual(withoutSource(p))
    }
  })

  it('코를 넣는 자리(into)를 오가며 지킨다. 대바늘과 보통의 경우는 null이다', () => {
    const w = toWire(practiceBall)
    const first = w.rows.sections[0].groups[0].rows[0].ops[0]
    expect(first).toMatchObject({ op: 'st', st: 'sc', n: 6, into: 'space' })
    const knitOp = toWire(garterScarf).rows.sections[0].groups[0].rows[0].ops[0]
    expect(knitOp.op === 'repeat' && knitOp.body[0]).toMatchObject({ op: 'st', st: 'k', into: null })
    // "다음 코에 하나씩"은 따로 적지 않습니다.
    const back = toPattern(w.outline, { sections: [{ id: 'ball', groups: [{ rows: [{ side: 'round', label: null, text: 't', expect_count: null, ops: [{ op: 'st', st: 'SC', n: 2, into: 'next', text: null }, { op: 'st', st: 'dc', n: 5, into: 'one', text: null }] }], repeat: { kind: 'times', times: 1, cm: 0, from: '' } }] }] })
    expect(back.sections[0].groups[0].rows[0].ops).toEqual([{ st: 'sc', n: 2 }, { st: 'dc', n: 5, into: 'one' }])
  })

  it('세 겹을 넘는 반복은 거절한다', () => {
    const deep: Pattern = structuredClone(garterScarf)
    const k = { st: 'k', n: 1 }
    deep.sections[0].groups[0].rows[0].ops = [{ repeat: [{ repeat: [{ repeat: [{ repeat: [k], times: 1 }], times: 1 }], times: 1 }], until: 'end' }]
    expect(() => toWire(deep)).toThrow()
  })
})

describe('고정 PDF에서 글과 위치 꺼내기', () => {
  it('쪽마다 줄과 상자를 뽑는다', async () => {
    const pages = await extractPages(pdf)
    expect(pages.length).toBeGreaterThanOrEqual(1)
    const all = pages.flatMap((p) => p.lines)
    expect(all.some((l) => l.text.includes('연습용 후드 워머'))).toBe(true)
    for (const l of all) {
      expect(l.box.every((v) => v >= 0 && v <= 1)).toBe(true)
      expect(l.box[2]).toBeGreaterThan(l.box[0])
      expect(l.box[3]).toBeGreaterThan(l.box[1])
    }
  })

  it('지시문이 원문의 어디에 있는지 찾는다', async () => {
    const pages = await extractPages(pdf)
    const hit = locateText(pages, practiceHood.sections[1].groups[0].rows[0].text)
    expect(hit).not.toBeNull()
    expect(hit!.page).toBeGreaterThanOrEqual(1)
    expect(locateText(pages, '이 문장은 도안에 없는 전혀 다른 내용입니다 abcdefg')).toBeNull()
  })
})

describe('고정 PDF와 준비해 둔 LLM 응답으로 읽기', () => {
  it('같은 IR이 나오고, 검산 실패 때 되먹임이 동작한다', async () => {
    const stages: ReadStage[] = []
    const r = await readPattern(pdf, { llm: new ReplayLlm(recordings), onStage: (s) => void stages.push(s) })
    expect(withoutSource(r.pattern)).toEqual(withoutSource(practiceHood))
    expect(r.verification.ok).toBe(true)
    expect(r.feedbackRounds).toBe(1)
    expect(r.llmCalls).toBe(3)
    expect(stages).toEqual(['extract', 'structure', 'verify', 'feedback', 'verify', 'review'])
    expect(r.pdfSha256).toBe(sha256(pdf))
  })

  it('단마다 원문 위치가 붙는다', async () => {
    const r = await readPattern(pdf, { llm: new ReplayLlm(recordings) })
    const rows = r.pattern.sections.flatMap((s) => s.groups.flatMap((g) => g.rows))
    const located = rows.filter((x) => x.source)
    expect(located.length / rows.length).toBeGreaterThan(0.8)
  })

  it('준비해 둔 응답이 없는 PDF는 읽지 않고 알려 준다', async () => {
    const other = new Uint8Array([...pdf, 0x0a])
    expect(ReplayLlm.has(recordings, sha256(other))).toBe(false)
    await expect(readPattern(other, { llm: new ReplayLlm(recordings) })).rejects.toMatchObject({ code: 'no_recording' })
  })
})

describe('되먹임 반복', () => {
  /** 구간별 단을 늘 틀리게 돌려주는 가짜 LLM */
  class StubbornLlm implements Llm {
    calls: string[] = []
    async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
      this.calls.push(req.kind)
      const w = toWire(practiceHood)
      const bad = structuredClone(w.rows)
      bad.sections[0].groups[1].rows[0].expect_count = 99
      const output = req.kind === 'outline' ? w.outline : req.kind === 'rows' ? bad : { sections: [bad.sections[0]] }
      return { output: req.schema.parse(output), usage: { ...ZERO_USAGE, input_tokens: 100, output_tokens: 10 }, model: 'stub' }
    }
  }

  it('정해 둔 횟수를 넘기면 "확인 필요"로 사람에게 넘긴다', async () => {
    const llm = new StubbornLlm()
    const r = await readPattern(pdf, { llm, maxFeedbackRounds: 2 })
    expect(llm.calls).toEqual(['outline', 'rows', 'feedback', 'feedback'])
    expect(r.feedbackRounds).toBe(2)
    expect(r.verification.ok).toBe(false)
    expect(r.needsReview).toBe(true)
    expect(r.verification.errors[0]).toMatchObject({ code: 'count_mismatch', expected: 99, actual: 79 })
    expect(r.usage).toMatchObject({ input_tokens: 400, output_tokens: 40 })
  })

  it('되먹임에는 어긋난 단, 도안에 적힌 코 수, 계산된 코 수가 들어간다', async () => {
    const prompts: string[] = []
    const inner = new StubbornLlm()
    const spy: Llm = {
      call: (req) => {
        if (req.kind === 'feedback') prompts.push(req.prompt)
        return inner.call(req)
      },
    }
    await readPattern(pdf, { llm: spy, maxFeedbackRounds: 1 })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain('9단')
    expect(prompts[0]).toContain('도안에 적힌 코 수 99')
    expect(prompts[0]).toContain('계산된 코 수 79')
    expect(prompts[0]).toContain('"neck"')
  })
})

describe('응답 남기기와 다시 재생하기', () => {
  it('남긴 응답을 그대로 재생하면 같은 결과가 나온다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'stitch-rec-'))
    try {
      const first = await readPattern(pdf, { llm: new RecordingLlm(new ReplayLlm(recordings), dir) })
      expect(ReplayLlm.has(dir, first.pdfSha256)).toBe(true)
      const again = await readPattern(pdf, { llm: new ReplayLlm(dir) })
      expect(again.pattern).toEqual(first.pattern)
      expect(again.llmCalls).toBe(first.llmCalls)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('Claude API에 보내는 요청', () => {
  it('PDF를 문서로 먼저 주고, 도구 없이 JSON 스키마 출력만 요청한다', async () => {
    let sent: Record<string, any> | null = null
    const w = toWire(practiceHood)
    const client = {
      beta: {
        messages: {
          stream: (params: Record<string, any>) => {
            sent = params
            return {
              finalMessage: async () => ({
                stop_reason: 'end_turn',
                model: 'claude-opus-5-5',
                parsed_output: w.rows,
                usage: { input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 },
              }),
            }
          },
        },
      },
    }
    const llm = new AnthropicLlm({ client: client as never })
    const res = await llm.call({ kind: 'rows', pdfSha256: 'x', pdf, prompt: '구간별 단', schema: RowsSchema })
    expect(res.usage).toEqual({ input_tokens: 12, output_tokens: 34, cache_read_input_tokens: 5, cache_creation_input_tokens: 6 })
    const p = sent!
    expect(p.model).toBe('claude-opus-5-5')
    expect(p.tools).toBeUndefined()
    expect(p.output_config.format).toBeDefined()
    expect(p.thinking).toEqual({ type: 'adaptive' })
    const [doc, text] = p.messages[0].content
    expect(doc.type).toBe('document')
    expect(doc.source.media_type).toBe('application/pdf')
    expect(doc.source.data).not.toContain('\n')
    expect(doc.cache_control).toEqual({ type: 'ephemeral' })
    expect(text).toEqual({ type: 'text', text: '구간별 단' })
    expect(p.messages).toHaveLength(1)
  })

  it('거절과 잘린 응답은 읽기 오류로 돌려준다', async () => {
    const make = (stop_reason: string) =>
      new AnthropicLlm({
        client: { beta: { messages: { stream: () => ({ finalMessage: async () => ({ stop_reason, model: 'm', parsed_output: null, usage: {} }) }) } } } as never,
      })
    const req = { kind: 'rows' as const, pdfSha256: 'x', pdf, prompt: 'p', schema: RowsSchema }
    await expect(make('refusal').call(req)).rejects.toMatchObject({ code: 'refused' })
    await expect(make('max_tokens').call(req)).rejects.toMatchObject({ code: 'truncated' })
    await expect(make('end_turn').call(req)).rejects.toMatchObject({ code: 'bad_output' })
  })
})

describe('사람이 원문을 봐야 하는 곳', () => {
  it('그림으로만 설명된 부분을 IR에 남긴다', () => {
    const w = toWire(practiceHood)
    const p = toPattern({ ...w.outline, unclear: [{ kind: 'picture_only', page: 2, text: '단추 다는 자리는 2쪽 그림으로만 나와 있습니다.' }] }, w.rows)
    expect(p.notes).toEqual([{ kind: 'picture_only', page: 2, text: '단추 다는 자리는 2쪽 그림으로만 나와 있습니다.' }])
    expect(toWire(p).outline.unclear).toHaveLength(1)
    expect(toPattern(w.outline, w.rows).notes).toBeUndefined()
  })

  it('같은 지시문이 여러 번 나오면 뜨는 순서대로 뒤의 것을 가리킨다', async () => {
    const r = await readPattern(pdf, { llm: new ReplayLlm(recordings) })
    const where = r.pattern.sections.map((s) => s.groups.flatMap((g) => g.rows).filter((x) => x.source).map((x) => x.source!))
    // 구간이 뒤로 갈수록 원문에서도 뒤에 있어야 합니다.
    const last = (xs: { page: number; box: number[] }[]) => xs[xs.length - 1]
    const first = (xs: { page: number; box: number[] }[]) => xs[0]
    const pos = (h: { page: number; box: number[] }) => h.page * 10 + h.box[1]
    expect(pos(first(where[1]))).toBeGreaterThan(pos(last(where[0])) - 1e-6)
    expect(pos(first(where[2]))).toBeGreaterThan(pos(last(where[1])) - 1e-6)
    for (const section of where) for (let i = 1; i < section.length; i++) expect(pos(section[i])).toBeGreaterThanOrEqual(pos(section[i - 1]) - 1e-6)
  })
})

describe('코바늘 도안', () => {
  /** 개요와 단을 직접 쓴 도안에서 만들어 돌려주는 대역 */
  class FromPattern implements Llm {
    kinds: string[] = []
    constructor(private pattern: Pattern) {}
    async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
      this.kinds.push(req.kind)
      const w = toWire(this.pattern)
      const output = req.kind === 'outline' ? w.outline : w.rows
      return { output: req.schema.parse(output) as T, model: 'stub', usage: ZERO_USAGE }
    }
  }

  it('받지 않을 때는 개요만 읽고, 단을 읽기 전에 까닭을 알리며 멈춘다', async () => {
    const llm = new FromPattern(practiceBall)
    await expect(readPattern(pdf, { llm })).rejects.toMatchObject({ name: 'ReaderError', code: 'unsupported', message: expect.stringContaining('코바늘 도안 읽기는 아직 준비 중') })
    expect(llm.kinds).toEqual(['outline'])
  })

  it('받기로 하면 끝까지 읽고 검산한다', async () => {
    const llm = new FromPattern(practiceBall)
    const r = await readPattern(pdf, { llm, allowCrochet: true })
    expect(llm.kinds).toEqual(['outline', 'rows'])
    expect(r.pattern.craft).toBe('crochet')
    expect(r.verification.ok).toBe(true)
    expect(r.verification.expanded.totalRows).toBe(14)
  })

  it('대바늘 도안은 그대로 읽는다', async () => {
    const llm = new FromPattern(garterScarf)
    const r = await readPattern(pdf, { llm })
    expect(r.pattern.craft).toBe('knit')
  })
})
