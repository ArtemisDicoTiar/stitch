'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { expand, rowAt, stitchesDone } from '@stitch/engine'
import type { Pattern, SymbolId } from '@stitch/pattern-ir'
import type { PickPosition } from '@stitch/render-3d'
import type { Avatar } from '@stitch/render-3d/avatar'
import { supportsTemplate } from '@stitch/render-3d/garment'
import type { ChartPick } from '@stitch/render-chart'
import { symbolsIn, type TutorialId } from '@stitch/tutorials'
import type { PatternView, ProgressEntry, RingMarker } from '@/server/patterns'
import { ChartPanel } from './ChartPanel'
import { InfoPanel, gaugeText } from './InfoPanel'
import { LogPanel } from './LogPanel'
import { ProgressBadge, type ShownKind } from './ProgressBadge'
import { RecordPanel } from './RecordPanel'
import { RingPanel, ringWhere, type RingTarget } from './RingPanel'
import { Stage3D, type ClickMode } from './Stage3D'
import { StepGuide } from './StepGuide'
import { ToolsRow } from './ToolsRow'
import { TutorialPanel } from './TutorialPanel'
import { cellsIn, clampPos, isComplete, percentOf, posFromStitches, posText, rowUp, workingPos, type Pos } from './position'
import { onTabKey } from './tabs'
import { useKnitLog } from './useKnitLog'
import styles from './Workspace.module.css'

type Props = {
  view: PatternView
  ir: Pattern
  initialEntries: ProgressEntry[]
  initialRings: RingMarker[]
  avatar: Avatar
  /** 서버가 이 화면을 만든 시각. 뒤로 가기로 예전 화면이 되살아났는지 알아보는 데 씁니다. */
  renderedAt: number
}

type TabKey = 'chart' | 'howto' | 'steps' | 'log'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'chart', label: '전체 기호 도안' },
  { key: 'howto', label: '기호별 뜨는 법' },
  { key: 'steps', label: '단계별 안내' },
  { key: 'log', label: '내 기록' },
]
const TAB_KEYS = TABS.map((t) => t.key)

/** 저장하지 않고 잠깐 보여 주는 위치: 지난 기록, 기록 재생, 단 재생 */
type Peek = { kind: 'entry' | 'replay' | 'play'; pos: Pos; at?: string; id?: string }
type Notice = { key: number; text: string; undo?: () => void }

/** 3D 모듈을 읽기 전에 쓰는 단수링 색. 모듈이 준비되면 그쪽 값(RING_COLORS)으로 바꿉니다. */
const RING_COLORS_FALLBACK: readonly string[] = ['#e8590c', '#1f6fd1', '#2f9e44', '#c2255c', '#f0b400', '#7048e8']

/** 이미 한 번 그린 서버 응답. 같은 응답으로 다시 그려지면 뒤로 가기로 되살아난 화면입니다. */
const seenRenders = new Set<number>()

