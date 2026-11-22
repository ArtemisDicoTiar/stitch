/**
 * 읽기(PDF → IR) 테스트에 쓰는 고정 자료를 만듭니다.
 *   pnpm fixtures:reading           PDF가 없을 때만 만들고, 응답 파일은 다시 씁니다
 *   pnpm fixtures:reading --force   PDF부터 다시 만듭니다
 *
 * - reading/practice-hood.pdf: "연습용 후드 워머"를 사람이 읽는 도안처럼 조판한 PDF. 직접 쓴 도안입니다.
 * - reading/recordings/<PDF 해시>/: 그 PDF에 대한 LLM 응답 자리에 넣는 파일.
 *   **실제 LLM 응답을 녹화한 것이 아니라 손으로 만든 대역입니다.** 두 번째 응답에 일부러 틀린 단을 넣어
 *   검산 되먹임이 도는지 확인합니다. API 키가 생기면 `pnpm reader <pdf> --record` 로 진짜 녹화로 바꿉니다.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { PROMPT_VERSION, toWire } from '@stitch/reader'
import type { Pattern } from '@stitch/pattern-ir'
import { practiceHood } from './practice-hood'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'reading')
const pdfPath = join(out, 'practice-hood.pdf')
const force = process.argv.includes('--force')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function html(p: Pattern): string {
  const sections = p.sections
    .map((s) => {
      const start = s.start.kind === 'cast_on' ? `${s.start.count}코를 잡습니다.` : `앞 구간에서 이어서 ${s.start.count}코로 시작합니다.`
      const groups = s.groups
        .map((g) => {
          const rows = g.rows
            .map((r) => {
              const side = r.side === 'RS' ? '겉면' : '안면'
              const count = r.expect_count !== undefined ? ` <b>(${r.expect_count}코)</b>` : ''
              return `<li><span class="side">${r.label ? esc(r.label) + ' · ' : ''}${side}</span> ${esc(r.text)}${count}</li>`
            })
            .join('')
          const rep = 'times' in g.repeat ? (g.repeat.times > 1 ? `<p class="rep">위 ${g.rows.length}단을 ${g.repeat.times}번 뜹니다.</p>` : '') : `<p class="rep">위 ${g.rows.length}단을 되풀이해 고무단 위에서 ${g.repeat.until_cm}cm가 될 때까지 뜹니다.</p>`
          return `<ol>${rows}</ol>${rep}`
        })
        .join('')
      return `<h2>${esc(s.name)}</h2><p>${start}</p>${groups}`
    })
    .join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 10.5pt; line-height: 1.55; color: #222; }
    h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 16pt 0 4pt; border-bottom: 1px solid #999; }
    ol { margin: 4pt 0; padding-left: 18pt; } li { margin: 2pt 0; } .side { color: #555; font-weight: 600; }
    .rep { margin: 2pt 0 8pt 18pt; font-style: italic; } table { border-collapse: collapse; } td { padding: 1pt 12pt 1pt 0; vertical-align: top; }
  </style></head><body>
  <h1>${esc(p.title)}</h1>
  <p>목에서 시작해 머리를 감싸는 후드를 평면으로 뜨는 연습 도안입니다.</p>
  <h2>준비물</h2>
  <table>${p.materials.map((m) => `<tr><td><b>${esc(m.kind)}</b></td><td>${esc(m.spec)}${m.qty ? ' · ' + esc(m.qty) : ''}</td></tr>`).join('')}</table>
  <h2>게이지와 완성 크기</h2>
  <p>게이지: ${p.gauge!.in_stitch} 10cm에 ${p.gauge!.stitches}코 × ${p.gauge!.rows}단 (${p.gauge!.tool_mm}mm 바늘)<br>완성 크기: 가로 ${p.finished.width_cm}cm, 세로 ${p.finished.height_cm}cm</p>
  ${sections}
  <h2>마무리</h2>
  <ol>${p.finishing.map((f) => `<li><b>${esc(f.name)}</b> ${esc(f.text)}</li>`).join('')}</ol>
  </body></html>`
}

mkdirSync(out, { recursive: true })
if (force || !existsSync(pdfPath)) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.setContent(html(practiceHood), { waitUntil: 'load' })
  writeFileSync(pdfPath, await page.pdf({ format: 'A4', printBackground: true }))
  await browser.close()
  console.log('PDF를 만들었습니다:', pdfPath)
}

const sha = createHash('sha256').update(readFileSync(pdfPath)).digest('hex')
const recRoot = join(out, 'recordings')
rmSync(recRoot, { recursive: true, force: true })
const dir = join(recRoot, sha.slice(0, 16))
mkdirSync(dir, { recursive: true })

const NOTE = '손으로 만든 대역입니다. 실제 LLM 응답을 녹화한 것이 아닙니다.'
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const write = (name: string, kind: string, output: unknown) =>
  writeFileSync(join(dir, name), JSON.stringify({ kind, note: NOTE, promptVersion: PROMPT_VERSION, model: 'hand-written', usage, output }, null, 1) + '\n')

const good = toWire(practiceHood)
// 두 번째 응답: 목 고무단의 줄임단에서 "3코 모아뜨기"를 하나 빠뜨리고 읽은 것으로 둡니다.
// 그러면 도안에 적힌 79코와 달리 81코가 되어 검산에 걸립니다.
// (숫자 하나를 잘못 읽은 정도는 뒤의 "마지막 5코 전까지" 반복이 흡수해 코 수 검산으로는 잡히지 않습니다.)
const bad: typeof good.rows = JSON.parse(JSON.stringify(good.rows))
const decRow = bad.sections[0].groups[1].rows[0]
decRow.ops.splice(decRow.ops.findIndex((o) => o.op === 'st' && o.st === 'sk2p'), 1)

write('1-outline.json', 'outline', good.outline)
write('2-rows.json', 'rows', bad)
write('3-feedback.json', 'feedback', { sections: [good.rows.sections[0]] })
writeFileSync(join(out, 'practice-hood.sha256'), sha + '\n')
console.log('응답 파일을 만들었습니다:', dir)
