/// <reference path="./pdfjs-worker.d.ts" />
/**
 * PDF에서 쪽별 글과 글자 위치를 뽑습니다.
 * 확인 화면에서 단을 눌렀을 때 원문 위치를 강조하는 데 씁니다.
 */
export type SourceLine = {
  text: string
  /** 쪽 크기에 대한 비율 [x0, y0, x1, y1]. 왼쪽 위가 (0, 0) */
  box: [number, number, number, number]
}
export type SourcePage = { page: number; width: number; height: number; lines: SourceLine[] }

type TextItem = { str: string; transform: number[]; width: number; height: number }

export async function extractPages(pdf: Uint8Array): Promise<SourcePage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // pdfjs는 작업자 파일(pdf.worker.mjs)을 실행 중에 경로로 찾아 부릅니다. 배포 묶음은 그런 파일을 따라가지 못해
  // 빠뜨리고, 그러면 글 꺼내기가 통째로 실패합니다. 여기서 직접 불러 등록해 두면 묶음에도 들어가고 그 경로도 타지 않습니다.
  const g = globalThis as { pdfjsWorker?: unknown }
  g.pdfjsWorker ??= await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf), useSystemFonts: true, verbosity: 0 })
  const doc = await task.promise
  const pages: SourcePage[] = []
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const view = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = (content.items as unknown as TextItem[]).filter((i) => typeof i.str === 'string' && i.str.trim() !== '')
      // 같은 높이에 놓인 조각을 한 줄로 묶습니다.
      const rows: { y: number; h: number; parts: { x: number; w: number; s: string }[] }[] = []
      for (const it of items) {
        const x = it.transform[4]
        const y = it.transform[5]
        const h = it.height || Math.abs(it.transform[3]) || 10
        let row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, h * 0.4))
        if (!row) {
          row = { y, h, parts: [] }
          rows.push(row)
        }
        row.h = Math.max(row.h, h)
        row.parts.push({ x, w: it.width, s: it.str })
      }
      rows.sort((a, b) => b.y - a.y)
      const lines: SourceLine[] = rows.map((r) => {
        r.parts.sort((a, b) => a.x - b.x)
        let text = ''
        let end = -Infinity
        for (const p of r.parts) {
          if (text && p.x - end > r.h * 0.25 && !text.endsWith(' ') && !p.s.startsWith(' ')) text += ' '
          text += p.s
          end = p.x + p.w
        }
        const x0 = r.parts[0].x
        const x1 = Math.max(...r.parts.map((p) => p.x + p.w))
        const clamp = (v: number) => Math.min(1, Math.max(0, v))
        return {
          text: text.replace(/\s+/g, ' ').trim(),
          box: [clamp(x0 / view.width), clamp(1 - (r.y + r.h) / view.height), clamp(x1 / view.width), clamp(1 - (r.y - r.h * 0.25) / view.height)],
        }
      })
      pages.push({ page: n, width: view.width, height: view.height, lines })
    }
  } finally {
    await task.destroy()
  }
  return pages
}

const norm = (s: string) => s.replace(/[\s.,·:;()\[\]{}"'“”‘’\-–—~*]/g, '').toLowerCase()

/** 두 글에 함께 들어 있는 글자 쌍의 비율 (0~1) */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0
  const grams = (s: string) => {
    const m = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2)
      m.set(g, (m.get(g) ?? 0) + 1)
    }
    return m
  }
  const ga = grams(a)
  const gb = grams(b)
  let hit = 0
  for (const [g, n] of ga) hit += Math.min(n, gb.get(g) ?? 0)
  return (2 * hit) / (a.length - 1 + (b.length - 1))
}

export type SourceHit = { page: number; box: [number, number, number, number] }

/**
 * 지시문이 원문의 어디에 있는지 찾습니다. 한 지시문이 여러 줄에 걸쳐 있을 수 있어
 * 이어진 줄 묶음 가운데 가장 비슷한 것을 고릅니다. 충분히 비슷하지 않으면 null.
 * 같은 글이 여러 번 나오면(구간마다 되풀이되는 지시문 등) `after` 뒤에 나오는 첫 번째 것을 고릅니다.
 */
export function locateText(pages: SourcePage[], text: string, after?: SourceHit | null): SourceHit | null {
  const target = norm(text)
  if (target.length < 4) return null
  const found: { score: number; page: number; box: [number, number, number, number] }[] = []
  for (const p of pages) {
    for (let i = 0; i < p.lines.length; i++) {
      let joined = ''
      const box: [number, number, number, number] = [1, 1, 0, 0]
      let best: { score: number; box: [number, number, number, number] } | null = null
      for (let j = i; j < Math.min(p.lines.length, i + 4); j++) {
        const line = p.lines[j]
        joined += norm(line.text)
        box[0] = Math.min(box[0], line.box[0])
        box[1] = Math.min(box[1], line.box[1])
        box[2] = Math.max(box[2], line.box[2])
        box[3] = Math.max(box[3], line.box[3])
        let score = similarity(target, joined)
        if (joined.includes(target)) score = Math.max(score, 0.9 + 0.1 * (target.length / joined.length))
        if (!best || score > best.score) best = { score, box: [...box] }
        if (joined.length > target.length * 1.6) break
      }
      if (best && best.score >= 0.6) found.push({ score: best.score, page: p.page, box: best.box })
    }
  }
  if (found.length === 0) return null
  const top = Math.max(...found.map((f) => f.score))
  // 가장 비슷한 것과 거의 같은 후보들 (쪽, 위에서 아래 순서)
  const close = found.filter((f) => f.score >= top - 0.02)
  const isAfter = (f: SourceHit) => !after || f.page > after.page || (f.page === after.page && f.box[1] >= after.box[1] - 0.001)
  const pick = close.find(isAfter) ?? close[0]
  return { page: pick.page, box: pick.box }
}
