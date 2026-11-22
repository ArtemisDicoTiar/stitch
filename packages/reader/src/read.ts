/**
 * PDF 읽기 파이프라인.
 *   꺼내기 → LLM 구조화(개요, 구간별 단) → 엔진 검산 → 되먹임 → 사람 확인으로 넘기기
 * LLM은 PDF를 IR 초안으로 바꾸는 일만 하고, 그 결과는 엔진 검산과 사람 확인을 거쳐야 페이지가 됩니다.
 */
import { normalizeStarts, verify, withTermNotes, type Verification } from '@stitch/engine'
import { safeParsePattern, type Issue, type Pattern } from '@stitch/pattern-ir'
import { extractPages, locateText, type SourceHit, type SourcePage } from './extract'
import { addUsage, ReaderError, sha256, ZERO_USAGE, type Llm, type LlmUsage } from './llm'
import { feedbackPrompt, OUTLINE_PROMPT, rowsPrompt } from './prompts'
import { OutlineSchema, RowsSchema, toGroups, toPattern, type Outline } from './wire'

export type ReadStage = 'extract' | 'structure' | 'verify' | 'feedback' | 'review'

export type CrochetScope = 'none' | 'rounds' | 'all'

/** 받지 않는 도안이면 사람에게 보여 줄 까닭을, 받으면 null을 돌려줍니다. */
export function outOfScope(outline: Pick<Outline, 'craft' | 'sections'>, scope: CrochetScope): string | null {
  if (outline.craft !== 'crochet' || scope === 'all') return null
  if (scope === 'none') return '코바늘 도안 읽기는 아직 준비 중이에요. 지금은 대바늘 도안만 읽습니다.'
  const rounds = outline.sections.every((s) => s.shape !== 'flat' && (s.start.kind === 'ring' || s.start.kind === 'continue'))
  return rounds ? null : '코바늘은 지금 매직링에서 시작해 둥글게 뜨는 도안(인형, 소품)만 읽어요. 평면으로 뜨거나 사슬에서 시작하는 도안은 준비 중이에요.'
}

export type ReadOptions = {
  llm: Llm
  /** 검산에서 어긋난 구간을 LLM에 되돌리는 최대 횟수. 넘기면 "확인 필요"로 사람에게 넘깁니다. */
  maxFeedbackRounds?: number
  /**
   * 코바늘 도안을 어디까지 받을지. 기본은 받지 않습니다 (none).
   * - rounds: 매직링에서 시작해 둥글게 뜨는 도안만 (인형, 소품)
   * - all: 모두
   * 받지 않는 도안은 개요에서 판별해, 단을 읽기 전에 까닭을 알리며 멈춥니다.
   */
  crochet?: CrochetScope
  onStage?: (stage: ReadStage, detail?: { round?: number; llmCalls: number; usage: LlmUsage }) => void | Promise<void>
}

export type ReadResult = {
  pattern: Pattern
  verification: Verification
  pages: SourcePage[]
  pdfSha256: string
  llmCalls: number
  feedbackRounds: number
  usage: LlmUsage
  /** 사람이 확인해야 하는지: 끝까지 맞지 않은 단, 길이로 적힌 구간, 경고 */
  needsReview: boolean
}

