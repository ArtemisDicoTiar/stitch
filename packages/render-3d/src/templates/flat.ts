/**
 * 평면 템플릿. 편물을 펼쳐 세워 놓은 모습입니다 (겉면이 +z).
 *
 * 단의 폭은 그 단의 코 수 × 코 폭이고, 단의 가운데는 기호 도안에서 그 단이 차지한 칸의 가운데를 따라갑니다.
 * 그래서 가장자리에서 늘리거나 줄이면 그쪽 가장자리만 움직이고, 가운데에서 줄이면 양쪽이 같이 좁아집니다.
 * 마네킹에는 입히지 않습니다.
 */
import type { GaugeSize } from '@stitch/pattern-ir'
import type { RowInfo, TemplatePlan } from './types'

export function planFlat(rows: RowInfo[], gauge: GaugeSize): TemplatePlan {
  const sw = 10 / gauge.stitches
  const rh = 10 / gauge.rows

  // 단마다의 가운데 (코 단위). 격자가 바뀌면 앞 단의 가운데에 이어 붙입니다.
  const mid = new Float64Array(rows.length)
  const shift = new Map<number, number>()
  let prev = 0
  let seen = false
  let lo = Infinity
  let hi = -Infinity
  let widest = 0
  rows.forEach((r, i) => {
    if (r.n === 0) {
      mid[i] = prev
      return
    }
    let x0 = Infinity
    let x1 = -Infinity
    for (const c of r.row.cells) {
      if (c.x < x0) x0 = c.x
      if (c.x > x1) x1 = c.x
    }
    const local = (x0 + x1 + 1) / 2
    let off = shift.get(r.block)
    if (off === undefined) {
      off = seen ? prev - local : -r.blockW / 2
      shift.set(r.block, off)
    }
    seen = true
    prev = mid[i] = local + off
    lo = Math.min(lo, prev - r.n / 2)
    hi = Math.max(hi, prev + r.n / 2)
    widest = Math.max(widest, r.n)
  })
  const recentre = seen ? (lo + hi) / 2 : 0

  return {
    corner(ri, c, top, pos, nrm) {
      const n = rows[ri].n
      // c = 0이 도안의 오른쪽 끝
      pos[0] = (mid[ri] - recentre + n / 2 - c) * sw
      pos[1] = (ri + (top ? 1 : 0)) * rh
      pos[2] = 0
      nrm[0] = 0
      nrm[1] = 0
      nrm[2] = 1
    },
    mannequin: null,
    details: { template: 'flat', stitchWidth: sw, rowHeight: rh, width: widest * sw, height: rows.length * rh },
  }
}
