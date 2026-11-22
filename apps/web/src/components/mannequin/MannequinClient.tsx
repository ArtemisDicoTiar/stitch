'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
// three.js가 없는 선택지 목록만 가져옵니다. 3D 본체는 MannequinPreview가 필요할 때 불러옵니다.
import { AVATAR_CATALOG, AVATAR_PARTS, AVATAR_PART_LABELS, DEFAULT_AVATAR, isFreeAvatar, plusSelections, type Avatar, type AvatarPart } from '@stitch/render-3d/avatar'
import { ApiError, apiFetch } from '@/lib/api'
import type { AvatarState } from '@/server/avatar'
import { MannequinPreview } from './MannequinPreview'
import { CheckIcon, LockIcon, OptionIcon } from './OptionIcon'
import styles from './Mannequin.module.css'

const same = (a: Avatar, b: Avatar) => AVATAR_PARTS.every((part) => a[part] === b[part])

const labelOf = (part: AvatarPart, id: string) => AVATAR_CATALOG[part].find((o) => o.id === id)?.label ?? id

/**
 * 마네킹 꾸미기 화면.
 *
 * - 고르면 미리보기가 바로 바뀝니다. 미리보기는 브라우저 안에서만 바뀝니다.
 * - 저장은 언제나 서버에 물어봅니다 (`PUT /api/avatar`). 플러스가 아니면 서버가 403 `plus_required` 로 거절하고,
 *   화면은 그 답을 받아 설명과 요금제 링크를 보여 줍니다. 화면이 알고 있는 플랜만 믿고 막지 않습니다.
 * - 플러스를 그만둔 사람이 저장해 둔 값은 그대로 보여 주고, 다른 화면에서는 기본 모습으로 보인다고 알려 줍니다.
 */