export async function readPattern(pdf: Uint8Array, options: ReadOptions): Promise<ReadResult> {
  const { llm } = options
  const maxRounds = options.maxFeedbackRounds ?? 2
  const pdfSha256 = sha256(pdf)
  let usage = ZERO_USAGE
  let llmCalls = 0
  const stage = (s: ReadStage, round?: number) => options.onStage?.(s, { round, llmCalls, usage })

  await stage('extract')
  let pages: SourcePage[] = []
  try {
    pages = await extractPages(pdf)
  } catch (error) {
    // 글을 꺼내지 못해도(스캔본 등) LLM은 쪽 이미지로 읽을 수 있습니다. 원문 위치 강조만 빠집니다.
    // 조용히 넘어가면 배포에서만 실패할 때 알 길이 없어 까닭을 남깁니다.
    console.warn(`[reader] PDF에서 글 위치를 꺼내지 못했습니다: ${error instanceof Error ? error.message : String(error)}`)
    pages = []
  }

  await stage('structure')
  const outline = await llm.call({ kind: 'outline', pdfSha256, pdf, prompt: OUTLINE_PROMPT, schema: OutlineSchema })
  usage = addUsage(usage, outline.usage)
  llmCalls += 1
  if (outline.output.sections.length === 0) throw new ReaderError('이 PDF에서 뜨개 도안의 구간을 찾지 못했습니다.', 'bad_output')
  // 단을 읽는 호출이 가장 비쌉니다. 받지 않는 도안은 그 전에 돌려보냅니다.
  const refused = outOfScope(outline.output, options.crochet ?? 'none')
  if (refused) throw new ReaderError(refused, 'unsupported')

  const rows = await llm.call({ kind: 'rows', pdfSha256, pdf, prompt: rowsPrompt(outline.output), schema: RowsSchema })
  usage = addUsage(usage, rows.usage)
  llmCalls += 1

  const parsed = safeParsePattern(toPattern(outline.output, rows.output))
  if (!parsed.success) throw new ReaderError('읽은 결과가 도안 형식에 맞지 않습니다.', 'bad_output')
  // 매직링의 첫 단이 시작 코 수와 단, 두 군데에 적혀 오면 되먹임으로는 고칠 수 없어 여기서 바로잡습니다.
  let pattern = normalizeStarts(parsed.data)

  await stage('verify')
  let verification = verify(pattern)
  let feedbackRounds = 0

  while (!verification.ok && feedbackRounds < maxRounds) {
    feedbackRounds += 1
    await stage('feedback', feedbackRounds)
    // 앞 구간이 틀리면 뒤 구간도 따라 어긋나므로, 앞에서부터 한 구간씩 고치고 바로 다시 검산합니다.
    const tried = new Set<string>()
    let changed = false
    for (;;) {
      const bySection = groupBySection(pattern, verification.errors)
      const first = pattern.sections.find((s) => bySection.has(s.id))
      if (!first || tried.has(first.id)) break
      tried.add(first.id)
      const res = await llm.call({ kind: 'feedback', pdfSha256, pdf, prompt: feedbackPrompt(pattern, first.id, bySection.get(first.id)!), schema: RowsSchema })
      usage = addUsage(usage, res.usage)
      llmCalls += 1
      const fixed = res.output.sections.find((s) => s.id === first.id) ?? res.output.sections[0]
      if (!fixed) break
      const next: Pattern = { ...pattern, sections: pattern.sections.map((s) => (s.id === first.id ? { ...s, groups: toGroups(fixed.groups) } : s)) }
      const ok = safeParsePattern(next)
      if (!ok.success) break
      pattern = normalizeStarts(ok.data)
      changed = true
      verification = verify(pattern)
      if (verification.ok) break
    }
    await stage('verify', feedbackRounds)
    if (!changed) break
  }

  pattern = withTermNotes(attachSources(pattern, pages))
  verification = verify(pattern)
  await stage('review')
  return { pattern, verification, pages, pdfSha256, llmCalls, feedbackRounds, usage, needsReview: verification.needsReview || verification.notes.length > 0 || (pattern.notes?.length ?? 0) > 0 }
}

/** 어긋난 단을 구간별로 모읍니다. 구간 사이가 이어지지 않는 오류는 뒤 구간에 붙입니다. */
function groupBySection(pattern: Pattern, errors: Issue[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>()
  for (const e of errors) {
    const si = e.ref?.section
    const section = si !== undefined ? pattern.sections[si] : undefined
    if (!section) continue
    const list = out.get(section.id) ?? []
    list.push(e)
    out.set(section.id, list)
  }
  return out
}

/** 단마다 원문에서의 위치를 붙입니다. 도안은 뜨는 순서대로 적혀 있으므로 앞에서 찾은 자리 뒤에서 찾습니다. */
export function attachSources(pattern: Pattern, pages: SourcePage[]): Pattern {
  if (pages.length === 0) return pattern
  let cursor: SourceHit | null = null
  return {
    ...pattern,
    sections: pattern.sections.map((s) => ({
      ...s,
      groups: s.groups.map((g) => ({
        ...g,
        rows: g.rows.map((r) => {
          const hit = locateText(pages, r.text, cursor)
          if (!hit) return r
          cursor = hit
          return { ...r, source: { page: hit.page, box: hit.box } }
        }),
      })),
    })),
  }
}
