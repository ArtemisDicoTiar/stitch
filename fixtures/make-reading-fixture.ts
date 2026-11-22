/**
 * 읽기(PDF → IR) 테스트에 쓰는 고정 자료를 만듭니다.
 *   pnpm fixtures:reading           PDF가 없을 때만 만들고, 응답 파일은 다시 씁니다
 *   pnpm fixtures:reading --force   PDF부터 다시 만듭니다
 *
 * - reading/<도안>.pdf: 직접 쓴 연습 도안을 사람이 읽는 도안처럼 조판한 PDF.
 * - reading/recordings/<PDF 해시>/: 그 PDF에 대한 LLM 응답 자리에 넣는 파일. 도안마다 자기 폴더만 다시 씁니다.
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
import { practiceBall } from './practice-ball'
import { practiceHood } from './practice-hood'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'reading')
const force = process.argv.includes('--force')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

const SIDE_LABEL = { RS: '겉면', WS: '안면', round: '' } as const

function startText(p: Pattern, start: Pattern['sections'][number]['start']): string {
  if (start.kind === 'cast_on') return `${start.count}코를 잡습니다.`
  if (start.kind === 'chain') return `사슬 ${start.count}코로 시작합니다.`
  if (start.kind === 'ring') return start.count > 0 ? `매직링에 짧은뜨기 ${start.count}코로 시작합니다.` : '매직링으로 시작합니다.'
  return `앞 구간에서 이어서 ${start.count}코로 시작합니다.`
}

function html(p: Pattern, intro: string): string {
  const tool = p.craft === 'crochet' ? '코바늘' : '바늘'
  const sections = p.sections
    .map((s) => {
      const groups = s.groups
        .map((g) => {
          const rows = g.rows
            .map((r) => {
              const side = [r.label, SIDE_LABEL[r.side]].filter(Boolean).map((v) => esc(v!)).join(' · ')
              // 지시문에 코 수가 이미 적혀 있으면 다시 붙이지 않습니다.
              const count = r.expect_count !== undefined && !r.text.includes(`(${r.expect_count}코)`) ? ` <b>(${r.expect_count}코)</b>` : ''
              return `<li>${side ? `<span class="side">${side}</span> ` : ''}${esc(r.text)}${count}</li>`
            })
            .join('')
          // "6~10단"처럼 지시문이 이미 여러 단을 가리키면 반복 안내를 덧붙이지 않습니다.
          const ranged = g.rows.length === 1 && /^\d+\s*[~-]\s*\d+단/.test(g.rows[0].text)
          const rep = 'times' in g.repeat ? (g.repeat.times > 1 && !ranged ? `<p class="rep">위 ${g.rows.length}단을 ${g.repeat.times}번 뜹니다.</p>` : '') : `<p class="rep">위 ${g.rows.length}단을 되풀이해 고무단 위에서 ${g.repeat.until_cm}cm가 될 때까지 뜹니다.</p>`
          // 코바늘 도안은 지시문이 "n단:"으로 시작하므로 번호를 따로 매기지 않습니다.
          return p.craft === 'crochet' ? `<ul class="rows">${rows}</ul>${rep}` : `<ol>${rows}</ol>${rep}`
        })
        .join('')
      return `<h2>${esc(s.name)}</h2><p>${startText(p, s.start)}</p>${groups}`
    })
    .join('')
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 10.5pt; line-height: 1.55; color: #222; }
    h1 { font-size: 20pt; margin: 0 0 4pt; } h2 { font-size: 13pt; margin: 16pt 0 4pt; border-bottom: 1px solid #999; }
    ol { margin: 4pt 0; padding-left: 18pt; } li { margin: 2pt 0; } .side { color: #555; font-weight: 600; }
    ul.rows { list-style: none; margin: 0; padding-left: 0; }
    .rep { margin: 2pt 0 8pt 18pt; font-style: italic; } table { border-collapse: collapse; } td { padding: 1pt 12pt 1pt 0; vertical-align: top; }
  </style></head><body>
  <h1>${esc(p.title)}</h1>
  <p>${esc(intro)}</p>
  <h2>준비물</h2>
  <table>${p.materials.map((m) => `<tr><td><b>${esc(m.kind)}</b></td><td>${esc(m.spec)}${m.qty ? ' · ' + esc(m.qty) : ''}</td></tr>`).join('')}</table>
  <h2>게이지와 완성 크기</h2>
  <p>${p.gauge ? `게이지: ${p.gauge.in_stitch} 10cm에 ${p.gauge.stitches}코 × ${p.gauge.rows}단 (${p.gauge.tool_mm}mm ${tool})<br>` : ''}완성 크기: 가로 ${p.finished.width_cm}cm, 세로 ${p.finished.height_cm}cm</p>
  ${sections}
  <h2>마무리</h2>
  <ol>${p.finishing.map((f) => `<li><b>${esc(f.name)}</b> ${esc(f.text)}</li>`).join('')}</ol>
  </body></html>`
}

type Fixture = {
  /** 파일 이름. reading/<slug>.pdf, reading/<slug>.sha256 */
  slug: string
  pattern: Pattern
  /** 도안 맨 위의 소개 글 */
  intro: string
  /**
   * 두 번째 응답(단 읽기)에 일부러 넣는 잘못. 검산 되먹임이 도는지 확인하는 데 씁니다.
   * 고친 구간의 순서(0부터)를 돌려주면 세 번째 응답으로 그 구간의 바른 답을 둡니다.
   */
  breakRows?: (rows: ReturnType<typeof toWire>['rows']) => number
}

