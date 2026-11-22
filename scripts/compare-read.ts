/**
 * PDF를 읽은 결과(IR JSON)를 직접 쓴 도안과 단별로 견줍니다.
 * 프롬프트나 읽기 형식을 고친 뒤, 실제 API로 읽은 결과가 달라지지 않았는지 볼 때 씁니다.
 *   pnpm reader fixtures/reading/practice-hood.pdf --out /tmp/hood.json
 *   pnpm exec tsx scripts/compare-read.ts /tmp/hood.json practiceHood
 */
import { readFileSync } from 'node:fs'
import { allRows, verify } from '@stitch/engine'
import * as fixtures from '@stitch/fixtures'
import { parsePattern, type Pattern } from '@stitch/pattern-ir'

const [file, name] = process.argv.slice(2)
const want = (fixtures as Record<string, unknown>)[name ?? ''] as Pattern | undefined
if (!file || !want) {
  console.error('사용법: tsx scripts/compare-read.ts <읽은 IR.json> <fixtures의 도안 이름>')
  process.exit(1)
}
const got = verify(parsePattern(JSON.parse(readFileSync(file, 'utf8'))))
const exp = verify(parsePattern(want))
const a = allRows(exp.expanded)
const b = allRows(got.expanded)
const summary = (v: typeof got) => `${v.expanded.totalRows}단 ${v.expanded.totalStitches}코, 구간 ${v.expanded.sections.map((s) => `${s.startCount}→${s.endCount}/${s.rows}단`).join(' ')}`
console.log('직접 쓴 도안:', summary(exp))
console.log('읽은 결과  :', summary(got))
const diff: string[] = []
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  const x = a[i]
  const y = b[i]
  if (!x || !y) diff.push(`${i + 1}단: 한쪽에만 있음`)
  else if (x.count !== y.count || x.cells.length !== y.cells.length) diff.push(`${i + 1}단: 코 수 ${x.count} / ${y.count}, 칸 ${x.cells.length} / ${y.cells.length}`)
  else if (x.cells.map((c) => c.s).join() !== y.cells.map((c) => c.s).join()) diff.push(`${i + 1}단: 기호 순서가 다름`)
}
console.log(`다른 단 ${diff.length}개${diff.length ? ':\n  ' + diff.slice(0, 20).join('\n  ') : ''}`)
console.log(`읽은 결과의 오류 ${got.errors.length}건, 경고 ${got.warnings.length}건${got.warnings.length ? ' (' + [...new Set(got.warnings.map((w) => w.code))].join(', ') + ')' : ''}`)
process.exit(diff.length || got.errors.length ? 1 : 0)
