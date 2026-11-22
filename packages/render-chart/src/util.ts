/** SVG 문자열을 만들 때 쓰는 작은 도구들 */

/** 소수 둘째 자리까지. 뒤의 0은 떼어 냅니다. 출력이 항상 같은 글자가 되도록 숫자는 모두 여기를 거칩니다. */
export function num(n: number): string {
  const r = Math.round(n * 100) / 100
  return r === 0 ? '0' : String(r)
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * 글자 폭 어림값. Node에서는 글자를 잴 수 없어서 여백을 잡을 때만 씁니다.
 * 한글과 한자는 글자 크기만큼, 나머지는 그 절반 남짓으로 봅니다.
 */
export function textWidth(s: string, size: number, bold = false): number {
  let em = 0
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    if (c >= 0x1100) em += 1
    else if (c === 0x20) em += 0.3
    else em += 0.6
  }
  return em * size * (bold ? 1.05 : 1)
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** 가로로 w, 세로로 h인 사각형을 path 조각으로 */
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${num(x)},${num(y)}h${num(w)}v${num(h)}h${num(-w)}z`
}

/**
 * 오름차순 위치 목록을 "같은 간격으로 이어진 줄"로 묶습니다.
 * 간격 1(붙어 있는 칸)과 간격 2(한 칸 건너, 고무단이나 가터)만 묶고 나머지는 한 칸짜리로 둡니다.
 */
export type Run = { start: number; n: number; stride: 1 | 2 }

export function findRuns(pos: number[]): Run[] {
  const out: Run[] = []
  let j = 0
  while (j < pos.length) {
    const d = j + 1 < pos.length ? pos[j + 1] - pos[j] : 0
    if (d === 1 || d === 2) {
      let e = j + 1
      while (e + 1 < pos.length && pos[e + 1] - pos[e] === d) e++
      out.push({ start: pos[j], n: e - j + 1, stride: d })
      j = e + 1
    } else {
      out.push({ start: pos[j], n: 1, stride: 1 })
      j++
    }
  }
  return out
}
