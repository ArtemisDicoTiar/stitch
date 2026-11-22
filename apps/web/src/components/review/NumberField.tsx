'use client'

import { useState } from 'react'
import styles from './Review.module.css'

type Props = {
  id?: string
  value: number | undefined
  /** 올바른 정수일 때만 불립니다. 비워도 되는 칸을 비우면 undefined */
  onCommit: (value: number | undefined) => void
  min?: number
  max?: number
  allowEmpty?: boolean
  placeholder?: string
  'aria-label'?: string
  'aria-describedby'?: string
  className?: string
}

/**
 * 정수만 받는 칸. 치는 동안은 글자를 그대로 두고, 범위 안의 정수가 되었을 때만 값을 넘깁니다.
 * 잘못된 값인 채로 칸을 떠나면 마지막으로 넘긴 값으로 돌아갑니다. IR에 NaN이나 음수가 들어가지 않습니다.
 */
export function NumberField({ id, value, onCommit, min = 0, max = 9999, allowEmpty = false, placeholder, className, ...aria }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === undefined ? '' : String(value))
  const parse = (text: string): { ok: boolean; value?: number } => {
    const t = text.trim()
    if (t === '') return { ok: allowEmpty }
    if (!/^\d{1,5}$/.test(t)) return { ok: false }
    const n = Number(t)
    return n >= min && n <= max ? { ok: true, value: n } : { ok: false }
  }
  const invalid = draft !== null && !parse(draft).ok
  return (
    <input
      id={id}
      className={`${styles.num} ${className ?? ''}`}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={shown}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setDraft(e.target.value)
        const p = parse(e.target.value)
        if (p.ok && p.value !== value) onCommit(p.value)
      }}
      onBlur={() => setDraft(null)}
      {...aria}
    />
  )
}