export function MannequinClient({ initial }: { initial: AvatarState }) {
  const [plan, setPlan] = useState(initial.plan)
  const [saved, setSaved] = useState<Avatar | null>(initial.saved)
  const [avatar, setAvatar] = useState<Avatar>(initial.saved ?? DEFAULT_AVATAR)
  const [hoodOn, setHoodOn] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [needsPlus, setNeedsPlus] = useState(false)
  const [error, setError] = useState('')
  /** 사용자가 직접 고르기 시작했는지. 그 뒤로는 서버 값으로 고른 것을 덮어쓰지 않습니다. */
  const touched = useRef(false)
  /** 늦게 도착한 응답이 새 응답을 덮어쓰지 않게 하는 순번 */
  const seq = useRef(0)
  const messagesRef = useRef<HTMLDivElement>(null)
  const saveTitleId = useId()

  const base = saved ?? DEFAULT_AVATAR
  const dirty = !same(avatar, base)
  const isDefault = same(avatar, DEFAULT_AVATAR)
  const picks = plusSelections(avatar)
  /** 플러스를 그만둬서, 저장해 둔 꾸미기가 다른 화면에서는 보이지 않는 상태 */
  const lapsed = plan === 'free' && saved !== null && !isFreeAvatar(saved)

  // 요금제 화면에서 플랜을 바꾸고 돌아왔을 때처럼, 화면이 가진 플랜과 저장 값이 낡았을 수 있어 다시 읽습니다.
  const sync = useCallback(async () => {
    const mine = ++seq.current
    try {
      const next = await apiFetch<AvatarState>('/api/avatar')
      if (mine !== seq.current) return
      setPlan(next.plan)
      setSaved(next.saved)
      const target = next.saved ?? DEFAULT_AVATAR
      if (!touched.current) setAvatar((prev) => (same(prev, target) ? prev : target))
    } catch {
      // 다시 읽지 못해도 처음 받은 값으로 계속 씁니다. 저장할 때 서버가 다시 확인합니다.
    }
  }, [])

  useEffect(() => {
    void sync()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [sync])

  // 저장 결과나 설명이 나오면 화면 안으로 들어오게 합니다. (좁은 화면에서는 버튼 아래가 가려져 있을 수 있습니다.)
  useEffect(() => {
    if (status || needsPlus || error) messagesRef.current?.scrollIntoView({ block: 'nearest' })
  }, [status, needsPlus, error])

  function clearMessages() {
    setStatus('')
    setNeedsPlus(false)
    setError('')
  }

  function choose(part: AvatarPart, id: string) {
    touched.current = true
    setAvatar((prev) => ({ ...prev, [part]: id }) as Avatar)
    clearMessages()
  }

  function reset() {
    if (isDefault) return
    touched.current = true
    setAvatar(DEFAULT_AVATAR)
    clearMessages()
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!dirty) {
      setStatus('저장한 모습과 같아요. 바꾼 것이 없습니다.')
      return
    }
    setBusy(true)
    clearMessages()
    try {
      // 플러스인지는 서버가 정합니다. 화면이 아는 플랜으로 미리 막지 않습니다.
      const next = await apiFetch<AvatarState>('/api/avatar', { method: 'PUT', json: avatar })
      // 이보다 먼저 보낸 다시 읽기의 응답은 버립니다.
      seq.current += 1
      setPlan(next.plan)
      setSaved(next.saved)
      setStatus('저장했어요')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plus_required') {
        setPlan('free')
        setNeedsPlus(true)
      } else {
        setError(err instanceof ApiError ? err.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      }
    } finally {
      setBusy(false)
    }
  }

  const summary = AVATAR_PARTS.map((part) => `${AVATAR_PART_LABELS[part]} ${labelOf(part, avatar[part])}`).join(', ')
  const badge = dirty ? { text: '아직 저장 전', unsaved: true } : { text: saved && !isDefault ? '저장한 모습' : '기본 모습', unsaved: false }

  const saveTitle = picks.length === 0 ? '기본 모습이에요' : plan === 'plus' ? `플러스 항목 ${picks.length}개를 골랐어요` : `플러스 항목 ${picks.length}개를 미리 보는 중이에요`

  return (
    <div className={styles.root}>
      <div className={styles.head}>
        <Link href="/library" className={styles.back}>
          내 도안으로 돌아가기
        </Link>
        <div className={styles.titleRow}>
          <h1 className={styles.h1}>마네킹 꾸미기</h1>
          <span className={styles.plusChip}>플러스</span>
          <span className={styles.planChip} data-plan={plan} data-testid="plan-chip">
            {plan === 'plus' ? '플러스 사용 중' : '무료 플랜'}
          </span>
        </div>
        {plan === 'plus' ? (
          <p className={styles.lead}>완성했을 때의 모습을 나와 비슷하게 볼 수 있어요. 고른 모습을 저장하면 도안 페이지의 마네킹도 그 모습으로 보입니다.</p>
        ) : (
          <p className={styles.lead}>
            완성했을 때의 모습을 나와 비슷하게 볼 수 있어요. 자물쇠가 붙은 항목도 눌러서 미리 볼 수 있습니다. 골라 보는 것은 무료이고, 저장은 플러스에서 됩니다.
          </p>
        )}
        {lapsed && (
          <div className={styles.lapsed} data-testid="lapsed-note">
            <p>플러스 때 저장한 모습은 지우지 않고 그대로 두었어요. 플러스를 다시 시작하면 돌아옵니다. 지금 도안 페이지의 마네킹은 기본 모습으로 보여요.</p>
            <Link href="/pricing" className={styles.textLink}>
              요금제 보기
            </Link>
          </div>
        )}
      </div>

      <div className={styles.columns}>
        <MannequinPreview avatar={avatar} hoodOn={hoodOn} onHoodChange={setHoodOn} badge={badge} summary={summary} />

        <form className={styles.optionsCol} onSubmit={save} aria-label="고르기와 저장">
          <div className={styles.card}>
            {AVATAR_PARTS.map((part) => (
              <fieldset key={part} className={styles.group}>
                <legend className={styles.legend}>{AVATAR_PART_LABELS[part]}</legend>
                <div className={styles.tiles} data-part={part}>
                  {AVATAR_CATALOG[part].map((o) => (
                    <label key={o.id} className={styles.tile}>
                      <input type="radio" className={styles.radio} name={part} value={o.id} checked={avatar[part] === o.id} onChange={() => choose(part, o.id)} />
                      <span className={styles.tileBody}>
                        <span className={styles.check} aria-hidden="true">
                          <CheckIcon size={11} />
                        </span>
                        {part === 'skin' ? <span className={styles.swatch} style={{ background: o.swatch }} aria-hidden="true" /> : <OptionIcon part={part} id={o.id} className={styles.tileIcon} />}
                        <span className={styles.tileLabel}>{o.label}</span>
                        {o.tier === 'plus' && (
                          <span className={styles.plusBadge}>
                            {plan !== 'plus' && <LockIcon size={10} />}
                            플러스
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <section className={styles.savePanel} aria-labelledby={saveTitleId}>
            <h2 id={saveTitleId} className={styles.saveTitle} data-testid="save-title">
              {saveTitle}
            </h2>
            {picks.length > 0 && (
              <ul className={styles.picks} aria-label="고른 플러스 항목">
                {picks.map((p) => (
                  <li key={p.part}>
                    {AVATAR_PART_LABELS[p.part]} · {p.label}
                  </li>
                ))}
              </ul>
            )}
            {plan === 'plus' ? (
              <p className={styles.saveText}>플러스를 쓰고 있어요. 저장하면 도안 페이지의 마네킹이 이 모습으로 보입니다.</p>
            ) : (
              <p className={styles.saveText}>골라 보는 건 누구나 할 수 있어요. 꾸민 마네킹을 내 페이지에 저장하려면 플러스가 필요해요.</p>
            )}
            <div className={styles.actions}>
              {/* 누를 수 없을 때도 초점은 받을 수 있게 aria-disabled 로 둡니다. 저장한 뒤 초점이 사라지지 않습니다. */}
              <button type="submit" className={styles.saveBtn} aria-disabled={!dirty || busy}>
                {busy ? '저장하는 중' : '저장하기'}
              </button>
              <button type="button" className={styles.resetBtn} aria-disabled={isDefault} onClick={reset}>
                기본 모습으로
              </button>
              {plan !== 'plus' && !needsPlus && (
                <Link href="/pricing" className={styles.textLink}>
                  플러스 알아보기
                </Link>
              )}
            </div>

            <div ref={messagesRef} className={styles.messages}>
              <p className={styles.status} role="status" data-testid="save-status" data-on={status ? true : undefined}>
                {status === '저장했어요' && <CheckIcon size={16} />}
                {status}
              </p>

              {/* 서버가 플러스가 필요하다고 답했을 때의 설명. 자리는 늘 두고 내용만 바꿉니다. */}
              <div aria-live="polite">
                {needsPlus && (
                  <div className={styles.plusNotice} data-testid="plus-required">
                    <p>
                      <strong>저장되지 않았어요.</strong> 플러스 항목이 들어간 모습은 플러스에서만 저장할 수 있어요. 고른 모습은 이 화면에서 계속 볼 수 있습니다.
                    </p>
                    <Link href="/pricing" className={styles.textLink}>
                      요금제에서 플러스 보기
                    </Link>
                  </div>
                )}
              </div>

              {error && (
                <p className="notice notice-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </section>
        </form>
      </div>
    </div>
  )
}
