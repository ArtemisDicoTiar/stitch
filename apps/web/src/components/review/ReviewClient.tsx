'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { reinterpretTerms, setTurningChains, turningChains, verify } from '@stitch/engine'
import type { Pattern, Row, Template } from '@stitch/pattern-ir'
import { ApiError, apiFetch } from '@/lib/api'
import type { JobView } from '@/server/job-view'
import type { PatternView } from '@/server/patterns'
import type { JobVerification } from '@/server/types'
import { ChartPreview } from './ChartPreview'
import { CRAFT_KR, START_KR, TEMPLATES, TERMS_KR, buildModel, countText, groupDomId, rowDomId, rowNumbers, sameRow, sectionDomId, sideText, type GroupInfo, type RowAddr, type RowInfo } from './model'
import { NumberField } from './NumberField'
import { RowEditor } from './RowEditor'
import { SourcePanel, type SourceTarget } from './SourcePanel'
import styles from './Review.module.css'

type Target = { kind: 'row'; addr: RowAddr } | { kind: 'group'; s: number; g: number } | { kind: 'section'; s: number }
/** resolved: 사람이 이미 정한 곳. 고치던 칸이 사라지지 않게 목록에는 남기되 "확인 필요"로 세지 않습니다. */
type Attention = { id: string; level: 'error' | 'warn' | 'length'; title: string; messages: string[]; target: Target; group?: GroupInfo; resolved?: boolean }
type SaveState = { state: 'saved' | 'dirty' | 'saving' | 'error'; message?: string }

const SAVE_DELAY_MS = 600

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
)
const WarnIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4" />
    <path d="M12 17.2v.3" />
  </svg>
)

/** 길이로 적힌 묶음의 단수를 정하는 칸. 비우면 게이지 추정으로 돌아갑니다. */
function LengthControl({ group, where, onRows }: { group: GroupInfo; where: string; onRows: (rows: number | undefined) => void }) {
  const length = group.length!
  const id = `${where}-rows-${group.s}-${group.g}`
  return (
    <div className={styles.lengthControl}>
      <label htmlFor={id} className={styles.lengthLabel}>
        이 구간의 단수
      </label>
      <NumberField id={id} allowEmpty placeholder={length.estimate !== null ? String(length.estimate) : '단수'} value={length.rows} min={0} max={2000} onCommit={onRows} />
      {length.rows === undefined ? (
        length.estimate !== null && (
          <button type="button" className="btn btn-dark" onClick={() => onRows(length.estimate ?? undefined)}>
            이대로 둘게요
          </button>
        )
      ) : (
        <button type="button" className="btn" onClick={() => onRows(undefined)}>
          {length.estimate !== null ? `추정(${length.estimate}단)으로 되돌리기` : '단수 지우기'}
        </button>
      )}
    </div>
  )
}

function lengthText(group: GroupInfo, gaugeRows: number | undefined): string {
  const l = group.length!
  const base = `도안에 "${l.cm}cm가 될 때까지"라고 적혀 있어요.`
  if (l.rows !== undefined) return `${base} 직접 정한 ${l.rows}단으로 그립니다.`
  if (l.estimate === null) return `${base} 게이지가 없어 단수를 정하지 못했어요. 단수를 넣어 주세요.`
  return `${base} 게이지 ${gaugeRows ?? '?'}단이 10cm이니 ${l.estimate}단으로 잡았어요. 3D와 기호 도안은 이 단수로 그려집니다.`
}

function checkText(info: RowInfo): { text: string; tone: 'error' | 'warn' | 'ok' | 'none' } {
  const expect = info.row.expect_count
  const written = expect !== undefined ? ` · 도안 ${expect}코` : ''
  if (info.level === 'error') return { text: `맞지 않음${written}`, tone: 'error' }
  if (info.level === 'warn') return { text: `확인 필요${written}`, tone: 'warn' }
  if (info.times === 0) return { text: '단 없음', tone: 'none' }
  if (expect !== undefined) return { text: `일치${written}`, tone: 'ok' }
  return { text: '문제 없음', tone: 'none' }
}

