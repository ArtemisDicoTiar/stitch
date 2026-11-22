'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Fragment, useDeferredValue, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { compareGauge, regauge } from '@stitch/engine'
import type { Gauge, GaugeSize, Pattern } from '@stitch/pattern-ir'
import { ApiError, apiFetch } from '@/lib/api'
import type { PatternView } from '@/server/patterns'
import {
  LIMITS,
  availableFits,
  buildTable,
  bump,
  cleanInput,
  effective,
  fmt,
  gaugeText,
  heightNote,
  isSizeSensitive,
  needleSuggestion,
  parseNumber,
  recalcNote,
  startLabel,
  swatchSize,
  withRo,
  type Fit,
  type Limit,
} from './logic'
import styles from './GaugeScreen.module.css'

type Mode = 'measure' | 'skip'
type SaveBody = { mode: 'as_is' | 'recalc' | 'remeasure'; gauge: GaugeSize | null }

type Props = {
  patternId: string
  title: string
  /** 원본 IR. 이 화면의 모든 숫자는 여기서 나옵니다. */
  originalIr: Pattern
  gaugeMode: PatternView['gaugeMode']
  myGauge: GaugeSize | null
  versionKind: PatternView['versionKind']
  /** 이미 남긴 기록과 단수링의 수 */
  records: { entries: number; rings: number }
}

/** 잰 게이지 하나에 대해 화면이 보여 줄 것을 한 번에 구합니다. 다시 계산은 엔진이 합니다. */
function derive(ir: Pattern, base: Gauge, mine: GaugeSize) {
  const cmp = compareGauge(base, mine)
  const result = regauge(ir, mine)
  return { mine, cmp, result, fits: availableFits(cmp, result) }
}

type View = ReturnType<typeof derive>

const pickFit = (fits: Fit[], pref: Fit | null): Fit => (pref && fits.includes(pref) ? pref : fits[0])

const sameGauge = (a: GaugeSize | null, b: GaugeSize | null) => (a === null || b === null ? a === b : a.stitches === b.stitches && a.rows === b.rows)

