/**
 * LLM 호출을 어댑터 뒤에 둡니다.
 *  - AnthropicLlm: Claude API를 부릅니다. PDF를 그대로 주고 JSON 스키마에 맞는 응답만 받습니다.
 *  - ReplayLlm: 녹화해 둔 응답을 돌려줍니다. LLM을 부르지 않고도 전체 테스트가 돕니다.
 *  - RecordingLlm: 다른 어댑터를 감싸 응답을 파일로 남깁니다.
 * LLM에는 도구를 주지 않습니다. PDF는 신뢰하지 않는 입력입니다.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { PROMPT_VERSION, SYSTEM } from './prompts'

export type LlmKind = 'outline' | 'rows' | 'feedback'

export type LlmUsage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

export type LlmRequest<T> = {
  kind: LlmKind
  /** 같은 PDF인지 가리는 값 */
  pdfSha256: string
  pdf: Uint8Array
  prompt: string
  schema: z.ZodType<T>
}

export type LlmResponse<T> = { output: T; usage: LlmUsage; model: string }

export interface Llm {
  call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>>
}

/**
 * 읽기 오류. message는 방문자에게 그대로 보여 줄 수 있는 글입니다.
 * detail은 운영하는 사람만 보는 까닭(API가 돌려준 글 등)으로, 화면에는 내보내지 않고 서버 기록에만 남깁니다.
 */
export class ReaderError extends Error {
  constructor(
    message: string,
    public code: 'no_api_key' | 'auth' | 'rate_limit' | 'refused' | 'truncated' | 'bad_output' | 'no_recording' | 'api' | 'no_credit' | 'unsupported',
    public detail?: string,
  ) {
    super(message)
    this.name = 'ReaderError'
  }
}

/** 방문자에게는 까닭을 밝히지 않는 오류에 쓰는 글 */
const UNAVAILABLE = '지금은 PDF 읽기를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.'

export const ZERO_USAGE: LlmUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
  }
}

export type AnthropicLlmOptions = {
  apiKey?: string | null
  model?: string
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** 안전 분류기가 요청을 거절했을 때 다른 모델로 이어 가는 서버 쪽 대체. 기본으로 켭니다. */
  fallbacks?: boolean
  client?: Anthropic
}

export class AnthropicLlm implements Llm {
  private client: Anthropic
  private model: string
  private effort: NonNullable<AnthropicLlmOptions['effort']>
  private fallbacks: boolean

  constructor(options: AnthropicLlmOptions = {}) {
    this.client = options.client ?? new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {})
    this.model = options.model ?? 'claude-opus-5-5'
    this.effort = options.effort ?? 'high'
    this.fallbacks = options.fallbacks ?? true
  }

  async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    try {
      // 출력이 길 수 있어 스트리밍으로 받고, 끝난 메시지만 씁니다.
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 64000,
        ...(this.fallbacks ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
        thinking: { type: 'adaptive' },
        output_config: { effort: this.effort, format: betaZodOutputFormat(req.schema) },
        system: [{ type: 'text', text: SYSTEM }],
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(req.pdf).toString('base64') },
                // 개요, 구간별 단, 되먹임 호출이 같은 PDF를 다시 읽으므로 여기까지를 캐시합니다.
                cache_control: { type: 'ephemeral' },
              },
              { type: 'text', text: req.prompt },
            ],
          },
        ],
      })
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') {
        throw new ReaderError('이 PDF는 읽기 요청이 거절되었습니다. 뜨개 도안 PDF인지 확인해 주세요.', 'refused')
      }
      if (message.stop_reason === 'max_tokens') {
        throw new ReaderError('도안이 길어 한 번에 다 옮기지 못했습니다.', 'truncated')
      }
      const parsed = req.schema.safeParse(message.parsed_output)
      if (!parsed.success) throw new ReaderError('읽은 결과가 정해진 형식에 맞지 않습니다.', 'bad_output')
      const u = message.usage
      return {
        output: parsed.data,
        model: message.model,
        usage: {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
        },
      }
    } catch (error) {
      if (error instanceof ReaderError) throw error
      // 키와 결제에 관한 까닭은 방문자에게 보여 주지 않습니다. 운영하는 사람이 서버 기록에서 봅니다.
      if (error instanceof Anthropic.AuthenticationError) throw new ReaderError(UNAVAILABLE, 'auth', 'Claude API 키가 올바르지 않습니다. ANTHROPIC_API_KEY를 확인해 주세요.')
      if (error instanceof Anthropic.RateLimitError) throw new ReaderError('요청이 몰려 지금은 읽을 수 없습니다. 잠시 뒤 다시 시도해 주세요.', 'rate_limit', error.message)
      if (error instanceof Anthropic.APIError) {
        const detail = `Claude API 오류 (${error.status ?? '연결 실패'}): ${error.message}`
        if (/credit balance/i.test(error.message)) throw new ReaderError(UNAVAILABLE, 'no_credit', `${detail} — Anthropic 콘솔에서 크레딧을 충전해야 합니다.`)
        throw new ReaderError(UNAVAILABLE, 'api', detail)
      }
      throw error
    }
  }
}

