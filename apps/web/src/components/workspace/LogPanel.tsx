'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { stitchesDone } from '@stitch/engine'
import type { Expanded } from '@stitch/pattern-ir'
import type { ProgressEntry } from '@/server/patterns'
import { fmtDay, fmtFull, fmtTime, isComplete, percentOf, posText, sectionText, workingPos, type Pos } from './position'
import styles from './Workspace.module.css'

type Finishing = { name: string; text: string }

type Props = {
  expanded: Expanded
  entries: ProgressEntry[]
  saved: Pos
  complete: boolean
  finishing: Finishing[]
  finishingDone: number
  /** 지금 "그때 모습"으로 보고 있는 기록 */
  viewingId: string | null
  replaying: boolean
  onView: (entry: ProgressEntry | null) => void
  onReplay: () => void
  onDelete: (id: string) => void
  onEditMemo: (id: string, memo: string) => void
  /** step번째 마무리 단계를 끝냈다고(또는 취소한다고) 기록 */
  onFinishing: (step: number, done: boolean) => void
}

const entryPos = (e: ProgressEntry): Pos => ({ row: e.row, stitch: e.stitch })

/** 내 뜨개 기록: 요약, 날짜별 진행, 기록 목록, 마무리 */
export function LogPanel({ expanded, entries, saved, complete, finishing, finishingDone, viewingId, replaying, onView, onReplay, onDelete, onEditMemo, onFinishing }: Props) {
  const uid = useId()
  const total = expanded.totalStitches
  const done = entries.length ? stitchesDone(expanded, entryPos(entries[entries.length - 1])) : 0
  const pct = entries.length ? percentOf(expanded, entryPos(entries[entries.length - 1])) : 0

  const stats = useMemo(() => {
    const days = new Set(entries.map((e) => fmtDay(new Date(e.at))))
    let eta = '–'
    let pace = '기록이 2개 이상 쌓이면 계산해요'
    if (complete) {
      const all = finishing.length === 0 || finishingDone >= finishing.length
      eta = all ? '완성!' : '뜨기 완료'
      pace = all ? '수고하셨어요' : '마무리 단계만 남았어요'
    } else if (entries.length >= 2) {
      // 최근 14일의 속도로 어림합니다.
      const tEnd = new Date(entries[entries.length - 1].at).getTime()
      let i0 = 0
      while (i0 < entries.length - 2 && tEnd - new Date(entries[i0].at).getTime() > 14 * 864e5) i0++
      const dt = (tEnd - new Date(entries[i0].at).getTime()) / 864e5
      const dp = done - stitchesDone(expanded, entryPos(entries[i0]))
      if (dt >= 0.04 && dp > 0 && expanded.totalRows > 0) {
        const perDay = dp / dt
        const fin = new Date(tEnd + ((total - done) / perDay) * 864e5)
        eta = `${fin.getMonth() + 1}월 ${fin.getDate()}일`
        pace = `최근 속도 하루 약 ${(perDay / (total / expanded.totalRows)).toFixed(1)}단 기준`
      } else {
        pace = '진행이 늘어난 기록이 더 필요해요'
      }
    }
    return { days: days.size, eta, pace }
  }, [entries, complete, finishing.length, finishingDone, done, total, expanded])

  // 날짜별로 묶어 새 기록이 위에 오게
  const groups = useMemo(() => {
    const out: { day: string; items: { entry: ProgressEntry; prev: ProgressEntry | null }[] }[] = []
    for (let i = entries.length - 1; i >= 0; i--) {
      const day = fmtDay(new Date(entries[i].at))
      if (!out.length || out[out.length - 1].day !== day) out.push({ day, items: [] })
      out[out.length - 1].items.push({ entry: entries[i], prev: i > 0 ? entries[i - 1] : null })
    }
    return out
  }, [entries])

  const lastRow = expanded.totalRows

  return (
    <div className={styles.log}>
      <div className={styles.stats}>
        <div className={styles.stat} data-big="">
          <span className={styles.statK}>뜨기 진행률</span>
          <strong className={styles.statV}>{pct}%</strong>
          <span className={styles.statS}>
            {done.toLocaleString('ko-KR')} / {total.toLocaleString('ko-KR')}코
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statK}>지금 위치</span>
          <strong className={styles.statV}>{entries.length === 0 ? '시작 전' : complete ? `${lastRow}단 완료` : posText(expanded, saved)}</strong>
          <span className={styles.statS}>{complete ? (finishing.length ? `마무리 ${Math.min(finishingDone, finishing.length)} / ${finishing.length}` : '') : sectionText(expanded, saved.row)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statK}>기록</span>
          <strong className={styles.statV}>{entries.length}회</strong>
          <span className={styles.statS}>{entries.length ? `${stats.days}일 동안 · 첫 기록 ${fmtDay(new Date(entries[0].at))}` : '아직 없어요'}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statK}>완성 예상</span>
          <strong className={styles.statV}>{stats.eta}</strong>
          <span className={styles.statS}>{stats.pace}</span>
        </div>
      </div>

      <div className={styles.logGrid}>
        <section className={styles.cardBox} aria-labelledby={`${uid}-list`}>
          <div className={styles.cardHead}>
            <h3 className={styles.h3}>날짜별 진행</h3>
            <span className={styles.cardSub}>점을 누르면 그때 모습을 3D와 도안으로 봐요</span>
          </div>
          <ProgressGraph expanded={expanded} entries={entries} viewingId={viewingId} onView={onView} />
          <div className={styles.cardHead}>
            <h3 className={styles.h3} id={`${uid}-list`}>
              기록 목록
            </h3>
            <span className={styles.cardSub}>{entries.length ? `${entries.length}개` : ''}</span>
            <button type="button" className={styles.lightBtn} onClick={onReplay} disabled={entries.length === 0} aria-pressed={replaying}>
              {replaying ? '재생 멈추기' : '기록 재생'}
            </button>
            {viewingId && (
              <button type="button" className={styles.lightBtn} onClick={() => onView(null)}>
                지금 위치로 돌아가기
              </button>
            )}
          </div>
          {entries.length === 0 ? (
            <p className={styles.empty}>아직 기록이 없어요. 단을 다 뜰 때마다 ‘단 올리기’를 누르거나, 도안에서 뜬 마지막 코를 눌러 남겨 보세요.</p>
          ) : (
            <ol className={styles.hist} aria-label="기록 목록, 새 기록부터">
              {groups.map((g) => (
                <li key={g.day} className={styles.histDay}>
                  <h4 className={styles.histDayName}>{g.day}</h4>
                  <ul className={styles.histItems}>
                    {g.items.map(({ entry, prev }) => (
                      <EntryRow
                        key={entry.id}
                        expanded={expanded}
                        entry={entry}
                        prev={prev}
                        finishing={finishing}
                        viewing={viewingId === entry.id}
                        latest={entry === entries[entries.length - 1]}
                        onView={onView}
                        onDelete={onDelete}
                        onEditMemo={onEditMemo}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={styles.cardBox} aria-labelledby={`${uid}-fin`}>
          <div className={styles.cardHead}>
            <h3 className={styles.h3} id={`${uid}-fin`}>
              마무리
            </h3>
            <span className={styles.cardSub} data-testid="finishing-count">
              {finishing.length ? `${complete ? Math.min(finishingDone, finishing.length) : 0} / ${finishing.length}` : ''}
            </span>
          </div>
          {finishing.length === 0 ? (
            <p className={styles.empty}>이 도안에는 따로 적힌 마무리 단계가 없어요.</p>
          ) : (
            <>
              <p className={styles.how}>
                {complete ? `${lastRow}단을 다 뜬 뒤의 단계예요. 차례대로 누르면 지금 시각으로 기록됩니다.` : `${lastRow}단을 다 뜬 뒤의 단계예요. 마지막 단까지 기록하면 차례대로 끝낼 수 있어요.`}
              </p>
              <ol className={styles.finList}>
                {finishing.map((f, i) => {
                  const ticked = complete && finishingDone > i
                  // 차례대로만: 다음 단계를 끝내거나, 방금 끝낸 단계를 취소할 수 있습니다.
                  const can = complete && (i === finishingDone || i === finishingDone - 1)
                  return (
                    <li key={`${i}-${f.name}`}>
                      <button type="button" className={styles.finBtn} aria-pressed={ticked} disabled={!can} onClick={() => onFinishing(i + 1, !ticked)}>
                        <span className={styles.finCheck} aria-hidden="true">
                          {ticked ? (
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.500l4.500 4.500L19 7.500" />
                            </svg>
                          ) : (
                            i + 1
                          )}
                        </span>
                        <span className={styles.finText}>
                          <strong>{f.name}</strong>
                          <span>{f.text}</span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

function EntryRow({
  expanded,
  entry,
  prev,
  finishing,
  viewing,
  latest,
  onView,
  onDelete,
  onEditMemo,
}: {
  expanded: Expanded
  entry: ProgressEntry
  prev: ProgressEntry | null
  finishing: Finishing[]
  viewing: boolean
  latest: boolean
  onView: Props['onView']
  onDelete: Props['onDelete']
  onEditMemo: Props['onEditMemo']
}) {
  const uid = useId()
  const [editing, setEditing] = useState(false)
  const [memo, setMemo] = useState(entry.memo)
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  useEffect(() => {
    if (editing) input.current?.focus()
  }, [editing])

  const d = new Date(entry.at)
  const pos = entryPos(entry)
  const before: Pos = prev ? entryPos(prev) : { row: 0, stitch: 0 }
  const dp = stitchesDone(expanded, pos) - stitchesDone(expanded, before)
  // 다 뜬 단 수의 차이
  const rowsDone = (p: Pos) => (isComplete(expanded, p) ? expanded.totalRows : workingPos(expanded, p).row - 1)
  const dr = rowsDone(pos) - (prev ? rowsDone(before) : 0)
  const fin = entry.finishingStep ?? 0
  const finBefore = prev?.finishingStep ?? 0
  const done = isComplete(expanded, pos)
  const label = done ? (fin > finBefore && finishing[fin - 1] ? `${finishing[fin - 1].name} 완료` : fin < finBefore && finishing[fin] ? `${finishing[fin].name} 취소` : '뜨기 완료') : posText(expanded, workingPos(expanded, pos))
  const delta = dp !== 0 ? `${dp > 0 ? '+' : '−'}${Math.abs(dp).toLocaleString('ko-KR')}코${dr !== 0 ? ` · ${dr > 0 ? '+' : '−'}${Math.abs(dr)}단` : ''}` : done && fin !== finBefore ? `마무리 ${fin}/${finishing.length}` : ''
  const what = `${fmtFull(entry.at)} ${label}`

  const save = () => {
    onEditMemo(entry.id, memo)
    setEditing(false)
  }

  return (
    <li className={styles.histItem} data-viewing={viewing || undefined} data-testid="log-entry">
      <time className={styles.histTime} dateTime={entry.at}>
        {fmtTime(d)}
      </time>
      <div className={styles.histMain}>
        <span className={styles.histPos}>{label}</span>
        {delta && <span className={styles.histDelta} data-down={dp < 0 || undefined}>{delta}</span>}
        {latest && <span className={styles.histNow}>지금 위치</span>}
      </div>
      <div className={styles.histAct}>
        <button type="button" className={styles.lightBtn} aria-pressed={viewing} aria-label={`${what} 그때 모습 보기`} onClick={() => onView(viewing ? null : entry)}>
          그때 모습
        </button>
        <button
          type="button"
          className={styles.lightBtn}
          aria-label={`${what} ${entry.memo ? '메모 고치기' : '메모 쓰기'}`}
          aria-expanded={editing}
          onClick={() => {
            setMemo(entry.memo)
            setEditing((v) => !v)
          }}
        >
          {entry.memo ? '메모 고치기' : '메모 쓰기'}
        </button>
        <button
          type="button"
          className={styles.lightBtn}
          data-warn={armed || undefined}
          aria-label={armed ? `${what} 기록 정말 삭제` : `${what} 기록 삭제`}
          onClick={() => {
            if (armed) return onDelete(entry.id)
            setArmed(true)
            timer.current = setTimeout(() => setArmed(false), 3000)
          }}
        >
          {armed ? '정말 삭제?' : '삭제'}
        </button>
      </div>
      {editing ? (
        <form
          className={styles.memoForm}
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label htmlFor={`${uid}-m`} className="sr-only">
            {what} 메모
          </label>
          <input
            id={`${uid}-m`}
            ref={input}
            className={styles.lightInput}
            type="text"
            maxLength={140}
            value={memo}
            placeholder="메모"
            onChange={(e) => setMemo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <button type="submit" className={styles.lightBtn} data-strong="">
            저장
          </button>
          <button type="button" className={styles.lightBtn} onClick={() => setEditing(false)}>
            취소
          </button>
        </form>
      ) : (
        entry.memo && <p className={styles.histMemo}>{entry.memo}</p>
      )}
    </li>
  )
}

/** 날짜별 진행 그래프. 구간이 끝나는 자리에 점선을 긋습니다. */
function ProgressGraph({ expanded, entries, viewingId, onView }: { expanded: Expanded; entries: ProgressEntry[]; viewingId: string | null; onView: Props['onView'] }) {
  const W = 640
  const H = 240
  const L = 40
  const R = 12
  const T = 14
  const B = 28
  const iw = W - L - R
  const ih = H - T - B
  const total = Math.max(1, expanded.totalStitches)
  const y = (v: number) => T + ih - (v / 100) * ih
  const pctOf = (p: Pos) => (stitchesDone(expanded, p) / total) * 100

  const lines = useMemo(() => {
    const out: { v: number; label: string }[] = [{ v: 0, label: '' }]
    expanded.sections.forEach((s, i) => {
      const last = i === expanded.sections.length - 1
      const v = last ? 100 : (stitchesDone(expanded, { row: s.lastRow + 1, stitch: 0 }) / total) * 100
      out.push({ v, label: last ? `${expanded.totalRows}단` : `${s.name} 끝` })
    })
    return out
  }, [expanded, total])

  if (entries.length === 0) {
    return (
      <div className={styles.graph}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="날짜별 진행률 그래프. 아직 기록이 없습니다">
          {lines.map((l, i) => (
            <line key={i} x1={L} x2={L + iw} y1={y(l.v)} y2={y(l.v)} stroke="currentColor" strokeOpacity={l.v ? 0.18 : 0.4} />
          ))}
          <text x={L + iw / 2} y={T + ih / 2} textAnchor="middle" fontSize="14" fill="currentColor" fillOpacity="0.7">
            기록하면 여기에 진행 곡선이 그려져요
          </text>
        </svg>
      </div>
    )
  }

  const ts = entries.map((e) => new Date(e.at).getTime())
  const t0 = ts[0]
  const t1 = Math.max(ts[ts.length - 1], t0 + 864e5)
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * iw
  const pts = entries.map((e, i) => ({ x: x(ts[i]), y: y(pctOf(entryPos(e))), e }))
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `M${pts[0].x.toFixed(1)},${y(0)} ${pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${pts[pts.length - 1].x.toFixed(1)},${y(0)} Z`
  const ticks = 4
  const sel = viewingId ?? entries[entries.length - 1].id
  // 점이 많으면 누를 수 있는 점은 최근 것만 둡니다. 나머지는 목록에서 고릅니다.
  const clickable = pts.slice(-40)

  return (
    <div className={styles.graph}>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="날짜별 진행률 그래프">
        {lines.map((l, i) => (
          <g key={i}>
            <line x1={L} x2={L + iw} y1={y(l.v)} y2={y(l.v)} stroke="currentColor" strokeOpacity={l.v ? 0.18 : 0.4} strokeDasharray={l.v && l.v < 100 ? '4 4' : undefined} />
            <text x={L - 6} y={y(l.v) + 4} textAnchor="end" fontSize="11" fill="currentColor" fillOpacity="0.75">
              {Math.round(l.v)}%
            </text>
            {l.label && (
              <text x={L + 6} y={y(l.v) - 4} fontSize="11" fill="currentColor" fillOpacity="0.75">
                {l.label}
              </text>
            )}
          </g>
        ))}
        <path d={area} fill="var(--accent)" fillOpacity="0.12" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const t = t0 + ((t1 - t0) * i) / ticks
          const d = new Date(t)
          return (
            <text key={i} x={x(t)} y={H - 8} textAnchor={i === 0 ? 'start' : i === ticks ? 'end' : 'middle'} fontSize="11" fill="currentColor" fillOpacity="0.75">
              {d.getMonth() + 1}/{d.getDate()}
            </text>
          )
        })}
        {clickable.map((p) => (
          <g
            key={p.e.id}
            className={styles.graphDot}
            role="button"
            tabIndex={0}
            aria-label={`${fmtFull(p.e.at)} ${posText(expanded, workingPos(expanded, entryPos(p.e)))} 그때 모습 보기`}
            aria-pressed={viewingId === p.e.id}
            onClick={() => onView(viewingId === p.e.id ? null : p.e)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault()
                onView(viewingId === p.e.id ? null : p.e)
              }
            }}
          >
            <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
            <circle cx={p.x} cy={p.y} r={p.e.id === sel ? 7 : 5} fill={p.e.id === sel ? 'var(--accent)' : 'var(--white)'} stroke="var(--accent)" strokeWidth="2.5" />
          </g>
        ))}
      </svg>
    </div>
  )
}
