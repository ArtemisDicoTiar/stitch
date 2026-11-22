'use client'

import { useState } from 'react'

type Props = {
  id: string
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  className?: string
  'aria-describedby'?: string
}

/**
 * 숫자 입력 칸. 치는 동안에는 친 글자를 그대로 보여 주고(지웠다 다시 칠 수 있게),
 * 숫자로 읽히면 범위 안으로 맞춰 바로 알립니다.
 */
export function NumberField({ id, value, min, max, onCommit, className, ...rest }: Props) {
  const [text, setText] = useState<string | null>(null)
  return (
    <input
      id={id}
      className={className}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={text ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value
        setText(t)
        const n = Number(t)
        if (t.trim() !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, Math.round(n))))
      }}
      onBlur={() => setText(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      {...rest}
    />
  )
}