// ---------------------------------------------------------------------------

type Recording = { kind: LlmKind; key: string; promptVersion: string; model: string; usage: LlmUsage; output: unknown; note?: string }

function requestKey(req: { kind: LlmKind; pdfSha256: string; prompt: string }): string {
  return createHash('sha256').update(`${PROMPT_VERSION}\n${req.kind}\n${req.pdfSha256}\n${req.prompt}`).digest('hex').slice(0, 16)
}

function recordingDir(root: string, pdfSha256: string): string {
  return join(root, pdfSha256.slice(0, 16))
}

/**
 * 녹화한 응답을 돌려줍니다.
 * 파일은 <폴더>/<PDF 해시 앞 16자>/<순번>-<종류>.json 이고, 같은 종류의 요청은 순번대로 꺼냅니다.
 */
export class ReplayLlm implements Llm {
  private cursor = new Map<string, number>()
  constructor(private root: string) {}

  static has(root: string, pdfSha256: string): boolean {
    return existsSync(join(recordingDir(root, pdfSha256), '1-outline.json'))
  }

  async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    const dir = recordingDir(this.root, req.pdfSha256)
    const n = (this.cursor.get(req.pdfSha256) ?? 0) + 1
    this.cursor.set(req.pdfSha256, n)
    const file = join(dir, `${n}-${req.kind}.json`)
    if (!existsSync(file)) {
      throw new ReaderError(`녹화해 둔 응답이 없습니다: ${file}`, 'no_recording')
    }
    const rec = JSON.parse(readFileSync(file, 'utf8')) as Recording
    const parsed = req.schema.safeParse(rec.output)
    if (!parsed.success) throw new ReaderError(`녹화한 응답이 형식에 맞지 않습니다: ${file}`, 'bad_output')
    return { output: parsed.data, usage: rec.usage ?? ZERO_USAGE, model: rec.model ?? 'replay' }
  }
}

/** 다른 어댑터를 감싸 응답을 남깁니다. 나중에 ReplayLlm으로 그대로 재생할 수 있습니다. */
export class RecordingLlm implements Llm {
  private count = new Map<string, number>()
  constructor(
    private inner: Llm,
    private root: string,
  ) {}

  async call<T>(req: LlmRequest<T>): Promise<LlmResponse<T>> {
    const res = await this.inner.call(req)
    const dir = recordingDir(this.root, req.pdfSha256)
    mkdirSync(dir, { recursive: true })
    const n = (this.count.get(req.pdfSha256) ?? 0) + 1
    this.count.set(req.pdfSha256, n)
    const rec: Recording = { kind: req.kind, key: requestKey(req), promptVersion: PROMPT_VERSION, model: res.model, usage: res.usage, output: res.output }
    writeFileSync(join(dir, `${n}-${req.kind}.json`), JSON.stringify(rec, null, 1))
    return res
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}
