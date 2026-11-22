/**
 * 뜨는 법의 단계들을 한 장의 그림으로 뽑습니다. 그림이 제대로 나오는지는 눈으로 봐야 알 수 있습니다.
 *   pnpm exec tsx scripts/tutorial-sheet.ts <폴더> [RING SC ...]
 * 뜨는 법마다 <폴더>/<이름>.png 를 만듭니다. 이름을 주지 않으면 코바늘 여섯 가지를 뽑습니다.
 *
 * 그리기 명령을 Node에서 받아 적은 뒤, 브라우저의 진짜 캔버스에서 그대로 다시 실행합니다.
 */
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { TUTORIALS, drawTutorialFrame, type TutorialId } from '../packages/tutorials/src'

const require = createRequire(new URL('../apps/web/package.json', import.meta.url))
const { chromium } = require('@playwright/test') as typeof import('@playwright/test')

type Op = { op: string; args: unknown[] }

/** 그리기 명령을 받아 적는 가짜 컨텍스트 */
function recorder(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = []
  const props: Record<string, unknown> = {}
  const gradient = { addColorStop: (...args: unknown[]) => void ops.push({ op: 'addColorStop', args }) }
  const ctx = new Proxy(
    {},
    {
      get(_t, key) {
        if (typeof key !== 'string') return undefined
        if (key in props) return props[key]
        return (...args: unknown[]) => {
          ops.push({ op: key, args })
          if (key === 'measureText') return { width: String(args[0]).length * 9 }
          if (key === 'createLinearGradient') return gradient
          return undefined
        }
      },
      set(_t, key, value) {
        props[String(key)] = value
        ops.push({ op: `${String(key)}=`, args: [value === gradient ? { gradient: true } : value] })
        return true
      },
    },
  )
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops }
}

const [out, ...names] = process.argv.slice(2)
if (!out) {
  console.error('사용법: tsx scripts/tutorial-sheet.ts <폴더> [뜨는 법 이름...]')
  process.exit(1)
}
const ids = (names.length ? names : ['RING', 'CH', 'SC', 'INC', 'SC2', 'SL']) as TutorialId[]
const size = { width: 500, height: 315 }
mkdirSync(out, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 2 })
for (const id of ids) {
  const tut = TUTORIALS[id]
  if (!tut) {
    console.error('없는 뜨는 법:', id)
    continue
  }
  const frames = tut.steps.map((step, i) => {
    const r = recorder()
    drawTutorialFrame(r.ctx, id, i, 1, size)
    return { ops: r.ops, text: `${i + 1}. ${step.text}`, hands: `왼손: ${step.left} · 오른손: ${step.right}` }
  })
  await page.setContent(
    `<body style="margin:0;padding:16px;background:#fff;font-family:'Apple SD Gothic Neo',sans-serif;width:${size.width * 2 + 48}px">
      <h2 style="margin:0 0 4px">${tut.title} <small style="font-weight:400;color:#666">(${id})</small></h2>
      <p style="margin:0 0 12px;color:#444">${tut.summary}</p>
      <div id="grid" style="display:grid;grid-template-columns:repeat(2,${size.width}px);gap:16px"></div></body>`,
  )
  await page.evaluate(
    ({ frames, size }) => {
      const grid = document.getElementById('grid')!
      for (const f of frames) {
        const box = document.createElement('figure')
        box.style.margin = '0'
        const canvas = document.createElement('canvas')
        canvas.width = size.width * 2
        canvas.height = size.height * 2
        canvas.style.width = `${size.width}px`
        canvas.style.height = `${size.height}px`
        canvas.style.border = '1px solid #ddd'
        const g = canvas.getContext('2d')!
        g.scale(2, 2)
        let grad: CanvasGradient | null = null
        for (const { op, args } of f.ops as { op: string; args: any[] }[]) {
          if (op.endsWith('=')) {
            const v = args[0]
            ;(g as any)[op.slice(0, -1)] = v && typeof v === 'object' && v.gradient ? grad : v
          } else if (op === 'createLinearGradient') grad = g.createLinearGradient(args[0], args[1], args[2], args[3])
          else if (op === 'addColorStop') grad?.addColorStop(args[0], args[1])
          else (g as any)[op](...args)
        }
        const cap = document.createElement('figcaption')
        cap.innerHTML = `<b style="font-size:13px">${f.text}</b><br><span style="font-size:12px;color:#666">${f.hands}</span>`
        box.append(canvas, cap)
        grid.append(box)
      }
    },
    { frames, size },
  )
  const file = join(out, `${id}.png`)
  await page.locator('body').screenshot({ path: file })
  console.log(file, `${tut.steps.length}단계`)
}
await browser.close()
