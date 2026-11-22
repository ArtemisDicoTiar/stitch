'use client'

/**
 * 기록과 단수링의 상태.
 * 누르면 화면부터 바꾸고(낙관적 갱신) 서버에 보냅니다. 실패하면 되돌리고 이유를 알려 줍니다.
 * 쓰기 요청은 한 줄로 세워 순서대로 보냅니다. 빨리 여러 번 눌러도 기록 순서가 바뀌지 않습니다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Expanded } from '@stitch/pattern-ir'
import { ApiError, apiFetch } from '@/lib/api'
import type { ProgressEntry, RingMarker } from '@/server/patterns'
import { START, isComplete, workingPos, type Pos } from './position'

const TMP = 'tmp:'

function sortEntries(list: ProgressEntry[]): ProgressEntry[] {
  // 같은 시각이면 넣은 순서를 지킵니다 (Array.prototype.sort는 안정 정렬).
  return [...list].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
}

function sameFields<T extends object>(a: T, b: T): boolean {
  const ka = Object.keys(a) as (keyof T)[]
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

/**
 * 서버에서 다시 읽은 목록에, 그 사이 화면에서 바꾼 것(아직 보내지 않은 추가, 삭제, 수정)을 얹습니다.
 * base는 화면이 처음 받았던 목록입니다.
 */
function mergeFetched<T extends { id: string }>(base: T[], local: T[], fetched: T[]): T[] {
  const baseById = new Map(base.map((x) => [x.id, x]))
  const localById = new Map(local.map((x) => [x.id, x]))
  const out: T[] = []
  for (const f of fetched) {
    const was = baseById.get(f.id)
    const mine = localById.get(f.id)
    if (was && !mine) continue // 그 사이에 지운 것
    out.push(was && mine && !sameFields(was, mine) ? mine : f)
  }
  for (const l of local) if (l.id.startsWith(TMP)) out.push(l)
  return out
}

export type RecordOptions = { memo?: string; at?: string; finishingStep?: number | null }
export type RingInput = { row: number; x: number; color: string; name: string }

export type KnitLog = ReturnType<typeof useKnitLog>

