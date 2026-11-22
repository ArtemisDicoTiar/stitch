/**
 * 기호 도안 전체를 SVG 문자열로 그립니다. DOM 없이 Node에서도 돕니다.
 *
 * 칸마다 도형을 따로 두지 않습니다. 겉뜨기와 안뜨기는 이어진 칸을 점선 한 줄로 묶고
 * (점선은 path 조각마다 새로 시작하므로 칸마다 그은 선과 모양이 같습니다),
 * 나머지 기호는 defs에 한 번 그려 두고 use로 가져다 씁니다.
 */
import type { Expanded, SymbolId } from '@stitch/pattern-ir'
import { chartLayout, startsRight, type ChartLayout, type ChartOptions } from './layout'
import { SYMBOLS, SYMBOL_ORDER, SYMBOL_STROKE, lineGlyph, strokeAttrs, symbolGlyph } from './symbols'
import { esc, findRuns, num, rectPath } from './util'

export function renderChartSvg(expanded: Expanded, opts: ChartOptions = {}): string {
  return renderLayoutSvg(chartLayout(expanded, opts))
}

/** 이미 계산한 자리로 그립니다. chartLayout 을 따로 쓰는 쪽에서 두 번 계산하지 않게 합니다. */
export function renderLayoutSvg(L: ChartLayout): string {
  const { cell: cs, options: o, metrics: m, expanded } = L
  const s = m.scale
  const C = o.colors
  const src = expanded.blocks

  const bgOf = (id: SymbolId) => o.symbolBg[id] ?? SYMBOLS[id].bg
  const lines = SYMBOL_ORDER.map((id) => ({ id, line: lineGlyph(id) })).filter((e) => e.line && isWhite(bgOf(e.id)))
  const lineIds = new Set(lines.map((e) => e.id))

  const estimated: string[] = []
  const none: string[] = []
  const dashes = new Map<string, string[]>()
  const uses: string[] = []
  const used = new Set<SymbolId>()
  const gridMinor: string[] = []
  const gridMajor: string[] = []
  const frames: string[] = []
  const markers: string[] = []
  const numbersRight: string[] = []
  const numbersLeft: string[] = []
  const counts: string[] = []
  const estimatedNotes: string[] = []
  const columns: string[] = []
  const brackets: string[] = []

  const text = (x: number, y: number, body: string, attrs = '') => `<text x="${num(x)}" y="${num(y)}"${attrs}>${esc(body)}</text>`

  src.forEach((block, bi) => {
    const b = L.blocks[bi]
    const n = block.rows.length
    if (n === 0) return
    const W = block.W

    // t는 위에서부터 센 단 순서
    const sym: (SymbolId | null)[][] = []
    for (let t = 0; t < n; t++) {
      const row = block.rows[n - 1 - t]
      const line: (SymbolId | null)[] = new Array(W).fill(null)
      for (const c of row.cells) if (c.x >= 0 && c.x < W) line[c.x] = c.s
      sym.push(line)
    }

    // 겉뜨기, 안뜨기: 이어진 칸을 점선 한 줄로
    for (const { id, line } of lines) {
      if (!line) continue
      const push = (stride: number, d: string) => {
        const key = `${id}:${stride}`
        const list = dashes.get(key)
        if (list) list.push(d)
        else dashes.set(key, [d])
      }
      if (line.dir === 'v') {
        for (let x = 0; x < W; x++) {
          const pos: number[] = []
          for (let t = 0; t < n; t++) if (sym[t][x] === id) pos.push(t)
          for (const r of findRuns(pos)) {
            push(r.stride, `M${num(b.x + (x + line.at[0]) * cs)},${num(b.y + (r.start + line.at[1]) * cs)}v${num(((r.n - 1) * r.stride + line.len) * cs)}`)
          }
        }
      } else {
        for (let t = 0; t < n; t++) {
          const pos: number[] = []
          for (let x = 0; x < W; x++) if (sym[t][x] === id) pos.push(x)
          for (const r of findRuns(pos)) {
            push(r.stride, `M${num(b.x + (r.start + line.at[0]) * cs)},${num(b.y + (t + line.at[1]) * cs)}h${num(((r.n - 1) * r.stride + line.len) * cs)}`)
          }
        }
      }
    }

    // 나머지 기호: 아랫단부터, 왼쪽부터
    for (let t = n - 1; t >= 0; t--) {
      for (let x = 0; x < W; x++) {
        const id = sym[t][x]
        if (!id || lineIds.has(id)) continue
        used.add(id)
        uses.push(`<use href="#${esc(o.idPrefix + id)}" x="${num(b.x + x * cs)}" y="${num(b.y + t * cs)}"/>`)
      }
    }

    // 코 없음: 가로로 이어진 칸을 묶고, 같은 폭이 위아래로 이어지면 한 사각형으로
    let open = new Map<string, { x0: number; x1: number; t0: number }>()
    const flush = (r: { x0: number; x1: number; t0: number }, tEnd: number) =>
      none.push(rectPath(b.x + r.x0 * cs, b.y + r.t0 * cs, (r.x1 - r.x0 + 1) * cs, (tEnd - r.t0) * cs))
    for (let t = 0; t <= n; t++) {
      const next = new Map<string, { x0: number; x1: number; t0: number }>()
      if (t < n) {
        let x = 0
        while (x < W) {
          if (sym[t][x] !== null) {
            x++
            continue
          }
          let e = x
          while (e + 1 < W && sym[t][e + 1] === null) e++
          const key = `${x}:${e}`
          next.set(key, open.get(key) ?? { x0: x, x1: e, t0: t })
          x = e + 1
        }
      }
      for (const [key, r] of open) if (!next.has(key)) flush(r, t)
      open = next
    }

    // 게이지로 추정한 단의 띠
    if (o.estimated) for (const e of L.estimated) if (e.block === bi) estimated.push(rectPath(b.x, e.y1, b.w, e.y2 - e.y1))

    // 격자선. 세로는 오른쪽 끝에서 10코마다, 가로는 단 번호 10단마다 굵게
    for (let x = 1; x < W; x++) {
      ;((W - x) % 10 === 0 ? gridMajor : gridMinor).push(`M${num(b.x + x * cs)},${num(b.y)}v${num(b.h)}`)
    }
    for (let i = 1; i < n; i++) {
      ;(block.rows[i - 1].g % 10 === 0 ? gridMajor : gridMinor).push(`M${num(b.x)},${num(b.y + (n - i) * cs)}h${num(b.w)}`)
    }
    frames.push(rectPath(b.x, b.y, b.w, b.h))

    // 마커 선. 엔진은 마커를 다룬 단에만 자리를 적어 주므로, 같은 구간에서 다음 마커 단이 나올 때까지는
    // 앞 단의 자리를 이어서 그립니다. 마커 x는 "마커 바로 앞 코"라서 겉면 단이면 그 칸의 왼쪽 변이 마커 자리입니다.
    if (o.markers) {
      const bounds: number[][] = block.rows.map(() => [])
      let last = -1
      block.rows.forEach((r, i) => {
        if (!r.markers.length) return
        if (last >= 0 && block.rows[last].sectionId === r.sectionId) for (let j = last + 1; j < i; j++) bounds[j] = bounds[last]
        bounds[i] = r.markers.map((x) => (startsRight(r.side) ? x : x + 1))
        last = i
      })
      const byEdge = new Map<number, number[]>()
      for (let t = 0; t < n; t++) {
        for (const edge of bounds[n - 1 - t]) {
          const list = byEdge.get(edge)
          if (list) {
            if (list[list.length - 1] !== t) list.push(t)
          } else byEdge.set(edge, [t])
        }
      }
      for (const edge of [...byEdge.keys()].sort((a, z) => a - z)) {
        const ts = byEdge.get(edge) ?? []
        let i = 0
        while (i < ts.length) {
          let j = i
          while (j + 1 < ts.length && ts[j + 1] === ts[j] + 1) j++
          markers.push(`M${num(b.x + edge * cs)},${num(b.y + ts[i] * cs - 0.5 * s)}v${num((j - i + 1) * cs + s)}`)
          i = j + 1
        }
      }
    }

    // 단 번호와 코 수
    const tagged = new Set<number>()
    let prev: number | null = null
    block.rows.forEach((row, i) => {
      const y = b.y + (n - 1 - i) * cs
      if (o.rowNumbers) {
        const label = L.rowLabel(row.g)
        if (label) (label.anchor === 'start' ? numbersRight : numbersLeft).push(text(label.x, label.y, label.text))
      }
      if (o.counts && row.count !== prev && row.count > 0) {
        counts.push(text(b.x + b.w + m.countGap, y + cs * 0.8, o.labels.stitches(row.count)))
        tagged.add(i)
      }
      prev = row.count
    })

    // 추정 단 설명: 코 수 글씨와 겹치지 않는 단 가운데 한가운데에 가까운 곳
    if (o.estimated) {
      for (const e of L.estimated) {
        if (e.block !== bi) continue
        const i0 = block.rows.findIndex((r) => r.g === e.firstRow)
        const mid = i0 + (e.rows - 1) / 2
        let best = -1
        for (let i = i0; i < i0 + e.rows; i++) {
          if (tagged.has(i - 1) || tagged.has(i) || tagged.has(i + 1)) continue
          if (best < 0 || Math.abs(i - mid) < Math.abs(best - mid)) best = i
        }
        if (best >= 0) estimatedNotes.push(text(b.x + b.w + m.countGap, b.y + (n - 1 - best) * cs + cs * 0.8, o.labels.estimated(e.rows)))
      }
    }

    // 코 번호: 오른쪽 끝이 1
    if (o.columnNumbers) {
      const ns = [1]
      for (let v = 10; v <= W; v += 10) ns.push(v)
      if (W - ns[ns.length - 1] >= 2) ns.push(W)
      for (const v of ns) columns.push(text(b.x + (W - v) * cs + cs / 2, b.y + b.h + m.columnGap, String(v)))
    }
  })

  // 구간 묶음표
  if (o.sections) {
    const bx = m.bracketX
    L.sections.forEach((sec, i) => {
      const color = esc(C.sections[(sec.index >= 0 ? sec.index : i) % C.sections.length] ?? C.frame)
      const ym = (sec.y1 + sec.y2) / 2
      brackets.push(
        `<path d="M${num(bx + 7 * s)},${num(sec.y1 + s)}h${num(-7 * s)}v${num(sec.y2 - sec.y1 - 2 * s)}h${num(7 * s)}" fill="none" stroke="${color}" stroke-width="${num(1.6 * s)}"/>`,
      )
      const name = ` font-size="${num(12 * s)}" font-weight="700" fill="${color}"`
      if (sec.y2 - sec.y1 >= 30 * s) {
        brackets.push(text(bx - 7 * s, ym - 5 * s, sec.name, name))
        brackets.push(text(bx - 7 * s, ym + 11 * s, o.labels.rows(sec.firstRow, sec.lastRow), ` font-size="${num(10 * s)}" fill="${esc(C.sub)}"`))
      } else {
        brackets.push(text(bx - 7 * s, ym + 4 * s, sec.name, name))
      }
    })
  }

  // --- 조립 ---
  const out: string[] = []
  const w = num(L.width)
  const h = num(L.height)
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${esc(o.fontFamily)}" role="img" aria-label="${esc(o.labels.title)}">`,
  )
  const defs = SYMBOL_ORDER.filter((id) => used.has(id)).map((id) => {
    const bg = bgOf(id)
    const fill = isWhite(bg) ? '' : `<path d="${rectPath(0, 0, cs, cs)}" fill="${esc(bg)}" stroke="none"/>`
    return `<g id="${esc(o.idPrefix + id)}">${fill}${symbolGlyph(id, 0, 0, cs, C.ink)}</g>`
  })
  if (defs.length) out.push(`<defs>${defs.join('')}</defs>`)
  if (o.background) out.push(`<rect class="sc-paper" width="${w}" height="${h}" fill="${esc(C.paper)}"/>`)
  if (estimated.length) out.push(`<path class="sc-estimated" fill="${esc(C.estimated)}" d="${estimated.join('')}"/>`)
  if (none.length) out.push(`<path class="sc-none" fill="${esc(C.noStitch)}" d="${none.join('')}"/>`)

  const glyphs: string[] = []
  for (const { id, line } of lines) {
    if (!line) continue
    for (const stride of [1, 2]) {
      const list = dashes.get(`${id}:${stride}`)
      if (!list) continue
      const on = line.len * cs
      glyphs.push(`<path data-s="${id}" stroke-dasharray="${num(on)} ${num(stride * cs - on)}" d="${list.join('')}"/>`)
    }
  }
  glyphs.push(...uses)
  if (glyphs.length) out.push(`<g class="sc-symbols" ${strokeAttrs(C.ink, SYMBOL_STROKE * s)}>`, ...glyphs, '</g>')

  if (gridMinor.length) out.push(`<path class="sc-grid" fill="none" stroke="${esc(C.gridMinor)}" stroke-width="${num(0.5 * s)}" d="${gridMinor.join('')}"/>`)
  if (gridMajor.length) out.push(`<path class="sc-grid-major" fill="none" stroke="${esc(C.gridMajor)}" stroke-width="${num(0.9 * s)}" d="${gridMajor.join('')}"/>`)
  if (frames.length) out.push(`<path class="sc-frame" fill="none" stroke="${esc(C.frame)}" stroke-width="${num(1.4 * s)}" d="${frames.join('')}"/>`)
  if (markers.length) out.push(`<path class="sc-markers" fill="none" stroke="${esc(C.marker)}" stroke-width="${num(2.2 * s)}" d="${markers.join('')}"/>`)

  const group = (cls: string, attrs: string, items: string[]) => {
    if (items.length) out.push(`<g class="${cls}" ${attrs}>`, ...items, '</g>')
  }
  group('sc-rows', `font-size="${num(8.5 * s)}" fill="${esc(C.rowNumber)}"`, numbersRight)
  group('sc-rows', `font-size="${num(8.5 * s)}" fill="${esc(C.rowNumber)}" text-anchor="end"`, numbersLeft)
  group('sc-counts', `font-size="${num(10.5 * s)}" font-weight="700" fill="${esc(C.count)}"`, counts)
  group('sc-estimated-notes', `font-size="${num(9.5 * s)}" fill="${esc(C.estimatedText)}"`, estimatedNotes)
  group('sc-columns', `font-size="${num(8 * s)}" fill="${esc(C.columnNumber)}" text-anchor="middle"`, columns)
  group('sc-sections', 'text-anchor="end"', brackets)
  out.push('</svg>')
  return out.join('\n')
}

function isWhite(color: string): boolean {
  const c = color.trim().toLowerCase()
  return c === '#ffffff' || c === '#fff' || c === 'white' || c === 'none' || c === 'transparent'
}
