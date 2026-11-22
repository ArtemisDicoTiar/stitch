'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ApiError, apiFetch } from '@/lib/api'
import styles from './Upload.module.css'

type Created = { id: string; status: 'reading' | 'needs_review' | 'ready' | 'failed'; reused: boolean }

/** 서버 설정(/api/me의 maxPdfBytes)을 받기 전에 쓰는 기본 상한입니다. 서버가 다시 확인합니다. */
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024
/** 직접 쓴 예시 도안. 대바늘과 코바늘 하나씩 */
const SAMPLES = [
  { id: 'practice-hood', label: '예시 도안으로 둘러보기', name: '대바늘 예시 도안' },
  { id: 'practice-ball', label: '코바늘 예시로 둘러보기', name: '코바늘 예시 도안' },
] as const

export function FileIcon() {
  return (
    <svg className={styles.fileIcon} width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  )
}

export function UploadClient() {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  // on: 읽을 수 있음, replay: 로컬에서 남겨 둔 응답으로만, off: 배포인데 API 키가 없어 읽을 수 없음
  const [reading, setReading] = useState<'on' | 'replay' | 'off' | null>(null)
  const off = reading === 'off'
  // 배포 환경에서는 받을 수 있는 크기가 더 작습니다.
  const [maxBytes, setMaxBytes] = useState(DEFAULT_MAX_BYTES)
  const maxMb = Math.floor(maxBytes / 1024 / 1024)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<{ kind: 'file' | 'sample'; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reused, setReused] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    apiFetch<{ canReadPdf: boolean; pdfReading?: 'on' | 'replay' | 'off'; maxPdfBytes?: number }>('/api/me')
      .then((me) => {
        if (!alive) return
        setReading(me.pdfReading ?? (me.canReadPdf ? 'on' : 'replay'))
        if (me.maxPdfBytes) setMaxBytes(me.maxPdfBytes)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // 이미 읽은 파일이면 알려 준 뒤 그 도안이 있는 곳으로 갑니다. 읽는 중 화면이 상태를 보고 알맞은 화면으로 보냅니다.
  useEffect(() => {
    if (!reused) return
    const t = setTimeout(() => router.push(reused), 1600)
    return () => clearTimeout(t)
  }, [reused, router])

  async function upload(files: FileList | File[] | null) {
    if (busy || off || !files || files.length === 0) return
    setError(null)
    setReused(null)
    if (files.length > 1) {
      setError('PDF는 한 번에 하나만 올릴 수 있어요.')
      return
    }
    const file = files[0]
    if (file.size > maxBytes) {
      setError(`PDF가 너무 큽니다. ${maxMb}MB 이하로 올려 주세요.`)
      return
    }
    setBusy({ kind: 'file', name: file.name })
    try {
      const body = new FormData()
      body.append('file', file)
      const made = await apiFetch<Created>('/api/patterns', { method: 'POST', body })
      if (made.reused) {
        setReused(`/patterns/${made.id}/reading`)
        setBusy(null)
        return
      }
      router.push(`/patterns/${made.id}/reading`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '올리지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
      setBusy(null)
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  async function startSample(sample: (typeof SAMPLES)[number]) {
    if (busy) return
    setError(null)
    setReused(null)
    setBusy({ kind: 'sample', name: sample.name })
    try {
      const made = await apiFetch<Created>('/api/patterns', { method: 'POST', json: { sample: sample.id } })
      router.push(`/patterns/${made.id}/review`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '예시 도안을 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
      setBusy(null)
    }
  }

  const drag = (on: boolean) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (!busy && !off) setOver(on)
  }
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOver(false)
    void upload(e.dataTransfer.files)
  }

  const uploading = busy?.kind === 'file'

  return (
    <div className={styles.main}>
      {reading === 'replay' && (
        <p className="notice" data-testid="no-key-notice">
          이 서버에는 API 키가 설정되어 있지 않아 <strong>새 PDF는 읽을 수 없어요.</strong> 예시 도안은 그대로 둘러볼 수 있고, 저장소의 연습용 PDF(<code className={styles.path}>fixtures/reading/practice-hood.pdf</code>)는 준비해 둔 응답으로 읽힙니다.
        </p>
      )}
      {off && (
        <p className="notice" data-testid="no-key-notice">
          <strong>지금은 PDF 읽기가 꺼져 있어요.</strong> 아래 예시 도안으로 읽은 내용 확인부터 작업 화면까지 먼저 둘러볼 수 있어요.
        </p>
      )}

      <div className={styles.drop} data-testid="dropzone" data-over={over || undefined} data-busy={uploading || undefined} data-off={off || undefined} onDragEnter={drag(true)} onDragOver={drag(true)} onDragLeave={drag(false)} onDrop={onDrop}>
        <FileIcon />
        <div className={styles.dropText}>
          <strong className={styles.dropTitle}>{uploading ? busy.name : '도안 PDF를 골라 주세요'}</strong>
          <span className={styles.dropSub} aria-live="polite">
            {uploading ? '올리는 중이에요. 잠시만 기다려 주세요.' : off ? 'PDF 읽기가 켜지면 여기에서 올릴 수 있어요.' : 'PDF 한 개를 올리면 바로 읽기 시작해요.'}
          </span>
        </div>
        <input
          ref={input}
          id="pattern-pdf"
          className={`sr-only ${styles.fileInput}`}
          type="file"
          accept="application/pdf,.pdf"
          disabled={!!busy || off}
          aria-describedby="pattern-pdf-hint"
          onChange={(e) => void upload(e.target.files)}
        />
        <label htmlFor="pattern-pdf" className={`btn btn-primary ${styles.pick}`} aria-disabled={busy || off ? 'true' : undefined}>
          {uploading && <span className={styles.spinner} aria-hidden="true" />}
          PDF 파일 고르기
        </label>
        <span id="pattern-pdf-hint" className={styles.dropHint}>
          PDF를 이 상자에 끌어다 놓아도 돼요. {maxMb}MB까지 올릴 수 있어요.
        </span>
      </div>

      {error && (
        <p className="notice notice-error" role="alert">
          {error}
        </p>
      )}
      {reused && (
        <p className="notice" role="status">
          이미 읽은 파일이에요. 다시 읽지 않고 읽어 둔 결과로 이동합니다.{' '}
          <Link href={reused} className={styles.inlineLink}>
            지금 가기
          </Link>
        </p>
      )}

      <section className={styles.sample} aria-labelledby="sample-title">
        <div className={styles.sampleText}>
          <strong id="sample-title">PDF가 없어도 둘러볼 수 있어요</strong>
          <span>직접 쓴 연습용 도안(대바늘 후드 워머, 코바늘 공)으로 읽은 내용 확인부터 작업 화면까지 바로 가 볼 수 있어요.</span>
        </div>
        <div className={styles.sampleBtns}>
          {SAMPLES.map((sample) => (
            <button key={sample.id} type="button" className="btn" onClick={() => startSample(sample)} disabled={!!busy}>
              {busy?.kind === 'sample' && busy.name === sample.name && <span className={styles.spinner} aria-hidden="true" />}
              {sample.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