const FIXTURES: Fixture[] = [
  {
    slug: 'practice-hood',
    pattern: practiceHood,
    intro: '목에서 시작해 머리를 감싸는 후드를 평면으로 뜨는 연습 도안입니다.',
    // 목 고무단의 줄임단에서 "3코 모아뜨기"를 하나 빠뜨리고 읽은 것으로 둡니다.
    // 그러면 도안에 적힌 79코와 달리 81코가 되어 검산에 걸립니다.
    // (숫자 하나를 잘못 읽은 정도는 뒤의 "마지막 5코 전까지" 반복이 흡수해 코 수 검산으로는 잡히지 않습니다.)
    breakRows: (rows) => {
      const decRow = rows.sections[0].groups[1].rows[0]
      decRow.ops.splice(decRow.ops.findIndex((o) => o.op === 'st' && o.st === 'sk2p'), 1)
      return 0
    },
  },
  {
    slug: 'practice-ball',
    pattern: practiceBall,
    intro: '매직링에서 시작해 짧은뜨기로 둥글게 뜨는 코바늘 연습 도안입니다. 단을 잇지 않고 나선으로 이어 뜹니다.',
  },
]

const NOTE = '손으로 만든 대역입니다. 실제 LLM 응답을 녹화한 것이 아닙니다.'
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const recRoot = join(out, 'recordings')
mkdirSync(out, { recursive: true })

for (const fx of FIXTURES) {
  const pdfPath = join(out, `${fx.slug}.pdf`)
  const shaPath = join(out, `${fx.slug}.sha256`)
  if (force || !existsSync(pdfPath)) {
    const browser = await chromium.launch()
    const page = await browser.newPage()
    await page.setContent(html(fx.pattern, fx.intro), { waitUntil: 'load' })
    writeFileSync(pdfPath, await page.pdf({ format: 'A4', printBackground: true }))
    await browser.close()
    console.log('PDF를 만들었습니다:', pdfPath)
  }

  const sha = createHash('sha256').update(readFileSync(pdfPath)).digest('hex')
  // 이 도안의 폴더만 다시 씁니다. PDF가 바뀌어 해시가 달라졌으면 예전 폴더도 지웁니다.
  const before = existsSync(shaPath) ? readFileSync(shaPath, 'utf8').trim() : ''
  for (const old of new Set([before, sha])) if (old) rmSync(join(recRoot, old.slice(0, 16)), { recursive: true, force: true })
  const dir = join(recRoot, sha.slice(0, 16))
  mkdirSync(dir, { recursive: true })
  const write = (name: string, kind: string, output: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify({ kind, note: NOTE, promptVersion: PROMPT_VERSION, model: 'hand-written', usage, output }, null, 1) + '\n')

  const good = toWire(fx.pattern)
  write('1-outline.json', 'outline', good.outline)
  if (fx.breakRows) {
    const bad: typeof good.rows = JSON.parse(JSON.stringify(good.rows))
    const fixedSection = fx.breakRows(bad)
    write('2-rows.json', 'rows', bad)
    write('3-feedback.json', 'feedback', { sections: [good.rows.sections[fixedSection]] })
  } else {
    write('2-rows.json', 'rows', good.rows)
  }
  writeFileSync(shaPath, sha + '\n')
  console.log('응답 파일을 만들었습니다:', dir)
}
