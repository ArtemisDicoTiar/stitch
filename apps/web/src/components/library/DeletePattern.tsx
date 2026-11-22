'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ApiError, apiFetch } from '@/lib/api'
import styles from './DeletePattern.module.css'

/** 도안 지우기. 한 번 더 확인한 뒤에 지웁니다. */
export function DeletePattern({ id, title }: { id: string; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const textId = useId()
  const router = useRouter()
  // 스크립트가 준비되기 전에는 눌러도 아무 일이 없으므로, 그동안은 버튼을 꺼 둡니다.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [busy, setBusy] = useState(false)
  const [refreshing, startRefresh] = useTransition()
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true)
    setError('')
    try {
      await apiFetch(`/api/patterns/${id}`, { method: 'DELETE' })
      dialog.current?.close()
      // 목록을 서버에서 다시 읽습니다. 이 카드는 그때 사라집니다.
      startRefresh(() => router.refresh())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '도안을 지우지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={`${title} 지우기`}
        disabled={!ready || busy || refreshing}
        data-busy={busy || refreshing || undefined}
        onClick={() => {
          setError('')
          dialog.current?.showModal()
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="M6 7l1 13h10l1-13" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
        지우기
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={textId}>
        <h2 id={titleId} className={styles.title}>
          이 도안을 지울까요?
        </h2>
        <p className={styles.name}>{title}</p>
        <p id={textId} className={styles.text}>
          도안을 지우면 PDF, 기록, 단수링이 함께 지워집니다.
        </p>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" className="btn" onClick={() => dialog.current?.close()} disabled={busy}>
            취소
          </button>
          <button type="button" className={`btn ${styles.danger}`} onClick={remove} disabled={busy}>
            {busy ? '지우는 중' : '지우기'}
          </button>
        </div>
      </dialog>
    </>
  )
}