export function useKnitLog(patternId: string, expanded: Expanded, initialEntries: ProgressEntry[], initialRings: RingMarker[]) {
  const base = `/api/patterns/${encodeURIComponent(patternId)}`

  // 값은 ref에 두고 state는 다시 그리게 하는 데만 씁니다. 같은 틱에 두 번 눌러도 앞의 변경이 보입니다.
  const entriesRef = useRef<ProgressEntry[]>(sortEntries(initialEntries))
  const ringsRef = useRef<RingMarker[]>(initialRings)
  const [entries, setEntriesState] = useState(entriesRef.current)
  const [rings, setRingsState] = useState(ringsRef.current)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(0)

  const setEntries = useCallback((fn: (list: ProgressEntry[]) => ProgressEntry[]) => {
    entriesRef.current = sortEntries(fn(entriesRef.current))
    setEntriesState(entriesRef.current)
  }, [])
  const setRings = useCallback((fn: (list: RingMarker[]) => RingMarker[]) => {
    ringsRef.current = fn(ringsRef.current)
    setRingsState(ringsRef.current)
  }, [])

  const seq = useRef(0)
  /** 임시 id → 서버 id. 화면의 id는 바꾸지 않아서 목록의 줄이 그대로 남습니다. */
  const realIds = useRef(new Map<string, string>())
  const realId = (id: string) => realIds.current.get(id) ?? id
  const chain = useRef<Promise<void>>(Promise.resolve())
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const enqueue = useCallback((job: () => Promise<void>, counted = true) => {
    if (counted) setPending((n) => n + 1)
    chain.current = chain.current.then(job).finally(() => {
      if (counted && alive.current) setPending((n) => Math.max(0, n - 1))
    })
  }, [])

  const fail = useCallback((e: unknown, fallback: string) => {
    if (alive.current) setError(e instanceof ApiError ? e.message : fallback)
  }, [])

  // 처음 받은 값이 오래된 것일 수 있어(뒤로 가기로 돌아왔을 때) 한 번 다시 읽습니다.
  const baseEntries = useRef(entriesRef.current)
  const baseRings = useRef(ringsRef.current)
  useEffect(() => {
    let stale = false
    enqueue(async () => {
      try {
        const [p, r] = await Promise.all([apiFetch<{ entries: ProgressEntry[] }>(`${base}/progress`), apiFetch<{ rings: RingMarker[] }>(`${base}/rings`)])
        if (stale || !alive.current) return
        const be = baseEntries.current
        const br = baseRings.current
        baseEntries.current = p.entries
        baseRings.current = r.rings
        setEntries((local) => mergeFetched(be, local, p.entries))
        setRings((local) => mergeFetched(br, local, r.rings))
      } catch {
        // 처음 받은 값으로 계속합니다.
      }
    }, false)
    return () => {
      stale = true
    }
  }, [base, enqueue, setEntries, setRings])

  // ---- 기록 ----

  /** 새 기록. 임시 id를 돌려줍니다 (되돌리기에 씁니다). */
  const record = useCallback(
    (pos: Pos, opts: RecordOptions = {}): string => {
      const tmp = `${TMP}${++seq.current}`
      const list = entriesRef.current
      const last = list[list.length - 1]
      // 마무리 단계는 앞 기록의 값을 이어 갑니다. 가장 최근 기록 하나만 봐도 지금 상태를 알 수 있습니다.
      const finishingStep = opts.finishingStep === undefined ? (last?.finishingStep ?? null) : opts.finishingStep
      const memo = (opts.memo ?? '').trim().slice(0, 500)
      let at = opts.at ?? new Date().toISOString()
      // 기기 시계가 서버보다 늦어도 방금 누른 기록이 맨 뒤에 오게 합니다.
      if (!opts.at && last && at <= last.at) at = new Date(new Date(last.at).getTime() + 1).toISOString()
      setError('')
      setEntries((l) => [...l, { id: tmp, at, row: pos.row, stitch: pos.stitch, finishingStep, memo }])
      enqueue(async () => {
        try {
          const { entry } = await apiFetch<{ entry: ProgressEntry }>(`${base}/progress`, {
            method: 'POST',
            json: { row: pos.row, stitch: pos.stitch, finishingStep, memo, ...(opts.at ? { at: opts.at } : {}) },
          })
          realIds.current.set(tmp, entry.id)
          setEntries((l) => l.map((e) => (e.id === tmp ? { ...entry, id: tmp, memo: e.memo } : e)))
        } catch (e) {
          setEntries((l) => l.filter((x) => x.id !== tmp))
          fail(e, '기록을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
      return tmp
    },
    [base, enqueue, fail, setEntries],
  )

  const removeEntry = useCallback(
    (id: string) => {
      const target = entriesRef.current.find((e) => e.id === id)
      if (!target) return
      setError('')
      setEntries((l) => l.filter((e) => e.id !== id))
      enqueue(async () => {
        const real = realId(id)
        if (real.startsWith(TMP)) return // 저장되지 못한 기록
        try {
          await apiFetch(`${base}/progress/${encodeURIComponent(real)}`, { method: 'DELETE' })
        } catch (e) {
          setEntries((l) => (l.some((x) => x.id === id) ? l : [...l, target]))
          fail(e, '기록을 지우지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
    },
    [base, enqueue, fail, setEntries],
  )

  const editMemo = useCallback(
    (id: string, memo: string) => {
      const target = entriesRef.current.find((e) => e.id === id)
      const next = memo.trim().slice(0, 500)
      if (!target || target.memo === next) return
      const before = target.memo
      setError('')
      setEntries((l) => l.map((e) => (e.id === id ? { ...e, memo: next } : e)))
      enqueue(async () => {
        const real = realId(id)
        if (real.startsWith(TMP)) return
        try {
          await apiFetch(`${base}/progress/${encodeURIComponent(real)}`, { method: 'PATCH', json: { memo: next } })
        } catch (e) {
          setEntries((l) => l.map((x) => (x.id === id && x.memo === next ? { ...x, memo: before } : x)))
          fail(e, '메모를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
    },
    [base, enqueue, fail, setEntries],
  )

  // ---- 단수링 ----

  const addRing = useCallback(
    (input: RingInput): string => {
      const tmp = `${TMP}r${++seq.current}`
      const name = input.name.trim().slice(0, 40)
      setError('')
      setRings((l) => [...l, { id: tmp, row: input.row, x: input.x, color: input.color, name }])
      enqueue(async () => {
        try {
          const { ring } = await apiFetch<{ ring: RingMarker }>(`${base}/rings`, { method: 'POST', json: { row: input.row, x: input.x, color: input.color, name } })
          realIds.current.set(tmp, ring.id)
        } catch (e) {
          setRings((l) => l.filter((x) => x.id !== tmp))
          fail(e, '단수링을 달지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
      return tmp
    },
    [base, enqueue, fail, setRings],
  )

  const patchRing = useCallback(
    (id: string, patch: { color?: string; name?: string }) => {
      const target = ringsRef.current.find((r) => r.id === id)
      if (!target) return
      const next: RingMarker = { ...target, ...(patch.color ? { color: patch.color } : {}), ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 40) } : {}) }
      if (next.color === target.color && next.name === target.name) return
      setError('')
      setRings((l) => l.map((r) => (r.id === id ? next : r)))
      enqueue(async () => {
        const real = realId(id)
        if (real.startsWith(TMP)) return
        try {
          await apiFetch(`${base}/rings/${encodeURIComponent(real)}`, { method: 'PATCH', json: { color: next.color, name: next.name } })
        } catch (e) {
          setRings((l) => l.map((r) => (r.id === id && r.color === next.color && r.name === next.name ? target : r)))
          fail(e, '단수링을 고치지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
    },
    [base, enqueue, fail, setRings],
  )

  /** 단수링을 뺍니다. 뺀 링을 돌려줍니다 (되돌리기에 씁니다). */
  const removeRing = useCallback(
    (id: string): RingMarker | null => {
      const target = ringsRef.current.find((r) => r.id === id)
      if (!target) return null
      setError('')
      setRings((l) => l.filter((r) => r.id !== id))
      enqueue(async () => {
        const real = realId(id)
        if (real.startsWith(TMP)) return
        try {
          await apiFetch(`${base}/rings/${encodeURIComponent(real)}`, { method: 'DELETE' })
        } catch (e) {
          setRings((l) => (l.some((x) => x.id === id) ? l : [...l, target]))
          fail(e, '단수링을 빼지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
        }
      })
      return target
    },
    [base, enqueue, fail, setRings],
  )

  const clearError = useCallback(() => setError(''), [])

  const derived = useMemo(() => {
    const latest = entries.length ? entries[entries.length - 1] : null
    const raw: Pos = latest ? { row: latest.row, stitch: latest.stitch } : START
    return {
      latest,
      /** 지금 위치 (지금 뜰 단 기준). 기록이 없으면 첫 단 0코 */
      saved: workingPos(expanded, raw),
      /** 마지막 단까지 다 떴는지 */
      complete: latest ? isComplete(expanded, raw) : false,
      /** 끝낸 마무리 단계 수 */
      finishingDone: Math.max(0, latest?.finishingStep ?? 0),
    }
  }, [entries, expanded])

  return { entries, rings, error, clearError, busy: pending > 0, record, removeEntry, editMemo, addRing, patchRing, removeRing, ...derived }
}
