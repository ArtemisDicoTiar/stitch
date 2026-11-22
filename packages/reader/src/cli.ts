#!/usr/bin/env node
/**
 * PDF 한 개를 읽어 IR과 검산 결과를 출력합니다.
 *   pnpm reader private/도안.pdf                 Claude API로 읽기 (ANTHROPIC_API_KEY 필요)
 *   pnpm reader private/도안.pdf --record        읽으면서 응답을 data/recordings 에 남기기
 *   pnpm reader fixtures/reading/practice-hood.pdf --replay fixtures/reading/recordings
 *   pnpm reader <pdf> --out private/도안.ir.json  IR을 파일로 저장
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { AnthropicLlm, ReaderError, RecordingLlm, ReplayLlm, readPattern, type Llm } from './index'

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const value = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined
}
const valueFlags = new Set(['--out', '--model', '--max-feedback', '--replay'])
const file = args.find((a, i) => !a.startsWith('--') && !valueFlags.has(args[i - 1]))

if (!file || flag('--help')) {
  console.log('사용법: pnpm reader <도안.pdf> [--record] [--replay <폴더>] [--out <파일.json>] [--model <모델>] [--max-feedback <횟수>]')
  process.exit(file ? 0 : 1)
}

const root = process.cwd()
for (const envFile of [join(root, '.env')]) if (existsSync(envFile)) process.loadEnvFile(envFile)

const pdfPath = resolve(root, file)
if (!existsSync(pdfPath)) {
  console.error(`파일이 없습니다: ${pdfPath}`)
  process.exit(1)
}
const pdf = new Uint8Array(readFileSync(pdfPath))
const recordingsDir = resolve(root, process.env.READER_RECORDINGS_DIR || './data/recordings')

let llm: Llm
if (flag('--replay')) {
  llm = new ReplayLlm(resolve(root, value('--replay') ?? recordingsDir))
} else {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY가 없습니다. .env에 키를 넣거나, --replay <폴더> 로 남겨 둔 응답을 재생하세요.')
    process.exit(1)
  }
  llm = new AnthropicLlm({ model: value('--model') ?? process.env.READER_MODEL })
  if (flag('--record')) llm = new RecordingLlm(llm, recordingsDir)
}

try {
  const started = Date.now()
  const r = await readPattern(pdf, {
    llm,
    maxFeedbackRounds: Number(value('--max-feedback') ?? process.env.READER_MAX_FEEDBACK ?? 2),
    onStage: (s, d) => console.error(`· ${s}${d?.round ? ` (${d.round}회)` : ''}`),
  })
  const e = r.verification.expanded
  const out = value('--out')
  if (out) writeFileSync(resolve(root, out), JSON.stringify(r.pattern, null, 1))
  else console.log(JSON.stringify(r.pattern, null, 1))
  const u = r.usage
  console.error(
    [
      '',
      `제목: ${r.pattern.title} (${r.pattern.craft})`,
      `구간: ${e.sections.map((s) => `${s.name} ${s.startCount}→${s.endCount}코, ${s.rows}단`).join(' / ')}`,
      `전체 ${e.totalRows}단, ${e.totalStitches}코`,
      `검산: ${r.verification.ok ? '통과' : `실패 (오류 ${r.verification.errors.length}건)`}, 경고 ${r.verification.warnings.length}건, 참고 ${r.verification.notes.length}건`,
      ...r.verification.errors.slice(0, 10).map((i) => `  ✗ ${i.message}`),
      ...r.verification.warnings.slice(0, 10).map((i) => `  ! ${i.message}`),
      `LLM 호출 ${r.llmCalls}번, 되먹임 ${r.feedbackRounds}회, ${((Date.now() - started) / 1000).toFixed(1)}초`,
      `토큰: 입력 ${u.input_tokens} (캐시 읽기 ${u.cache_read_input_tokens}, 캐시 쓰기 ${u.cache_creation_input_tokens}), 출력 ${u.output_tokens}`,
      r.needsReview ? '→ 사람 확인이 필요합니다.' : '→ 바로 쓸 수 있습니다.',
    ].join('\n'),
  )
  process.exit(r.verification.ok ? 0 : 2)
} catch (error) {
  if (error instanceof ReaderError) {
    console.error(`읽지 못했습니다: ${error.message}`)
    process.exit(1)
  }
  throw error
}
