// 배포 주소에서 실제 흐름을 확인합니다. 방문자 두 명(쿠키 통 두 개)으로 돕니다.
// 사용: node scripts/verify-deployed.mjs <base-url> <대바늘 연습 PDF> [코바늘 연습 PDF]
// PDF 읽기가 켜져 있으면 실제 변환을 하므로 LLM 비용이 듭니다 (대바늘 1건, 코바늘 1건).
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const BASE = process.argv[2]
const PDF = process.argv[3]
const CROCHET_PDF = process.argv[4]
if (!BASE || !PDF) throw new Error('usage: verify-deployed.mjs <base> <pdf>')

class Visitor {
  constructor(name) { this.name = name; this.cookies = new Map() }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
  async call(method, path, body, raw = false) {
    const headers = { cookie: this.header() }
    let payload
    if (body instanceof FormData) payload = body
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body) }
    const t = Date.now()
    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' })
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';'); const i = kv.indexOf('=')
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1))
    }
    const ms = Date.now() - t
    if (raw) return { status: res.status, ms, bytes: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type'), region: res.headers.get('x-vercel-id') }
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}
    return { status: res.status, ms, json, text, region: res.headers.get('x-vercel-id') }
  }
}

let failed = 0
const results = []
function check(label, ok, detail = '') {
  results.push({ label, ok })
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`)
}
const brief = (r) => `${r.status} ${r.ms}ms ${r.json ? JSON.stringify(r.json).slice(0, 220) : r.text?.slice(0, 220)}`

const A = new Visitor('A')
const B = new Visitor('B')

// 0. 페이지와 쿠키
for (const p of ['/', '/upload', '/pricing', '/library', '/mannequin']) {
  const r = await A.call('GET', p)
  check(`A GET ${p}`, r.status === 200, `${r.status} ${r.ms}ms region=${r.region}`)
}
check('A 익명 쿠키 발급', A.cookies.has('stitch_uid'))
await B.call('GET', '/')
check('B 익명 쿠키 발급, A와 다름', B.cookies.has('stitch_uid') && B.cookies.get('stitch_uid') !== A.cookies.get('stitch_uid'))

const me = await A.call('GET', '/api/me')
check('A /api/me', me.status === 200, brief(me))

// 1. 예시 도안
const s = await A.call('POST', '/api/patterns', { sample: 'practice-hood' })
check('A 예시 도안 만들기', s.status < 300 && !!s.json?.id, brief(s))
const id = s.json?.id
const v0 = await A.call('GET', `/api/patterns/${id}`)
check('A 도안 읽기 (jsonb IR)', v0.status === 200 && typeof v0.json?.pattern === 'object', `${v0.status} ${v0.ms}ms status=${v0.json?.pattern?.status} title=${v0.json?.pattern?.title}`)
const p0 = v0.json?.pattern ?? {}
console.log('      pattern keys:', Object.keys(p0).join(','))

// 2. 확인 → 게이지
if (p0.status === 'needs_review') {
  const c = await A.call('POST', `/api/patterns/${id}/confirm`)
  check('A 확인 완료', c.status < 300, brief(c))
}
const pv = await A.call('POST', `/api/patterns/${id}/gauge/preview`, { stitches: 20, rows: 28 })
check('A 게이지 미리 계산', pv.status === 200 && pv.json?.ok === true, `${pv.status} ${pv.ms}ms ok=${pv.json?.ok} width=${JSON.stringify(pv.json?.width)}`)
const g1 = await A.call('POST', `/api/patterns/${id}/gauge`, { mode: 'as_is' })
check('A 게이지 그대로', g1.status < 300, `${g1.status} ${g1.ms}ms gaugeMode=${g1.json?.pattern?.gaugeMode}`)

// 3. 기록과 단수링
const pr = await A.call('POST', `/api/patterns/${id}/progress`, { row: 12, stitch: 30, memo: '배포 확인' })
check('A 기록 추가', pr.status < 300, brief(pr))
const pl = await A.call('GET', `/api/patterns/${id}/progress`)
check('A 기록 목록', pl.status === 200 && JSON.stringify(pl.json).includes('배포 확인'), brief(pl))
const rg = await A.call('POST', `/api/patterns/${id}/rings`, { row: 10, x: 5, color: '#e8590c', name: '시작' })
check('A 단수링 추가', rg.status < 300, brief(rg))
const rl = await A.call('GET', `/api/patterns/${id}/rings`)
check('A 단수링 목록', rl.status === 200 && JSON.stringify(rl.json).includes('시작'), brief(rl))

// 4. 게이지 다시 계산 → 기록과 단수링이 옮겨지는지
const g2 = await A.call('POST', `/api/patterns/${id}/gauge`, { mode: 'recalc', gauge: { stitches: 20, rows: 28 } })
check('A 게이지 다시 계산 저장', g2.status < 300 && g2.json?.pattern?.gaugeMode === 'recalc', `${g2.status} ${g2.ms}ms gaugeMode=${g2.json?.pattern?.gaugeMode} versionKind=${g2.json?.pattern?.versionKind} myGauge=${JSON.stringify(g2.json?.pattern?.myGauge)}`)
const pl2 = await A.call('GET', `/api/patterns/${id}/progress`)
const rl2 = await A.call('GET', `/api/patterns/${id}/rings`)
check('A 다시 계산 뒤 기록·단수링이 남아 있음', JSON.stringify(pl2.json).includes('배포 확인') && JSON.stringify(rl2.json).includes('시작'), `progress=${JSON.stringify(pl2.json).slice(0, 160)} rings=${JSON.stringify(rl2.json).slice(0, 160)}`)

// 5. 내 도안
const lib = await A.call('GET', '/api/patterns')
check('A 내 도안 목록에 1개', lib.status === 200 && lib.json?.patterns?.length === 1, `${lib.status} n=${lib.json?.patterns?.length} ${JSON.stringify(lib.json?.patterns?.[0] ?? {}).slice(0, 200)}`)
const libPage = await A.call('GET', '/library')
check('A /library 화면에 도안 제목이 나옴', libPage.status === 200 && libPage.text.includes('연습용 후드 워머'))
const work = await A.call('GET', `/patterns/${id}`)
check('A 작업 화면', work.status === 200, `${work.status} ${work.ms}ms`)

// 6. 방문자 분리
const bLib = await B.call('GET', '/api/patterns')
check('B 내 도안은 비어 있음', bLib.status === 200 && bLib.json?.patterns?.length === 0, brief(bLib))
for (const [m, p, body] of [['GET', `/api/patterns/${id}`], ['GET', `/api/patterns/${id}/progress`], ['POST', `/api/patterns/${id}/progress`, { row: 1, stitch: 1 }], ['DELETE', `/api/patterns/${id}`]]) {
  const r = await B.call(m, p, body)
  check(`B ${m} ${p.replace(id, ':id')} → 404`, r.status === 404, `${r.status}`)
}
const bPage = await B.call('GET', `/patterns/${id}`)
check('B 작업 화면 → 404', bPage.status === 404, `${bPage.status}`)
const forged = new Visitor('forged')
forged.cookies.set('stitch_uid', A.cookies.get('stitch_uid').split('.')[0] + '.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
const f = await forged.call('GET', `/api/patterns/${id}`)
check('위조한 쿠키로는 못 봄', f.status === 404, `${f.status}`)

// 7. 마네킹 (jsonb)과 플러스
const fancy = { face: 'round', skin: 'tone2', hair: 'bangs', glasses: 'round' }
const a1 = await A.call('PUT', '/api/avatar', fancy)
check('A 무료는 꾸민 값 저장 불가 (403 plus_required)', a1.status === 403, brief(a1))
const bl = await A.call('POST', '/api/billing', { plan: 'plus' })
check('A 플러스 켜기', bl.status === 200 && bl.json?.plan === 'plus', brief(bl))
const a2 = await A.call('PUT', '/api/avatar', fancy)
check('A 플러스는 저장됨', a2.status === 200, brief(a2))
const a3 = await A.call('GET', '/api/avatar')
check('A 저장한 마네킹을 그대로 읽음 (jsonb 왕복)', JSON.stringify(a3.json?.saved) === JSON.stringify(fancy), brief(a3))
const bad = await A.call('PUT', '/api/avatar', { ...fancy, face: 'alien' })
check('A 모르는 값은 400', bad.status === 400, `${bad.status}`)
const pricing = await A.call('GET', '/pricing')
check('A /pricing 화면', pricing.status === 200, `${pricing.status} ${pricing.ms}ms`)
await A.call('POST', '/api/billing', { plan: 'free' })

// 8. PDF 올리기 (bytea 왕복). 배포에는 API 키가 없으므로 읽기는 실패해야 정상입니다.
const pdf = readFileSync(PDF)
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16)
const fd = new FormData()
fd.append('file', new Blob([pdf], { type: 'application/pdf' }), 'practice-hood.pdf')
const up = await A.call('POST', '/api/patterns', fd)
const readerOff = me.json?.pdfReading === 'off'
if (readerOff) {
  check('A PDF 올리기는 읽기가 꺼져 있어 503 reader_off 로 돌려보냄', up.status === 503 && up.json?.error?.code === 'reader_off', brief(up))
  const after = await A.call('GET', '/api/patterns')
  check('돌려보낸 뒤 도안이 늘지 않음', after.json?.patterns?.length === 1, `n=${after.json?.patterns?.length}`)
} else check('A PDF 올리기', up.status < 300 && !!up.json?.id, brief(up))
const pid = up.json?.id
if (pid) {
  const dl = await A.call('GET', `/api/patterns/${pid}/pdf`, undefined, true)
  check('A 올린 PDF를 같은 내용으로 내려받음', dl.status === 200 && dl.bytes.length === pdf.length && sha(dl.bytes) === sha(pdf), `${dl.status} ${dl.bytes.length}B vs ${pdf.length}B type=${dl.type}`)
  const bdl = await B.call('GET', `/api/patterns/${pid}/pdf`, undefined, true)
  check('B는 A의 PDF를 못 받음', bdl.status === 404, `${bdl.status}`)
  const readerOn = me.json?.pdfReading === 'on'
  const reading = await A.call('GET', `/patterns/${pid}/reading`)
  check('A 읽는 중 화면', reading.status === 200, `${reading.status}`)
  let job
  const t0 = Date.now()
  const stages = []
  // 실제로 읽을 때는 함수 제한 시간(300초)까지 기다려 봅니다.
  while (Date.now() - t0 < (readerOn ? 330_000 : 30_000)) {
    job = await A.call('GET', `/api/patterns/${pid}/job`)
    const st = job.json?.job?.status
    const stage = job.json?.job?.stage
    if (stage && stages.at(-1) !== stage) stages.push(stage)
    if (st && st !== 'queued' && st !== 'running') break
    await new Promise((r) => setTimeout(r, 3000))
  }
  const took = ((Date.now() - t0) / 1000).toFixed(0)
  console.log(`      job (${took}s, stages ${stages.join('→')}):`, brief(job))
  if (readerOn) {
    check(`A 변환이 실제로 끝남 (${took}초)`, ['done', 'needs_review'].includes(job.json?.job?.status), `status=${job.json?.job?.status} patternStatus=${job.json?.patternStatus} error=${job.json?.job?.error ?? ''}`)
    const read = await A.call('GET', `/api/patterns/${pid}`)
    const pat = read.json?.pattern ?? {}
    check('A 읽어 낸 도안: 제목과 구간이 들어 있음', pat.title === '연습용 후드 워머' && (pat.ir?.sections?.length ?? 0) === 3, `title=${pat.title} status=${pat.status} sections=${pat.ir?.sections?.length} keys=${Object.keys(pat).join(',').slice(0, 160)}`)
    const review = await A.call('GET', `/patterns/${pid}/review`)
    check('A 확인 화면이 열림', review.status === 200, `${review.status} ${review.ms}ms`)
    const usage = await A.call('GET', '/api/me')
    console.log('      me:', brief(usage))
  } else check('A 변환 작업이 끝 상태에 도달 (키가 없어 실패가 정상)', ['failed', 'done', 'needs_review'].includes(job.json?.job?.status), `status=${job.json?.job?.status} patternStatus=${job.json?.patternStatus}`)
  const d2 = await A.call('DELETE', `/api/patterns/${pid}`)
  check('A 올린 도안 지우기', d2.status < 300, `${d2.status}`)
  const gone = await A.call('GET', `/api/patterns/${pid}/pdf`, undefined, true)
  check('지운 뒤 PDF는 404', gone.status === 404, `${gone.status}`)
}

// 8-2. 코바늘 PDF: 둥글게 뜨는 도안은 읽어서 확인 화면으로 갑니다.
if (CROCHET_PDF && me.json?.pdfReading === 'on') {
  const fdc = new FormData()
  fdc.append('file', new Blob([readFileSync(CROCHET_PDF)], { type: 'application/pdf' }), 'practice-crochet.pdf')
  const upc = await A.call('POST', '/api/patterns', fdc)
  check('A 코바늘 PDF 올리기', upc.status < 300 && !!upc.json?.id, brief(upc))
  const cid = upc.json?.id
  if (cid) {
    let job
    const t0 = Date.now()
    while (Date.now() - t0 < 330_000) {
      job = await A.call('GET', `/api/patterns/${cid}/job`)
      const st = job.json?.job?.status
      if (st && st !== 'queued' && st !== 'running') break
      await new Promise((r) => setTimeout(r, 3000))
    }
    const took = ((Date.now() - t0) / 1000).toFixed(0)
    check(`A 코바늘 PDF 변환이 끝남 (${took}초)`, ['done', 'needs_review'].includes(job.json?.job?.status), `status=${job.json?.job?.status} error=${job.json?.job?.error ?? ''}`)
    const read = await A.call('GET', `/api/patterns/${cid}`)
    const pat = read.json?.pattern ?? {}
    check('A 읽어 낸 코바늘 도안: 코바늘, 둥근 조각, 검산 통과', pat.ir?.craft === 'crochet' && pat.ir?.template === 'round' && job.json?.job?.verification?.ok === true, `craft=${pat.ir?.craft} template=${pat.ir?.template} ok=${job.json?.job?.verification?.ok} sections=${pat.ir?.sections?.length}`)
    const dc = await A.call('DELETE', `/api/patterns/${cid}`)
    check('A 코바늘 도안 지우기', dc.status < 300, `${dc.status}`)
  }
}

// 9. 큰 파일과 PDF가 아닌 파일
const fd2 = new FormData()
fd2.append('file', new Blob([Buffer.from('not a pdf')], { type: 'application/pdf' }), 'x.pdf')
const notPdf = await A.call('POST', '/api/patterns', fd2)
check('PDF가 아닌 파일은 4xx', notPdf.status >= 400 && notPdf.status < 500, brief(notPdf))

// 10. 치우기
const d1 = await A.call('DELETE', `/api/patterns/${id}`)
check('A 예시 도안 지우기', d1.status < 300, `${d1.status}`)
const lib2 = await A.call('GET', '/api/patterns')
check('A 내 도안이 다시 비어 있음', lib2.json?.patterns?.length === 0, `n=${lib2.json?.patterns?.length}`)

console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