export function ReviewClient({ pattern, job }: { pattern: PatternView; job: JobView | null }) {
  const router = useRouter()
  const id = pattern.id
  // 화면을 열었을 때 읽어 온 IR. "처음 읽은 대로 되돌리기"의 기준입니다.
  const [initial] = useState<Pattern>(() => pattern.ir as Pattern)
  const [ir, setIr] = useState<Pattern>(initial)
  const irRef = useRef(ir)
  const [sel, setSel] = useState<RowAddr | null>(null)
  const [save, setSave] = useState<SaveState>({ state: 'saved' })
  const [serverV, setServerV] = useState<JobVerification | null>(job?.verification ?? null)
  const [confirming, setConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  // 고치면 브라우저에서 바로 다시 검산합니다. 서버도 저장할 때 같은 엔진으로 다시 검산합니다.
  const v = useMemo(() => verify(ir), [ir])
  const model = useMemo(() => buildModel(ir, v), [ir, v])

  // --- 저장: 잠깐 모았다가 순서대로 보냅니다 -------------------------------------
  const pending = useRef<Pattern | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flight = useRef<Promise<boolean> | null>(null)

  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current)
    if (!flight.current) {
      flight.current = (async () => {
        try {
          while (pending.current) {
            const body = pending.current
            pending.current = null
            setSave({ state: 'saving' })
            try {
              const res = await apiFetch<{ verification: JobVerification }>(`/api/patterns/${id}/ir`, { method: 'PUT', json: body })
              // 그 사이에 더 고쳤다면 이 응답은 낡은 것이므로 버립니다.
              if (!pending.current) setServerV(res.verification)
            } catch (e) {
              if (!pending.current) pending.current = body
              setSave({ state: 'error', message: e instanceof ApiError ? e.message : '저장하지 못했습니다. 연결을 확인해 주세요.' })
              return false
            }
          }
          setSave({ state: 'saved' })
          return true
        } finally {
          flight.current = null
        }
      })()
    }
    return flight.current
  }, [id])

  const update = useCallback(
    (mutate: (draft: Pattern) => void) => {
      const next = structuredClone(irRef.current)
      mutate(next)
      irRef.current = next
      setIr(next)
      setConfirmError(null)
      pending.current = next
      setSave({ state: 'dirty' })
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS)
    },
    [flush],
  )

  // 저장이 끝나기 전에 떠나면 마지막으로 고친 내용을 보내고, 창을 닫으려 하면 한 번 물어봅니다.
  useEffect(
    () => () => {
      if (pending.current) void flush()
    },
    [flush],
  )
  const unsaved = save.state !== 'saved'
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  // --- 확인이 필요한 곳 ---------------------------------------------------------
  const attention = useMemo(() => {
    const list: Attention[] = []
    const push = (level: 'error' | 'warn', idText: string, title: string, issues: { level: string; message: string }[], target: Target) => {
      const mine = issues.filter((i) => (level === 'error' ? i.level === 'error' : true))
      list.push({ id: idText, level, title, messages: mine.map((i) => i.message), target })
    }
    for (const sec of model.sections) {
      const name = sec.section.name
      if (sec.issues.length) push(sec.issues.some((i) => i.level === 'error') ? 'error' : 'warn', `s${sec.s}`, name, sec.issues, { kind: 'section', s: sec.s })
      for (const grp of sec.groups) {
        if (grp.issues.length) push(grp.issues.some((i) => i.level === 'error') ? 'error' : 'warn', `g${sec.s}-${grp.g}`, name, grp.issues, { kind: 'group', s: sec.s, g: grp.g })
        for (const row of grp.rows) {
          if (!row.level) continue
          const label = `${name} · ${rowNumbers(row, grp.rows.length)}${row.row.label ? ` ${row.row.label}` : ''}`
          push(row.level, `r${rowDomId(row.addr)}`, label, row.issues, { kind: 'row', addr: row.addr })
        }
        if (grp.length) {
          const range = grp.firstG !== null ? ` (${grp.firstG}단부터 ${grp.lastG}단)` : ''
          list.push({ id: `l${sec.s}-${grp.g}`, level: 'length', title: `길이로 적힌 구간${range}`, messages: [lengthText(grp, ir.gauge?.rows)], target: { kind: 'group', s: sec.s, g: grp.g }, group: grp, resolved: grp.length.rows !== undefined })
        }
      }
    }
    const order = { error: 0, warn: 1, length: 2 }
    return list.sort((a, b) => order[a.level] - order[b.level])
  }, [model, ir.gauge?.rows])

  const errorPlaces = attention.filter((a) => a.level === 'error').length
  const openPlaces = attention.filter((a) => !a.resolved).length
  // 저장한 뒤의 서버 검산이 기준입니다. 브라우저 검산과 다르게 오류가 남아 있으면 넘어가지 않습니다.
  const serverBlocks = save.state === 'saved' && !!serverV && !serverV.ok && v.ok
  const canConfirm = v.ok && !serverBlocks

  // --- 고르기와 건너가기 --------------------------------------------------------
  const jump = (target: Target) => {
    const domId = target.kind === 'row' ? rowDomId(target.addr) : target.kind === 'group' ? groupDomId(target.s, target.g) : sectionDomId(target.s)
    if (target.kind === 'row') setSel(target.addr)
    requestAnimationFrame(() => {
      const el = document.getElementById(domId)
      if (!el) return
      el.scrollIntoView({ block: 'center' })
      const focusable = target.kind === 'row' ? el.querySelector<HTMLElement>('button') : target.kind === 'group' ? (el.querySelector<HTMLElement>('input') ?? el) : el
      focusable?.focus({ preventScroll: true })
    })
  }

  const setRows = (s: number, g: number) => (rows: number | undefined) =>
    update((d) => {
      const repeat = d.sections[s].groups[g].repeat
      if (!('until_cm' in repeat)) return
      if (rows === undefined) delete repeat.rows
      else repeat.rows = rows
    })

  const selInfo = sel ? model.sections[sel.s]?.groups[sel.g]?.rows[sel.r] : undefined
  const selected: SourceTarget | null = selInfo
    ? { key: rowDomId(selInfo.addr), label: `${rowNumbers(selInfo, model.sections[selInfo.addr.s].groups[selInfo.addr.g].rows.length)}${selInfo.row.label ? ` ${selInfo.row.label}` : ''}`, text: selInfo.row.text, source: selInfo.row.source }
    : null

  // --- 확인 완료 ---------------------------------------------------------------
  async function confirm(skipGauge: boolean) {
    if (confirming) return
    setConfirming(true)
    setConfirmError(null)
    try {
      if (!(await flush())) {
        setConfirmError('고친 내용을 저장하지 못해 넘어가지 못했어요. 다시 시도해 주세요.')
        setConfirming(false)
        return
      }
      await apiFetch(`/api/patterns/${id}/confirm`, { method: 'POST' })
      if (skipGauge) {
        await apiFetch(`/api/patterns/${id}/gauge`, { method: 'POST', json: { mode: 'as_is' } })
        router.push(`/patterns/${id}`)
      } else {
        router.push(`/patterns/${id}/gauge`)
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'has_errors' && e.detail) setServerV(e.detail as JobVerification)
      setConfirmError(e instanceof ApiError ? e.message : '넘어가지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
      setConfirming(false)
    }
  }

  const gauge = ir.gauge
  const finished = [ir.finished.width_cm !== undefined ? `가로 ${ir.finished.width_cm}cm` : null, ir.finished.height_cm !== undefined ? `세로 ${ir.finished.height_cm}cm` : null].filter(Boolean).join(' × ')
  const pages = job?.pages ?? null

  return (
    <>
      <div className={styles.top}>
        <div className={styles.head}>
          <h1 className={styles.title}>읽은 내용을 확인해 주세요</h1>
          <p className={styles.lead}>도안에 적힌 코 수와 맞는 곳은 건너뛰어도 돼요. 노란색과 빨간색으로 표시된 곳만 봐 주세요.</p>
        </div>
        <div className={styles.verdict} data-testid="verdict">
          {errorPlaces === 0 ? (
            <span className={`${styles.badge} ${styles.badgeOk}`}>
              <CheckIcon />
              코 수 검산 통과{model.matched > 0 ? ` · ${model.matched}곳 일치` : ''}
            </span>
          ) : (
            <span className={`${styles.badge} ${styles.badgeError}`}>
              <WarnIcon />
              맞지 않는 곳 {errorPlaces}곳
            </span>
          )}
          {openPlaces > 0 && (
            <span className={`${styles.badge} ${styles.badgeWarn}`}>
              <WarnIcon />
              확인 필요 {openPlaces}곳
            </span>
          )}
          <span className={styles.saveState} data-state={save.state} role="status" data-testid="save-state">
            {save.state === 'saved' && '저장됨'}
            {save.state === 'dirty' && '고치는 중…'}
            {save.state === 'saving' && '저장하는 중…'}
            {save.state === 'error' && (
              <>
                {save.message}{' '}
                <button type="button" className={styles.linkBtn} onClick={() => void flush()}>
                  다시 저장
                </button>
              </>
            )}
          </span>
        </div>
      </div>

      {pattern.gaugeMode === 'recalc' && <p className="notice">여기서 고치면 내 게이지로 다시 계산해 둔 결과가 지워져요. 고친 뒤 게이지를 다시 맞춰 주세요.</p>}

      <div className={styles.cols}>
        <aside className={styles.aside}>
          <SourcePanel patternId={id} hasPdf={pattern.hasPdf} pages={pages} selected={selected} place="aside" />
        </aside>

        <div className={styles.main}>
          <section className={styles.card} aria-labelledby="summary-title">
            <h2 id="summary-title" className={styles.cardTitle}>
              준비물과 게이지
            </h2>
            <dl className={styles.facts}>
              <div className={styles.factWide}>
                <dt>도안 이름</dt>
                <dd>{ir.title || pattern.title}</dd>
              </div>
              <div>
                <dt>종류</dt>
                <dd>
                  {CRAFT_KR[ir.craft]} · {TERMS_KR[ir.terms]}
                </dd>
              </div>
              {ir.craft === 'crochet' && (ir.terms === 'us' || ir.terms === 'uk') && (
                <div className={styles.factWide}>
                  <dt>
                    <label htmlFor="terms">약어 체계</label>
                  </dt>
                  <dd>
                    <select
                      id="terms"
                      className={styles.select}
                      value={ir.terms}
                      aria-describedby="terms-hint"
                      onChange={(e) => {
                        const next = reinterpretTerms(ir, e.target.value as 'us' | 'uk')
                        update((d) => {
                          d.terms = next.terms
                          d.sections = structuredClone(next.sections)
                        })
                      }}
                    >
                      <option value="us">미국식 (sc = 짧은뜨기)</option>
                      <option value="uk">영국식 (dc = 짧은뜨기)</option>
                    </select>
                    <span id="terms-hint" className={styles.fieldHint}>
                      같은 약어가 두 체계에서 다른 코를 가리켜요. 바꾸면 도안의 약어를 그 체계로 다시 풉니다.
                    </span>
                  </dd>
                </div>
              )}
              {ir.materials.map((m, i) => (
                <div key={i}>
                  <dt>{m.kind}</dt>
                  <dd>
                    {m.spec}
                    {m.qty ? ` · ${m.qty}` : ''}
                  </dd>
                </div>
              ))}
              <div>
                <dt>게이지 (10cm)</dt>
                <dd>
                  {gauge ? `${gauge.stitches}코 × ${gauge.rows}단` : '도안에 없음'}
                  {gauge && (
                    <span className={styles.factSub}>
                      {gauge.in_stitch} · {gauge.tool_mm}mm
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>완성 크기</dt>
                <dd>{finished || '도안에 없음'}</dd>
              </div>
              <div>
                <dt>
                  <label htmlFor="template">3D 모양</label>
                </dt>
                <dd>
                  <select id="template" className={styles.select} value={ir.template ?? 'none'} aria-describedby="template-hint" onChange={(e) => update((d) => void (d.template = e.target.value as Template))}>
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <span id="template-hint" className={styles.factSub}>
                    도안을 읽고 고른 모양이에요. 다르면 바꿔 주세요.
                  </span>
                </dd>
              </div>
            </dl>
          </section>

          <section className={styles.attention} aria-labelledby="attention-title">
            <h2 id="attention-title" className={styles.cardTitle}>
              확인이 필요한 곳
            </h2>
            {openPlaces === 0 && (ir.notes?.length ?? 0) === 0 && (
              <p className={styles.allGood}>
                <CheckIcon /> 따로 확인할 곳이 없어요. 아래 단별 지시문을 훑어본 뒤 넘어가도 돼요.
              </p>
            )}
            {(ir.notes?.length ?? 0) > 0 && (
              <ul className={styles.attentionList} aria-label="원문을 직접 봐야 하는 곳">
                {ir.notes!.map((n, i) => (
                  <li key={`note-${i}`} className={styles.attentionItem} data-level="warn">
                    <div className={styles.attentionText}>
                      <strong>{n.kind === 'picture_only' ? '그림으로만 설명된 부분' : '뜻이 애매한 부분'}</strong>
                      <span>{n.text}</span>
                      <span>
                        글로 옮기지 못한 부분이라 검산에 들어가지 않았어요. {n.page ? `원본 PDF ${n.page}쪽을` : '원본 PDF를'} 직접 확인해 주세요.
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {attention.length > 0 && (
              <ul className={styles.attentionList}>
                {attention.map((a) => (
                  <li key={a.id} className={styles.attentionItem} data-level={a.level} data-resolved={a.resolved || undefined}>
                    <div className={styles.attentionText}>
                      <strong>
                        {a.title}
                        {a.resolved && <span className={`chip chip-ok ${styles.doneChip}`}>확인함</span>}
                      </strong>
                      {a.messages.slice(0, 2).map((m, i) => (
                        <span key={i}>{m}</span>
                      ))}
                      {a.messages.length > 2 && <span>그 밖에 {a.messages.length - 2}건</span>}
                    </div>
                    <div className={styles.attentionActions}>
                      {a.group && <LengthControl group={a.group} where="todo" onRows={setRows(a.group.s, a.group.g)} />}
                      <button type="button" className="btn" onClick={() => jump(a.target)}>
                        {a.target.kind === 'row' ? '이 단 보기' : '이 구간 보기'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.rowsCard} aria-labelledby="rows-title">
            <div className={styles.rowsHead}>
              <h2 id="rows-title" className={styles.cardTitle}>
                단별 지시문
              </h2>
              <span className={styles.rowsMeta}>
                {ir.sections.length}개 구간 · {model.totalRows}단
              </span>
            </div>
            <div className={styles.colNames} aria-hidden="true">
              <span>단</span>
              <span>읽은 지시문</span>
              <span>끝난 뒤 코 수</span>
              <span>검산</span>
            </div>

            {model.sections.map((sec) => (
              <div key={sec.s} id={sectionDomId(sec.s)} className={styles.section} tabIndex={-1} data-level={sec.issues.some((i) => i.level === 'error') ? 'error' : sec.issues.length ? 'warn' : undefined}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionName}>{sec.section.name}</h3>
                  <span className={styles.sectionMeta}>
                    {sec.summary && sec.summary.rows > 0 ? `${sec.summary.firstRow}단부터 ${sec.summary.lastRow}단 · 끝나면 ${sec.summary.endCount}코` : '단 없음'}
                  </span>
                  {ir.craft === 'crochet' && turningChains(sec.section) !== null && (
                    <label className={styles.startField} data-testid={`tch-${sec.s}`}>
                      <input
                        type="checkbox"
                        checked={turningChains(sec.section) === 'counted'}
                        onChange={(e) => {
                          const next = setTurningChains(ir, sec.s, e.target.checked)
                          update((d) => void (d.sections[sec.s].groups = structuredClone(next.sections[sec.s].groups)))
                        }}
                      />
                      기둥코를 1코로 셈
                    </label>
                  )}
                  {ir.craft === 'crochet' && sec.section.start.kind === 'ring' && sec.section.start.count === 0 ? (
                    <span className={styles.startField} data-testid={`start-${sec.s}`}>
                      매직링에서 시작{sec.section.copies && sec.section.copies > 1 ? ` · ${sec.section.copies}개 만들기` : ''}
                    </span>
                  ) : (
                    <span className={styles.startField} data-testid={`start-${sec.s}`}>
                      <label htmlFor={`start-${sec.s}`}>{ir.craft === 'crochet' ? `${START_KR[sec.section.start.kind]} · 시작 코 수` : '시작 코 수'}</label>
                      <NumberField id={`start-${sec.s}`} value={sec.section.start.count} min={0} max={9999} onCommit={(n) => n !== undefined && update((d) => void (d.sections[sec.s].start.count = n))} />
                    </span>
                  )}
                </div>
                {sec.issues.length > 0 && (
                  <ul className={styles.rowIssues}>
                    {sec.issues.map((issue, i) => (
                      <li key={i} data-level={issue.level}>
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                )}

                {sec.groups.map((grp) => {
                  const repeat = grp.group.repeat
                  const perRep = grp.rows.length
                  const times = 'times' in repeat ? repeat.times : null
                  const showHead = !!grp.length || perRep > 1 || (times ?? 1) > 1 || grp.issues.length > 0
                  return (
                    <div key={grp.g} id={groupDomId(sec.s, grp.g)} className={styles.group} tabIndex={-1} data-length={grp.length ? true : undefined} data-multi={showHead || undefined}>
                      {showHead && (
                        <div className={styles.groupHead}>
                          <span className={styles.groupText}>
                            {grp.length ? (
                              <>
                                <strong>길이로 적힘 · {grp.length.cm}cm가 될 때까지</strong>
                                <span>
                                  {grp.length.rows !== undefined
                                    ? `직접 정한 ${grp.length.rows}단`
                                    : grp.length.estimate !== null
                                      ? `게이지로 ${grp.length.estimate}단 추정`
                                      : '게이지가 없어 단수를 정하지 못함'}
                                  {grp.firstG !== null ? ` · ${grp.firstG}단부터 ${grp.lastG}단` : ''}
                                </span>
                              </>
                            ) : (
                              <span>
                                {perRep > 1 ? `이 ${perRep}단을 ` : '이 단을 '}
                                {times}번 반복{grp.firstG !== null ? ` · ${grp.firstG}단부터 ${grp.lastG}단` : ''}
                              </span>
                            )}
                          </span>
                          {grp.length && <LengthControl group={grp} where="list" onRows={setRows(sec.s, grp.g)} />}
                          {grp.issues.length > 0 && (
                            <ul className={styles.rowIssues}>
                              {grp.issues.map((issue, i) => (
                                <li key={i} data-level={issue.level}>
                                  {issue.message}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      <ul className={styles.rows}>
                        {grp.rows.map((info) => {
                          const open = sameRow(sel, info.addr)
                          const check = checkText(info)
                          const domId = rowDomId(info.addr)
                          const origin = initial.sections[sec.s]?.groups[grp.g]?.rows[info.addr.r]
                          return (
                            <li key={info.addr.r} id={domId} className={styles.rowItem} data-open={open || undefined} data-level={info.level ?? undefined}>
                              <button type="button" className={styles.rowBtn} aria-expanded={open} aria-controls={open ? `${domId}-editor` : undefined} onClick={() => setSel(open ? null : info.addr)}>
                                <span className={styles.rowNo}>
                                  <strong>{rowNumbers(info, perRep)}</strong>
                                  <span>
                                    {info.row.label ? `${info.row.label} · ` : ''}
                                    {sideText(info, ir.craft)}
                                  </span>
                                </span>
                                <span className={styles.rowText}>{info.row.text}</span>
                                <span className={styles.rowCount}>
                                  <span className={styles.onlyNarrow}>끝난 뒤 </span>
                                  {countText(info)}
                                </span>
                                <span className={styles.rowCheck} data-tone={check.tone}>
                                  {check.tone === 'error' || check.tone === 'warn' ? <WarnIcon /> : check.tone === 'ok' ? <CheckIcon /> : null}
                                  {check.text}
                                </span>
                              </button>
                              {open && (
                                <RowEditor
                                  key={domId}
                                  info={info}
                                  group={grp}
                                  craft={ir.craft}
                                  changed={!!origin && JSON.stringify(origin) !== JSON.stringify(info.row)}
                                  onRow={(mutate: (row: Row) => void) => update((d) => mutate(d.sections[sec.s].groups[grp.g].rows[info.addr.r]))}
                                  onTimes={(n) =>
                                    update((d) => {
                                      const rep = d.sections[sec.s].groups[grp.g].repeat
                                      if ('times' in rep) rep.times = n
                                    })
                                  }
                                  onRevert={() => origin && update((d) => void (d.sections[sec.s].groups[grp.g].rows[info.addr.r] = structuredClone(origin)))}
                                  source={<SourcePanel patternId={id} hasPdf={pattern.hasPdf} pages={pages} selected={selected} place="inline" />}
                                />
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )
                })}
              </div>
            ))}
          </section>

          {ir.finishing.length > 0 && (
            <section className={styles.card} aria-labelledby="finishing-title">
              <h2 id="finishing-title" className={styles.cardTitle}>
                마무리
              </h2>
              <ol className={styles.finishing}>
                {ir.finishing.map((f, i) => (
                  <li key={i}>
                    <strong>{f.name}</strong>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <ChartPreview expanded={v.expanded} />

          <div className={styles.confirm}>
            {confirmError && (
              <p className="notice notice-error" role="alert">
                {confirmError}
              </p>
            )}
            {serverBlocks && (
              <p className="notice notice-error" role="alert">
                서버에서 다시 검산했더니 맞지 않는 단이 남아 있어요. {serverV?.errors[0]?.message}
              </p>
            )}
            <div className={styles.confirmRow}>
              <button type="button" className="btn btn-primary btn-lg" disabled={!canConfirm || confirming} aria-describedby="confirm-note" onClick={() => void confirm(false)}>
                확인 완료 · 게이지 맞추러 가기
              </button>
              <button type="button" className={styles.linkBtn} disabled={!canConfirm || confirming} onClick={() => void confirm(true)}>
                게이지는 재지 않고 도안 숫자 그대로 만들기
              </button>
            </div>
            <p id="confirm-note" className={styles.confirmNote} data-blocked={!canConfirm || undefined}>
              {canConfirm ? '고친 내용은 바로 저장돼요.' : `코 수가 맞지 않는 곳이 ${Math.max(errorPlaces, 1)}곳 남아 있어 넘어갈 수 없어요. 위의 "확인이 필요한 곳"에서 빨간 항목을 고쳐 주세요.`}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