export function GaugeScreen({ patternId, title, originalIr, ...saved }: Props) {
  const router = useRouter()
  // 들어왔을 때의 저장 상태를 붙잡아 둡니다. 저장한 뒤 넘어가는 사이에 화면이 바뀌어 보이지 않게 합니다.
  const [{ gaugeMode, myGauge, versionKind, records }] = useState(saved)
  const base = originalIr.gauge
  const first = gaugeMode === 'unset'
  const sensitive = isSizeSensitive(originalIr)
  const workHref = `/patterns/${encodeURIComponent(patternId)}`

  // 처음 온 사람: 크기가 맞아야 하는 도안이면 재는 쪽을 먼저 보여 주고, 아니면 그대로 뜨는 쪽을 먼저 보여 줍니다.
  // 다시 온 사람: 지금 상태를 그대로 보여 줍니다.
  const [mode, setMode] = useState<Mode>(() => {
    if (!base) return 'skip'
    if (first) return sensitive ? 'measure' : 'skip'
    return gaugeMode === 'as_is' && !myGauge ? 'skip' : 'measure'
  })
  const seed = myGauge ?? base
  const [sts, setSts] = useState(seed ? fmt(seed.stitches) : '')
  const [rows, setRows] = useState(seed ? fmt(seed.rows) : '')
  // 처음에는 칸에 도안 게이지가 들어 있습니다. 숫자를 건드리기 전에는 "쟀더니 같다"고 말하지 않습니다.
  const [touched, setTouched] = useState(myGauge !== null)
  const [pref, setPref] = useState<Fit | null>(gaugeMode === 'recalc' ? 'recalc' : gaugeMode === 'remeasure' ? 'needle' : gaugeMode === 'as_is' ? 'keep' : null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skipHeading = useRef<HTMLHeadingElement>(null)

  const s = base ? effective(sts, base.stitches, LIMITS.stitches) : 0
  const r = base ? effective(rows, base.rows, LIMITS.rows) : 0
  // 큰 도안에서는 다시 계산이 조금 걸릴 수 있어, 글자를 치는 동안 입력이 밀리지 않게 합니다.
  const ds = useDeferredValue(s)
  const dr = useDeferredValue(r)
  const view = useMemo(() => (base ? derive(originalIr, base, { stitches: ds, rows: dr }) : null), [originalIr, base, ds, dr])
  const fit = view ? pickFit(view.fits, pref) : 'keep'

  /**
   * 고른 대로 서버에 보낼 값.
   * 재지 않고 뜨거나, 칸의 도안 게이지를 건드리지 않고 그대로 넘어가면 잰 것으로 적지 않습니다(gauge: null).
   */
  function toBody(v: View | null): SaveBody {
    if (mode === 'skip' || !v) return { mode: 'as_is', gauge: null }
    const chosen = pickFit(v.fits, pref)
    if (chosen === 'recalc') return { mode: 'recalc', gauge: v.mine }
    if (chosen === 'needle') return { mode: 'remeasure', gauge: v.mine }
    return { mode: 'as_is', gauge: touched ? v.mine : null }
  }

  const next = toBody(view)
  const unchanged = !first && next.mode === gaugeMode && sameGauge(next.gauge, myGauge)
  // 서버는 쓰는 버전이 바뀔 때 기록과 단수링을 옮깁니다: 다시 계산하면 늘 새 버전이고, 그 밖에는 파생본에서 원본으로 돌아갈 때입니다.
  const versionChanges = !unchanged && (next.mode === 'recalc' || versionKind === 'gauge')
  const hasRecords = records.entries + records.rings > 0

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      // 누르는 순간의 숫자로 다시 구해 보냅니다 (화면의 계산은 입력보다 한 박자 늦을 수 있습니다).
      const now = base ? derive(originalIr, base, { stitches: s, rows: r }) : null
      await apiFetch(`/api/patterns/${encodeURIComponent(patternId)}/gauge`, { method: 'POST', json: toBody(now) })
      // 뒤로 돌아왔을 때 저장한 상태가 보이도록 이 화면의 캐시를 비우고 넘어갑니다.
      router.refresh()
      router.push(workHref)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      setSaving(false)
    }
  }

  function goSkip() {
    setMode('skip')
    setError(null)
    requestAnimationFrame(() => {
      skipHeading.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0 })
    })
  }

  const label = saving
    ? '저장하는 중…'
    : mode === 'skip' || fit === 'keep'
      ? first
        ? '도안 숫자 그대로 페이지 만들기'
        : '도안 숫자 그대로 뜨기'
      : fit === 'recalc'
        ? first
          ? '이 코 수로 페이지 만들기'
          : '이 코 수로 바꾸기'
        : '스와치를 다시 뜨고 올게요'

  // 재기를 권하는 말은 크기가 맞아야 하는 도안에만 띄웁니다 (isSizeSensitive).
  const measureSub = !base
    ? '이 도안에는 게이지가 적혀 있지 않아 잰 숫자와 비교할 수 없어요.'
    : sensitive
      ? '모자나 옷처럼 크기가 맞아야 하는 도안이에요. 재 보고 시작하기를 권해요.'
      : '완성 크기를 도안과 같게 맞추고 싶을 때 재요.'

  const actions = (
    <div className={styles.actions}>
      {versionChanges && hasRecords ? (
        <p className="notice" data-testid="move-notice">
          지금까지 남긴 {recordsText(records)} 새 숫자의 같은 구간, 같은 비율 위치로 옮겨져요. 지워지지 않아요.
        </p>
      ) : null}
      <div className={styles.bar}>
        {error ? (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        ) : null}
        {unchanged ? (
          <Link href={workHref} className={`btn btn-primary btn-lg ${styles.primary}`}>
            바꾸지 않고 작업 화면으로
          </Link>
        ) : (
          <button type="button" className={`btn btn-primary btn-lg ${styles.primary}`} onClick={save} disabled={saving}>
            {label}
          </button>
        )}
        {mode === 'measure' ? (
          <button type="button" className={styles.secondary} onClick={goSkip}>
            재지 않고 도안 숫자 그대로 뜨기
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className={styles.shell}>
      <div className={`wrap ${styles.page}`}>
        <div className={styles.top}>
          {first ? <Steps /> : <CurrentState gaugeMode={gaugeMode} myGauge={myGauge} title={title} workHref={workHref} tool={originalIr.craft === 'crochet' ? '코바늘' : '바늘'} />}
          <div className={styles.intro}>
            <h1 className={styles.h1}>내 게이지에 맞추기</h1>
            <p className={styles.lead}>
              게이지는 10cm 안에 들어가는 코와 단의 수예요. 손땀이 다르면 같은 코 수로 떠도 크기가 달라져요. 재서 맞출 수도 있고, 재지 않고 도안 숫자 그대로 뜰 수도 있어요.
            </p>
          </div>
        </div>

        <div role="radiogroup" aria-label="게이지를 어떻게 할지 고르기" className={styles.modes}>
          <label className={styles.mode} data-on={mode === 'measure'} data-disabled={!base}>
            <input
              type="radio"
              name="gmode"
              checked={mode === 'measure'}
              disabled={!base}
              onChange={() => {
                setMode('measure')
                setError(null)
              }}
            />
            <span className={styles.modeText}>
              <strong>
                <span className={styles.long}>스와치를 재서 맞출게요</span>
                <span className={styles.short}>재서 맞추기</span>
              </strong>
              <span className={styles.modeSub}>{measureSub}</span>
            </span>
          </label>
          <label className={styles.mode} data-on={mode === 'skip'}>
            <input
              type="radio"
              name="gmode"
              checked={mode === 'skip'}
              onChange={() => {
                setMode('skip')
                setError(null)
              }}
            />
            <span className={styles.modeText}>
              <strong>
                <span className={styles.long}>재지 않고 도안 숫자 그대로 뜰게요</span>
                <span className={styles.short}>재지 않고 뜨기</span>
              </strong>
              <span className={styles.modeSub}>바로 뜨기 시작해요. 나중에 언제든 다시 맞출 수 있어요.</span>
            </span>
          </label>
        </div>

        {/* 휴대폰에서는 두 선택지가 단추 한 줄이라, 고른 쪽의 설명을 그 아래 한 줄로 보여 줍니다. */}
        {mode === 'measure' && base ? (
          <p className={styles.modeHint} data-testid="mode-hint">
            {sensitive ? '크기가 맞아야 하는 도안이라 재 보기를 권해요.' : measureSub}
          </p>
        ) : null}

        {mode === 'measure' && base && view ? (
          <Measure
            ir={originalIr}
            base={base}
            view={view}
            touched={touched}
            fit={fit}
            onFit={(f) => {
              setPref(f)
              setError(null)
            }}
            sts={sts}
            rows={rows}
            onSts={(v) => {
              setTouched(true)
              setError(null)
              setSts(v)
            }}
            onRows={(v) => {
              setTouched(true)
              setError(null)
              setRows(v)
            }}
            settleSts={setSts}
            settleRows={setRows}
            actions={actions}
          />
        ) : (
          <Skip ir={originalIr} sensitive={sensitive} first={first} headingRef={skipHeading} actions={actions} />
        )}
      </div>
    </div>
  )
}

function recordsText(records: { entries: number; rings: number }): string {
  const parts: string[] = []
  if (records.entries > 0) parts.push(`기록 ${records.entries}개`)
  if (records.rings > 0) parts.push(`단수링 ${records.rings}개`)
  // "…개는 / …개와 …개는"
  return `${parts.join('와 ')}는`
}

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** 올리기 → 확인 → 게이지 → 완성. 처음 지나갈 때만 보입니다. */
function Steps() {
  const steps = ['도안 올리기', '읽은 내용 확인', '게이지 맞추기', '페이지 완성']
  const current = 2
  return (
    <ol className={styles.steps} aria-label="페이지를 만드는 순서">
      {steps.map((name, i) => (
        <li key={name} data-state={i < current ? 'done' : i === current ? 'current' : 'todo'} aria-current={i === current ? 'step' : undefined}>
          <span className={styles.dot}>{i < current ? <Check /> : i + 1}</span>
          <span className={styles.stepName}>{name}</span>
          {i < current ? <span className="sr-only"> (마침)</span> : null}
          {i === current ? (
            <span className={styles.stepCount}>
              {i + 1} / {steps.length}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  )
}

/** 작업 화면에서 다시 들어왔을 때: 지금 어떤 상태인지 먼저 알려 줍니다. */
function CurrentState({ gaugeMode, myGauge, title, workHref, tool }: { gaugeMode: PatternView['gaugeMode']; myGauge: GaugeSize | null; title: string; workHref: string; tool: string }) {
  const measured = myGauge ? gaugeText(myGauge) : null
  const text =
    gaugeMode === 'recalc'
      ? `내 게이지${measured ? `(${measured})` : ''}에 맞춰 다시 계산한 숫자로 뜨고 있어요.`
      : gaugeMode === 'remeasure'
        ? `${tool}을 바꿔 스와치를 다시 뜨기로 했어요.${measured ? ` 지난번에 잰 게이지는 ${measured}이에요.` : ''} 새로 잰 숫자를 넣을 때까지는 도안 숫자 그대로예요.`
        : measured
          ? `도안 숫자 그대로 뜨고 있어요. 잰 게이지는 ${measured}이에요.`
          : '재지 않고 도안 숫자 그대로 뜨고 있어요.'
  return (
    <div className={styles.state} data-testid="current-state">
      <div className={styles.stateText}>
        <span className="chip chip-ok">지금 상태</span>
        <p>
          <strong>{title}</strong> · {text} 아래에서 언제든 바꿀 수 있어요.
        </p>
      </div>
      <Link href={workHref} className="btn">
        작업 화면으로 돌아가기
      </Link>
    </div>
  )
}

function Measure({
  ir,
  base,
  view,
  touched,
  fit,
  onFit,
  sts,
  rows,
  onSts,
  onRows,
  settleSts,
  settleRows,
  actions,
}: {
  ir: Pattern
  base: Gauge
  view: View
  /** 숫자를 한 번이라도 고쳤거나 저장해 둔 게이지가 있는지 */
  touched: boolean
  fit: Fit
  onFit: (f: Fit) => void
  sts: string
  rows: string
  onSts: Dispatch<SetStateAction<string>>
  onRows: Dispatch<SetStateAction<string>>
  settleSts: Dispatch<SetStateAction<string>>
  settleRows: Dispatch<SetStateAction<string>>
  actions: ReactNode
}) {
  const id = useId()
  const { mine, cmp, result, fits } = view
  const width = result.width
  const canRecalc = fits.includes('recalc')
  const swatch = swatchSize(base)
  const stitchName = base.in_stitch.trim()
  const tool = ir.craft === 'crochet' ? '코바늘' : '바늘'
  const firstSection = ir.sections[0]
  // 코바늘 스와치는 늘 사슬에서 시작합니다.
  const begin = ir.craft === 'crochet' || firstSection?.start.kind === 'chain' ? '사슬을 떠' : '잡아'
  const rowsTighter = mine.rows > base.rows

  const verdict = !touched
    ? { title: '잰 숫자로 바꿔 주세요', sub: '지금은 도안 게이지가 들어 있어요. 내 스와치에서 센 숫자로 바꾸면 바로 비교해요.' }
    : cmp.same
      ? {
          title: '코 너비가 도안과 거의 같아요',
          sub: `그대로 떠도 가로 크기가 거의 같게 나와요.${!cmp.sameRows ? ` 단은 ${cmp.rowPct}% 더 ${rowsTighter ? '촘촘해요' : '느슨해요'}.` : ''}`,
        }
      : {
          title: `코가 ${cmp.stitchPct}% 더 ${cmp.tighter ? '촘촘해요' : '느슨해요'}`,
          sub:
            width.pattern !== undefined && width.asIs !== undefined
              ? `도안 숫자 그대로 뜨면 가로 ${fmt(width.pattern)}cm가 ${fmt(width.asIs)}cm로 ${cmp.tighter ? '작게' : '크게'} 나와요.`
              : `도안 숫자 그대로 뜨면 ${cmp.tighter ? '작게' : '크게'} 나와요.`,
        }

  const mm = cmp.same ? null : needleSuggestion(base.tool_mm, cmp.stitchPct, cmp.tighter)
  const needleAdvice = `코가 ${cmp.tighter ? '촘촘하니 더 굵은' : '느슨하니 더 가는'} ${tool}${mm ? `(${fmt(mm)}mm쯤)` : ''}로 다시 떠 보세요. 원단 느낌이 도안과 비슷해져요. 새로 잰 숫자를 넣을 때까지는 도안 숫자로 보여 드려요.`

  const note = heightNote(ir, mine)
  const bars: { key: string; label: string; value: number; tone: 'base' | 'asis' | 'new' }[] = []
  if (width.pattern !== undefined && width.asIs !== undefined) {
    bars.push({ key: 'pattern', label: '도안대로', value: width.pattern, tone: 'base' })
    bars.push({ key: 'asis', label: '그대로 뜨면', value: width.asIs, tone: 'asis' })
    if (canRecalc && width.recalculated !== undefined) bars.push({ key: 'new', label: '다시 계산하면', value: width.recalculated, tone: 'new' })
  }
  const widest = Math.max(1, ...bars.map((b) => b.value))
  const table = canRecalc ? buildTable(ir, result.sections) : []

  const options: { fit: Fit; title: string; sub: string }[] = fits.map((f) =>
    f === 'recalc'
      ? { fit: f, title: '코 수를 내 게이지에 맞춰 다시 계산하기', sub: `지금 손땀과 ${tool} 그대로 떠도 완성 크기가 도안과 같아져요.` }
      : f === 'needle'
        ? { fit: f, title: `${tool}을 바꿔서 스와치 다시 뜨기`, sub: needleAdvice }
        : {
            fit: f,
            title: '도안 숫자 그대로 뜨기',
            sub: !touched
              ? '숫자를 바꾸면 맞추는 방법을 여기서 골라요. 바꾸지 않고 넘어가면 재지 않은 것으로 하고 도안 숫자 그대로 떠요.'
              : result.fixedShape && !cmp.same
                ? width.pattern !== undefined && width.asIs !== undefined
                  ? `모양은 그대로이고 크기만 달라져요. 가로 ${fmt(width.pattern)}cm가 ${fmt(width.asIs)}cm쯤으로 ${cmp.tighter ? '작게' : '크게'} 나와요.`
                  : `모양은 그대로이고 크기만 ${cmp.tighter ? '조금 작게' : '조금 크게'} 나와요.`
                : !cmp.same
                  ? '내 게이지로 다시 계산해도 숫자가 바뀌지 않아요. 도안 숫자 그대로 뜨면 돼요.'
                : !cmp.sameRows
                  ? '코 너비가 같아 가로 크기는 그대로예요. 세로는 단 수로 뜨는 구간만 조금 달라져요.'
                  : '게이지가 도안과 거의 같아요. 다시 계산하지 않아도 돼요.',
          },
  )

  return (
    <div className={styles.measure}>
      <div className={styles.left}>
        <section className={`${styles.block} ${styles.howto}`} aria-labelledby={`${id}-howto`}>
          <h2 id={`${id}-howto`} className={styles.h2}>
            스와치 재는 법
          </h2>
          <div className={styles.howtoBody}>
            <div className={styles.swatch} role="img" aria-label="스와치 가운데 10cm 구간을 재는 그림">
              <div className={styles.swatchBox}>
                <span>가운데 10cm</span>
              </div>
            </div>
            <ol className={styles.howtoSteps}>
              <li>
                도안과 같은 {tool}({fmt(base.tool_mm)}mm)로 {swatch.stitches}코쯤 {begin} {stitchName ? withRo(stitchName) : '도안에 적힌 무늬로'} {swatch.rows}단쯤 떠요.
              </li>
              <li>가볍게 펴 놓고, 가장자리를 뺀 가운데 10cm 안의 코와 단을 세요.</li>
              <li>센 숫자를 내 게이지 칸에 적어요.</li>
            </ol>
          </div>
        </section>

        <section className={`${styles.block} ${styles.inputs}`} aria-labelledby={`${id}-mine`}>
          <h2 id={`${id}-mine`} className={styles.h2}>
            내 게이지
          </h2>
          <NumberField
            id={`${id}-sts`}
            label="가로 10cm 안의 코 수"
            unit="코"
            what="코 수"
            value={sts}
            fallback={base.stitches}
            limit={LIMITS.stitches}
            hintId={`${id}-hint`}
            onChange={onSts}
            onSettle={settleSts}
          />
          <NumberField
            id={`${id}-rows`}
            label="세로 10cm 안의 단 수"
            unit="단"
            what="단 수"
            value={rows}
            fallback={base.rows}
            limit={LIMITS.rows}
            hintId={`${id}-hint`}
            onChange={onRows}
            onSettle={settleRows}
          />
          <p className={styles.small} data-testid="pattern-gauge">
            도안 게이지는 {gaugeText(base)}이에요. ({stitchName ? `${stitchName}, ` : ''}
            {fmt(base.tool_mm)}mm {tool}, 10cm 기준)
          </p>
          <p id={`${id}-hint`} className={styles.small}>
            5cm만 쟀다면 센 숫자에 2를 곱해서 적어 주세요. 반 코는 0.5로 적어도 돼요. 스와치를 따로 뜨지 않았다면 뜨던 편물의 평평한 곳에서 10cm를 재서 넣어도 됩니다.
          </p>
        </section>

        {bars.length > 0 || note ? (
          <section className={`${styles.block} ${styles.sizes}`} aria-labelledby={`${id}-size`}>
            <h2 id={`${id}-size`} className={styles.h2}>
              {bars.length > 0 ? '완성 가로 크기' : '완성 세로 길이'}
            </h2>
            {bars.map((b) => (
              <div key={b.key} className={styles.barRow} data-testid={`width-${b.key}`}>
                <span className={styles.barLabel}>{b.label}</span>
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.fill} data-tone={b.tone} style={{ width: `${((b.value / widest) * 100).toFixed(1)}%` }} />
                </span>
                <span className={styles.barValue} data-tone={b.tone}>
                  {fmt(b.value)}cm
                </span>
              </div>
            ))}
            {note ? (
              <p className={styles.small} data-testid="height-note">
                {note}
              </p>
            ) : null}
          </section>
        ) : null}
      </div>

      <div className={styles.right}>
        <section className={styles.summary} aria-label="도안 게이지와 내 게이지 비교">
          <div className={styles.stat}>
            <span className={styles.statLabel}>도안 게이지</span>
            <strong>{gaugeText(base)}</strong>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>내 게이지</span>
            <strong className={styles.mine} data-testid="my-gauge">
              {gaugeText(mine)}
            </strong>
          </div>
          <div className={styles.verdict} role="status" data-testid="verdict">
            <strong>{verdict.title}</strong>
            <span>{verdict.sub}</span>
          </div>
        </section>

        <section className={`${styles.block} ${styles.fits}`} aria-labelledby={`${id}-fit`}>
          <h2 id={`${id}-fit`} className={styles.h2}>
            어떻게 맞출까요?
          </h2>
          {!result.ok ? (
            <p className="notice" data-testid="regauge-reason">
              {result.fixedShape
                ? `${result.reason} 크기가 조금 달라져도 괜찮다면 도안 숫자 그대로 뜨고, 크기를 맞추려면 ${tool} 호수를 바꿔 보세요.`
                : `${result.reason ?? '이 게이지로는 다시 계산하지 못했습니다.'} 그래서 다시 계산은 권하지 않고, ${tool}을 바꾸는 방법만 안내해요.`}
            </p>
          ) : null}
          <div role="radiogroup" aria-labelledby={`${id}-fit`} className={styles.options}>
            {options.map((o) => (
              <div key={o.fit} className={styles.option} data-on={fit === o.fit}>
                <label className={styles.optionHead}>
                  <input type="radio" name={`${id}-fit`} checked={fit === o.fit} onChange={() => onFit(o.fit)} />
                  <span className={styles.modeText}>
                    <strong>{o.title}</strong>
                    <span className={styles.modeSub}>{o.sub}</span>
                  </span>
                </label>
                {o.fit === 'recalc' ? (
                  <div className={styles.tableWrap}>
                    <table className={styles.table} data-testid="regauge-table">
                      <caption className="sr-only">구간마다 도안의 숫자와 내 게이지에 맞춘 숫자</caption>
                      <thead>
                        <tr>
                          <th scope="col">구간</th>
                          <th scope="col">도안</th>
                          <th scope="col">내 게이지에 맞춘 값</th>
                        </tr>
                      </thead>
                      {table.map((group) => (
                        <tbody key={group.id} data-section={group.id}>
                          <tr className={styles.groupRow}>
                            <th scope="rowgroup" colSpan={3}>
                              {group.name}
                            </th>
                          </tr>
                          {group.rows.map((row) => (
                            <Fragment key={row.key}>
                              <tr data-row={row.key}>
                                <th scope="row">{row.label}</th>
                                <td>{row.from}</td>
                                <td className={styles.to}>{row.to}</td>
                              </tr>
                              {row.note ? (
                                <tr className={styles.noteRow}>
                                  <td colSpan={3}>{row.note}</td>
                                </tr>
                              ) : null}
                            </Fragment>
                          ))}
                        </tbody>
                      ))}
                      {width.pattern !== undefined && width.recalculated !== undefined ? (
                        <tbody>
                          <tr data-row="width">
                            <th scope="row">완성 가로</th>
                            <td>{fmt(width.pattern)}cm</td>
                            <td className={`${styles.to} ${styles.ok}`}>{fmt(width.recalculated)}cm</td>
                          </tr>
                        </tbody>
                      ) : null}
                    </table>
                    <p className={styles.tableNote}>{recalcNote(ir)}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        {actions}
      </div>
    </div>
  )
}

function NumberField({
  id,
  label,
  unit,
  what,
  value,
  fallback,
  limit,
  hintId,
  onChange,
  onSettle,
}: {
  id: string
  label: string
  unit: string
  /** 단추 이름에 쓰는 말: "코 수", "단 수" */
  what: string
  value: string
  /** 칸이 비었을 때 쓰는 도안 게이지 */
  fallback: number
  limit: Limit
  hintId: string
  /** 사람이 고친 값 */
  onChange: Dispatch<SetStateAction<string>>
  /** 칸을 떠날 때 범위 안으로 고쳐 적는 값. 고친 것으로 치지 않습니다. */
  onSettle: Dispatch<SetStateAction<string>>
}) {
  const step = (d: number) => onChange((v) => bump(v, fallback, limit, d))
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <div className={styles.stepper}>
        <button type="button" className={styles.stepBtn} aria-label={`${what} 줄이기`} onClick={() => step(-1)}>
          −
        </button>
        <input
          id={id}
          className={styles.num}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          role="spinbutton"
          aria-valuemin={limit.min}
          aria-valuemax={limit.max}
          aria-valuenow={effective(value, fallback, limit)}
          aria-describedby={hintId}
          placeholder={fmt(fallback)}
          value={value}
          onChange={(e) => onChange(cleanInput(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              step(1)
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              step(-1)
            }
          }}
          // 칸을 떠날 때 범위를 넘은 값은 계산에 쓰는 값으로 고쳐 보여 줍니다.
          onBlur={() => onSettle((v) => (parseNumber(v) === null ? '' : String(effective(v, fallback, limit))))}
        />
        <button type="button" className={styles.stepBtn} aria-label={`${what} 늘리기`} onClick={() => step(1)}>
          +
        </button>
        <span className={styles.unit} aria-hidden="true">
          {unit}
        </span>
      </div>
    </div>
  )
}

function Skip({
  ir,
  sensitive,
  first,
  headingRef,
  actions,
}: {
  ir: Pattern
  sensitive: boolean
  first: boolean
  headingRef: RefObject<HTMLHeadingElement | null>
  actions: ReactNode
}) {
  const base = ir.gauge
  const start = ir.sections[0]
  const { width_cm: w, height_cm: h } = ir.finished
  const size = [w !== undefined ? `가로 ${fmt(w)}cm` : null, h !== undefined ? `세로 ${fmt(h)}cm` : null].filter(Boolean).join(' × ')
  return (
    <section className={styles.skip} aria-labelledby="gauge-skip">
      <h2 id="gauge-skip" ref={headingRef} tabIndex={-1} className={styles.skipTitle}>
        {first ? '도안 숫자 그대로 페이지를 만들어요' : '도안 숫자 그대로 떠요'}
      </h2>
      <dl className={styles.facts}>
        {base ? (
          <div>
            <dt>게이지 (도안 기준)</dt>
            <dd>{gaugeText(base)}</dd>
          </div>
        ) : null}
        {start ? (
          <div>
            <dt>{startLabel(start)}</dt>
            <dd>{start.start.count}코</dd>
          </div>
        ) : null}
        {size ? (
          <div>
            <dt>완성 크기 (도안 기준)</dt>
            <dd>{size}</dd>
          </div>
        ) : null}
      </dl>
      {base ? (
        <>
          <p className={styles.body}>
            손땀이 도안과 다르면 완성 크기가 조금 달라질 수 있어요.{' '}
            {sensitive
              ? '이 도안은 모자나 옷처럼 크기가 맞아야 하는 것이라, 크기가 걱정되면 재 보기를 권해요.'
              : '목도리나 소품처럼 크기가 조금 달라도 괜찮은 것이라면 건너뛰어도 됩니다.'}
          </p>
          <ul className={styles.bullets}>
            <li>뜨다가 크기가 걱정되면 작업 화면의 &quot;게이지 다시 맞추기&quot;에서 언제든 계산할 수 있어요.</li>
            <li>스와치를 따로 뜨지 않아도 돼요. 뜨던 편물의 평평한 곳에서 10cm를 재서 넣어도 됩니다.</li>
          </ul>
        </>
      ) : (
        <p className={styles.body} data-testid="no-gauge">
          이 도안에는 게이지가 적혀 있지 않아요. 잰 숫자와 비교할 기준이 없어서 다시 계산할 수 없고, 도안 숫자 그대로 뜹니다.
        </p>
      )}
      {actions}
    </section>
  )
}