/** 언제나 가장 새 함수를 부르는, 모양이 바뀌지 않는 콜백 */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: A) => ref.current(...args), [])
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function WorkspaceScreen({ view, ir, initialEntries, initialRings, avatar, renderedAt }: Props) {
  const router = useRouter()
  const expanded = useMemo(() => expand(ir), [ir])
  const symbols = useMemo(() => symbolsIn(expanded), [expanded])
  const log = useKnitLog(view.id, expanded, initialEntries, initialRings)
  const base = `/patterns/${encodeURIComponent(view.id)}`

  const [draft, setDraft] = useState<Pos | null>(null)
  const [peek, setPeek] = useState<Peek | null>(null)
  const [tab, setTab] = useState<TabKey>('chart')
  const [howtoSeen, setHowtoSeen] = useState(false)
  const [pick, setPick] = useState<ChartPick | null>(null)
  const [tutorial, setTutorial] = useState<TutorialId>(symbols[0] ?? 'K')
  const [mode, setMode] = useState<ClickMode>('view')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [ringColors, setRingColors] = useState(RING_COLORS_FALLBACK)
  const [liveText, setLiveText] = useState('')
  const [bodyInView, setBodyInView] = useState(false)
  const [dockH, setDockH] = useState(0)
  const [no3d, setNo3d] = useState(!supportsTemplate(ir.template))
  const on3dUnavailable = useCallback(() => setNo3d(true), [])
  const noticeSeq = useRef(0)

  const started = log.entries.length > 0
  const form = draft ?? log.saved
  const shown = peek?.pos ?? form
  const kind: ShownKind = peek ? peek.kind : draft ? 'draft' : 'live'
  const work = workingPos(expanded, form)
  const total = expanded.totalRows
  const endPos = useMemo<Pos>(() => ({ row: Math.max(1, total), stitch: cellsIn(expanded, total) }), [expanded, total])
  const hasMannequin = supportsTemplate(ir.template) && ir.template !== 'flat'

  const say = useCallback((text: string, undo?: () => void) => setNotice({ key: ++noticeSeq.current, text, undo }), [])

  // 알림은 조금 뒤에 사라집니다.
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice((n) => (n && n.key === notice.key ? null : n)), notice.undo ? 8000 : 5000)
    return () => clearTimeout(t)
  }, [notice])

  // 뒤로 가기로 예전 응답이 되살아났으면 서버에서 다시 읽습니다 (게이지, 마네킹이 그 사이 바뀌었을 수 있습니다).
  const checked = useRef(false)
  useEffect(() => {
    if (checked.current) {
      // 다시 읽어 온 응답도 한 번 그린 것으로 적어 둡니다.
      seenRenders.add(renderedAt)
      return
    }
    checked.current = true
    if (seenRenders.has(renderedAt)) router.refresh()
    else seenRenders.add(renderedAt)
  }, [renderedAt, router])

  // 위치가 바뀌면 스크린 리더에 알립니다. 재생 중에는 알리지 않습니다.
  const liveSource = kind === 'play' || kind === 'replay' ? null : `${kind}:${shown.row}:${shown.stitch}:${log.entries.length}`
  useEffect(() => {
    if (liveSource === null) return
    const t = setTimeout(() => {
      const p = workingPos(expanded, shown)
      const where = isComplete(expanded, shown) ? '뜨기 완료' : posText(expanded, p)
      const pct = percentOf(expanded, shown)
      setLiveText(kind === 'draft' ? `미리보기 ${where}. 아직 저장하지 않았어요.` : kind === 'entry' ? `지난 기록 ${where}, 전체의 ${pct}%` : started ? `지금 위치 ${where}, 전체의 ${pct}%` : '아직 기록이 없어요.')
    }, 500)
    return () => clearTimeout(t)
    // liveSource가 위치와 종류를 모두 담고 있습니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSource])

  // ---- 기록 ----

  const recordAt = useStable((pos: Pos, opts: { memo?: string; at?: string } = {}) => {
    const p = clampPos(expanded, pos)
    const latest = log.latest
    setDraft(null)
    setPeek(null)
    const id = log.record(p, opts)
    const backdated = !!opts.at && !!latest && opts.at < latest.at
    say(backdated ? `${posText(expanded, workingPos(expanded, p))} 기록했어요. 지난 시각의 기록이라 지금 위치는 그대로예요.` : `${posText(expanded, workingPos(expanded, p))}${isComplete(expanded, p) ? '' : '까지'} 기록했어요.`, () => log.removeEntry(id))
  })

  const onRowUp = useStable(() => {
    const from = workingPos(expanded, form)
    const next = rowUp(expanded, form)
    setDraft(null)
    setPeek(null)
    const id = log.record(next)
    say(`${from.row}단을 다 뜬 것으로 기록했어요.`, () => log.removeEntry(id))
  })

  const onSave = useStable((opts: { memo: string; at?: string }) => recordAt(form, opts))

  const onFinishing = useStable((step: number, done: boolean) => {
    const f = ir.finishing[step - 1]
    if (!f) return
    setDraft(null)
    setPeek(null)
    const id = log.record(endPos, { finishingStep: done ? step : step - 1, memo: `${f.name} ${done ? '완료' : '취소'}` })
    say(`${f.name} ${done ? '끝낸 것으로' : '취소로'} 기록했어요.`, () => log.removeEntry(id))
  })

  const onDraft = useStable((pos: Pos) => {
    setPeek(null)
    const p = clampPos(expanded, pos)
    // 저장된 위치와 같아지면 고치는 중이 아닙니다.
    setDraft(p.row === log.saved.row && p.stitch === log.saved.stitch ? null : p)
  })
  const onReset = useStable(() => {
    setDraft(null)
    setPeek(null)
  })

  const onDelete = useStable((id: string) => {
    if (peek?.id === id) setPeek(null)
    log.removeEntry(id)
  })

  // ---- 지난 기록 보기와 기록 재생 ----

  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }, [])

  const replayRaf = useRef(0)
  const stopReplay = useCallback(() => {
    if (replayRaf.current) cancelAnimationFrame(replayRaf.current)
    replayRaf.current = 0
  }, [])
  useEffect(() => stopReplay, [stopReplay])

  /** 미리 보는 위치가 그려지는 곳으로 갑니다: 3D가 있으면 무대, 없으면 기호 도안 */
  const reveal = useStable(() => {
    if (no3d) {
      setTab('chart')
      scrollTo('tabs')
    } else scrollTo('stage')
  })

  const onView = useStable((entry: ProgressEntry | null) => {
    stopReplay()
    setPeek(entry ? { kind: 'entry', pos: workingPos(expanded, { row: entry.row, stitch: entry.stitch }), at: entry.at, id: entry.id } : null)
    if (entry) reveal()
  })
  const onBackToNow = useStable(() => {
    stopReplay()
    setPeek(null)
  })

  const onReplay = useStable(() => {
    if (replayRaf.current) {
      stopReplay()
      setPeek(null)
      return
    }
    const list = log.entries
    if (list.length === 0) return
    if (prefersReducedMotion()) {
      say('움직임 줄이기 설정이 켜져 있어 기록 재생은 건너뛰어요. 목록의 ‘그때 모습’으로 하나씩 볼 수 있어요.')
      return
    }
    const ts = list.map((e) => new Date(e.at).getTime())
    const ps = list.map((e) => stitchesDone(expanded, { row: e.row, stitch: e.stitch }))
    const tN = ts[ts.length - 1]
    const t0 = ts[0] - Math.max(36e5, (tN - ts[0]) * 0.08)
    const start = performance.now()
    let last = 0
    reveal()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 7000)
      // 화면 전체를 다시 그리므로 1초에 스무 번쯤만 바꿉니다.
      if (now - last >= 50 || t >= 1) {
        last = now
        const cur = t0 + (tN - t0) * t
        let i = 0
        while (i < ts.length && ts[i] <= cur) i++
        const pA = i === 0 ? 0 : ps[i - 1]
        const tA = i === 0 ? t0 : ts[i - 1]
        const p = i >= ts.length ? ps[ts.length - 1] : pA + (ps[i] - pA) * ((cur - tA) / Math.max(1, ts[i] - tA))
        setPeek({ kind: 'replay', pos: posFromStitches(expanded, p), at: new Date(cur).toISOString() })
      }
      if (t < 1) replayRaf.current = requestAnimationFrame(tick)
      else {
        replayRaf.current = 0
        setTimeout(() => setPeek((v) => (v?.kind === 'replay' ? null : v)), 900)
      }
    }
    replayRaf.current = requestAnimationFrame(tick)
  })

  const onPlayPos = useStable((pos: Pos | null) => {
    if (pos) {
      stopReplay()
      setPeek({ kind: 'play', pos })
    } else setPeek((v) => (v?.kind === 'play' ? null : v))
  })

  // ---- 단수링 ----

  const toggleRingAt = useStable((row: number, x: number) => {
    const where = ringWhere(expanded, row, x)
    const existing = log.rings.find((r) => r.row === row && r.x === x)
    if (existing) {
      const removed = log.removeRing(existing.id)
      say(`${where}의 단수링을 뺐어요.`, removed ? () => log.addRing({ row: removed.row, x: removed.x, color: removed.color, name: removed.name }) : undefined)
    } else {
      const id = log.addRing({ row, x, color: ringColors[log.rings.length % ringColors.length], name: '' })
      say(`${where}에 단수링을 달았어요.`, () => log.removeRing(id))
    }
  })

  const onRemoveRing = useStable((id: string) => {
    const removed = log.removeRing(id)
    if (removed) say(`${ringWhere(expanded, removed.row, removed.x)}의 단수링을 뺐어요.`, () => log.addRing({ row: removed.row, x: removed.x, color: removed.color, name: removed.name }))
  })

  const ringTarget = useMemo<RingTarget | null>(() => {
    if (pick) return { row: pick.row, x: pick.x, from: 'pick' }
    const r = rowAt(expanded, work.row)
    const cell = r?.cells[Math.min(work.stitch, Math.max(0, r.cells.length - 1))]
    return r && cell ? { row: work.row, x: cell.x, from: 'now' } : null
  }, [pick, expanded, work.row, work.stitch])

  // ---- 3D와 도안에서 고르기 ----

  const onPick3d = useStable((p: PickPosition) => {
    if (mode === 'pos') {
      const next = clampPos(expanded, { row: p.row, stitch: p.stitch })
      setPeek(null)
      setDraft(next)
      say(`${posText(expanded, next)}로 입력했어요. 맞으면 ‘여기까지 떴어요’를 눌러 주세요.`)
    } else if (mode === 'ring') toggleRingAt(p.row, p.x)
  })

  const onRecordPick = useStable((p: ChartPick) => {
    setPick(null)
    recordAt({ row: p.row, stitch: p.stitch })
  })
  const onPreviewPick = useStable((p: ChartPick) => {
    setPick(null)
    setPeek(null)
    setDraft(clampPos(expanded, { row: p.row, stitch: p.stitch }))
    say(`${posText(expanded, clampPos(expanded, { row: p.row, stitch: p.stitch }))}까지 뜬 모습을 미리 보고 있어요. 맞으면 ‘여기까지 떴어요’를 눌러 주세요.`)
  })
  const onToggleRingPick = useStable((p: ChartPick) => toggleRingAt(p.row, p.x))

  const selectTab = useStable((key: TabKey) => {
    setTab(key)
    if (key === 'howto') setHowtoSeen(true)
    if (key !== 'chart') setPick(null)
  })
  const onHowTo = useStable((s: SymbolId) => {
    // 뜨는 법이 있는 기호만 탭을 바꿉니다.
    const id = symbols.find((t) => t === s)
    if (id) setTutorial(id)
    setPick(null)
    selectTab('howto')
    scrollTo('tabs')
  })

  // ---- 휴대폰: 아래 막대의 높이만큼 본문 아래를 비웁니다 ----

  const dock = useRef<HTMLDivElement>(null)
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = dock.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    const measure = () => {
      const h = getComputedStyle(el).position === 'fixed' ? el.offsetHeight : 0
      setDockH(h)
      // 키보드로 옮겨 간 단추가 막대 밑에 가려지지 않게 합니다.
      root.style.scrollPaddingBottom = h > 0 ? `${h + (nav.current?.offsetHeight ?? 0) + 8}px` : ''
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      root.style.scrollPaddingBottom = ''
    }
  }, [])

  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = body.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => setBodyInView(es[es.length - 1]?.isIntersecting ?? false), { rootMargin: '-45% 0px -45% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const navTo = (key: TabKey | 'stage') => {
    if (key === 'stage') return scrollTo('stage')
    selectTab(key)
    scrollTo('tabs')
  }
  const navCurrent: TabKey | 'stage' = bodyInView ? tab : 'stage'

  const gaugeChip = view.gaugeMode === 'recalc' && view.myGauge ? `내 게이지 ${gaugeText(view.myGauge)} 적용` : view.gaugeMode === 'remeasure' ? '바늘을 바꿔 다시 재기' : '도안 숫자 그대로'
  const pickHasRing = pick ? log.rings.some((r) => r.row === pick.row && r.x === pick.x) : false

  const badge = (
    <ProgressBadge
      expanded={expanded}
      kind={kind}
      shown={shown}
      started={started}
      at={kind === 'live' ? (log.latest?.at ?? null) : (peek?.at ?? null)}
      finishingTotal={ir.finishing.length}
      finishingDone={log.finishingDone}
      onBack={onBackToNow}
    />
  )

  return (
    <div className={styles.page} style={{ '--dock-h': `${dockH}px` } as CSSProperties}>
      <div className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{view.title}</h1>
            <span className={styles.gaugeChip}>{gaugeChip}</span>
            <div className={styles.titleLinks}>
              <Link href={`${base}/gauge`} className={styles.ghostLink}>
                게이지 다시 맞추기
              </Link>
              {hasMannequin && (
                <Link href="/mannequin" className={styles.ghostLink}>
                  마네킹 꾸미기
                  <span className={styles.plus}>플러스</span>
                </Link>
              )}
            </div>
          </div>

          <ToolsRow ir={ir} expanded={expanded} pos={form} started={started} finishingDone={log.complete ? log.finishingDone : 0} />

          <div className={styles.stageRow} data-3d={no3d ? 'none' : 'on'}>
            <div className={styles.stageCol} id="stage">
              <Stage3D
                expanded={expanded}
                template={ir.template}
                gauge={ir.gauge}
                title={view.title}
                shown={shown}
                rings={log.rings}
                avatar={avatar}
                mode={mode}
                onMode={setMode}
                onPick={onPick3d}
                onRingColors={setRingColors}
                onUnavailable={on3dUnavailable}
                badge={badge}
              />
            </div>

            <div className={styles.side}>
              <div className={styles.dock} ref={dock}>
                <RecordPanel
                  expanded={expanded}
                  pos={form}
                  dirty={draft !== null}
                  complete={log.complete}
                  finishing={ir.finishing}
                  finishingDone={log.finishingDone}
                  onDraft={onDraft}
                  onReset={onReset}
                  onRowUp={onRowUp}
                  onSave={onSave}
                  onFinish={(step) => onFinishing(step, true)}
                />
              </div>
              <RingPanel expanded={expanded} rings={log.rings} colors={ringColors} target={ringTarget} onAdd={log.addRing} onPatch={log.patchRing} onRemove={onRemoveRing} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.body} ref={body}>
        <div className={styles.bodyInner}>
          <div className={styles.tabs} id="tabs" role="tablist" aria-label="페이지 구역" onKeyDown={(e) => onTabKey(e, TAB_KEYS, tab, selectTab)}>
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`panel-${t.key}`} tabIndex={tab === t.key ? 0 : -1} className={styles.tab} onClick={() => selectTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="panel-chart" aria-labelledby="tab-chart" className={styles.panel} hidden={tab !== 'chart'}>
            <ChartPanel
              expanded={expanded}
              symbols={symbols}
              shown={shown}
              saved={log.saved}
              rings={log.rings}
              pick={pick}
              pickHasRing={pickHasRing}
              onPick={setPick}
              onRecordPick={onRecordPick}
              onPreviewPick={onPreviewPick}
              onToggleRing={onToggleRingPick}
              onHowTo={onHowTo}
              active={tab === 'chart'}
            />
          </div>

          <div role="tabpanel" id="panel-howto" aria-labelledby="tab-howto" className={styles.panel} hidden={tab !== 'howto'}>
            {(howtoSeen || tab === 'howto') && symbols.length > 0 && <TutorialPanel expanded={expanded} symbols={symbols} symbol={tutorial} onSymbol={setTutorial} workRow={work.row} />}
            {symbols.length === 0 && <p className={styles.empty}>이 도안에 나온 기호의 뜨는 법이 아직 없어요.</p>}
          </div>

          <div role="tabpanel" id="panel-steps" aria-labelledby="tab-steps" className={styles.panel} hidden={tab !== 'steps'}>
            {tab === 'steps' && <StepGuide expanded={expanded} form={form} shown={shown} rings={log.rings} onPlayPos={onPlayPos} onHowTo={onHowTo} />}
          </div>

          <div role="tabpanel" id="panel-log" aria-labelledby="tab-log" className={styles.panel} hidden={tab !== 'log'}>
            {tab === 'log' && (
              <LogPanel
                expanded={expanded}
                entries={log.entries}
                saved={log.saved}
                complete={log.complete}
                finishing={ir.finishing}
                finishingDone={log.finishingDone}
                viewingId={peek?.kind === 'entry' ? (peek.id ?? null) : null}
                replaying={peek?.kind === 'replay'}
                onView={onView}
                onReplay={onReplay}
                onDelete={onDelete}
                onEditMemo={log.editMemo}
                onFinishing={onFinishing}
              />
            )}
          </div>

          <InfoPanel patternId={view.id} ir={ir} patternGauge={view.originalIr?.gauge ?? ir.gauge} gaugeMode={view.gaugeMode} myGauge={view.myGauge} hasPdf={view.hasPdf} />
        </div>
      </div>

      <nav className={styles.phoneNav} ref={nav} aria-label="페이지 구역으로 가기">
        <button type="button" aria-current={navCurrent === 'stage' ? 'true' : undefined} onClick={() => navTo('stage')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l8 4.500v9L12 21l-8-4.500v-9z" />
            <path d="M12 12l8-4.500" />
            <path d="M12 12v9" />
            <path d="M12 12L4 7.500" />
          </svg>
          {no3d ? '진행' : '3D'}
        </button>
        <button type="button" aria-current={navCurrent === 'chart' ? 'true' : undefined} onClick={() => navTo('chart')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M4 9.300h16" />
            <path d="M4 14.700h16" />
            <path d="M9.300 4v16" />
            <path d="M14.700 4v16" />
          </svg>
          도안
        </button>
        <button type="button" aria-current={navCurrent === 'howto' || navCurrent === 'steps' ? 'true' : undefined} onClick={() => navTo('howto')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M10 8.500l5.500 3.500-5.500 3.500z" />
          </svg>
          뜨는 법
        </button>
        <button type="button" aria-current={navCurrent === 'log' ? 'true' : undefined} onClick={() => navTo('log')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 5v14h16" />
            <path d="M8 15l4-4 3 3 5-6" />
          </svg>
          기록
        </button>
      </nav>

      <div className={styles.toasts}>
        {log.error && (
          <div className={styles.toast} data-kind="error" role="alert" data-testid="save-error">
            <span>{log.error}</span>
            <button type="button" className={styles.toastBtn} onClick={log.clearError}>
              닫기
            </button>
          </div>
        )}
        {notice && (
          <div className={styles.toast} role="status" data-testid="notice">
            <span>{notice.text}</span>
            {notice.undo && (
              <button
                type="button"
                className={styles.toastBtn}
                onClick={() => {
                  notice.undo?.()
                  setNotice(null)
                }}
              >
                되돌리기
              </button>
            )}
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite" data-testid="position-live">
        {liveText}
      </p>
    </div>
  )
}
