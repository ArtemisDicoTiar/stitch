/**
 * 그리기 명령을 적어 두기만 하는 가짜 2D 컨텍스트.
 * 메서드 호출과 속성 대입을 순서대로 기록합니다.
 */
export type Call = { op: string; args: unknown[] }

export type Recorder = {
  ctx: CanvasRenderingContext2D
  calls: Call[]
  reset(): void
}

export function recordingContext(): Recorder {
  const calls: Call[] = []
  const props: Record<string, unknown> = {}
  const gradient = {
    addColorStop: (...args: unknown[]): void => {
      calls.push({ op: 'addColorStop', args })
    },
  }
  const methods = new Map<string, (...args: unknown[]) => unknown>()
  const ctx = new Proxy(
    {},
    {
      get(_target, key) {
        if (typeof key !== 'string') return undefined
        if (key in props) return props[key]
        let fn = methods.get(key)
        if (!fn) {
          fn = (...args: unknown[]): unknown => {
            calls.push({ op: key, args })
            if (key === 'measureText') return { width: String(args[0]).length * 9 }
            if (key === 'createLinearGradient') return gradient
            return undefined
          }
          methods.set(key, fn)
        }
        return fn
      },
      set(_target, key, value) {
        props[String(key)] = value
        calls.push({ op: `${String(key)}=`, args: [value] })
        return true
      },
    },
  )
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    calls,
    reset: () => {
      calls.length = 0
    },
  }
}

function show(v: unknown): string {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return 'NaN!'
    const r = Math.round(v * 1e6) / 1e6
    return String(r === 0 ? 0 : r)
  }
  if (typeof v === 'string') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(show).join(',')}]`
  if (v && typeof v === 'object') return '{gradient}'
  return String(v)
}

/** 기록을 비교하기 쉬운 글줄로 바꿉니다. 숫자는 소수 여섯 자리까지만 봅니다. */
export function lines(calls: Call[]): string[] {
  return calls.map((c) => `${c.op}(${c.args.map(show).join(',')})`)
}

/** 기록 안의 모든 숫자 */
export function numbersIn(calls: Call[]): number[] {
  const out: number[] = []
  const walk = (v: unknown): void => {
    if (typeof v === 'number') out.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
  }
  for (const c of calls) c.args.forEach(walk)
  return out
}

export const countOf = (calls: Call[], ...ops: string[]): number => calls.filter((c) => ops.includes(c.op)).length
