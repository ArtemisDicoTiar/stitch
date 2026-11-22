import type { ReactNode } from 'react'
import type { AvatarPart } from '@stitch/render-3d/avatar'

/**
 * 고르는 칸에 들어가는 작은 그림. 디자인(Mannequin)의 선 그림을 그대로 옮겼습니다.
 * 피부 톤은 그림 대신 색 견본을 씁니다 (MannequinClient).
 */
const GLYPHS: Record<Exclude<AvatarPart, 'skin'>, Record<string, ReactNode>> = {
  face: {
    default: <ellipse cx="24" cy="24" rx="13" ry="17" />,
    round: <circle cx="24" cy="24" r="16" />,
    slim: <path d="M12 19c0-8 5-13 12-13s12 5 12 13c0 11-6 23-12 23S12 30 12 19z" strokeLinejoin="round" />,
    square: <rect x="11" y="7" width="26" height="34" rx="9" />,
  },
  hair: {
    none: <circle cx="24" cy="27" r="13" />,
    bangs: (
      <g strokeLinejoin="round">
        <circle cx="24" cy="27" r="13" />
        <path d="M11 26c0-8 6-13 13-13s13 5 13 13c-3-3-6-5-8-5-2 2-5 3-8 3-4 0-7-1-10 2z" fill="currentColor" />
      </g>
    ),
    bob: (
      <g strokeLinejoin="round">
        <circle cx="24" cy="27" r="11" />
        <path d="M9 38V24c0-9 7-14 15-14s15 5 15 14v14h-5V25c-4-1-7-3-10-6-2 3-6 5-10 6v13z" fill="currentColor" />
      </g>
    ),
    long: (
      <g strokeLinejoin="round">
        <circle cx="24" cy="24" r="11" />
        <path d="M9 46V21C9 12 16 7 24 7s15 5 15 14v25h-5V22c-4-1-7-3-10-6-2 3-6 5-10 6v24z" fill="currentColor" />
      </g>
    ),
    bun: (
      <g strokeLinejoin="round">
        <circle cx="24" cy="29" r="12" />
        <circle cx="24" cy="9" r="6" fill="currentColor" />
        <path d="M12 28c0-8 5-12 12-12s12 4 12 12c-4-3-8-5-12-5s-8 2-12 5z" fill="currentColor" />
      </g>
    ),
  },
  glasses: {
    none: (
      <g strokeLinecap="round">
        <circle cx="24" cy="24" r="13" />
        <path d="M15 33l18-18" />
      </g>
    ),
    round: (
      <g strokeWidth="2.4" strokeLinecap="round">
        <circle cx="14" cy="24" r="8" />
        <circle cx="34" cy="24" r="8" />
        <path d="M22 23c1-1 3-1 4 0" />
        <path d="M6 22l-3-2" />
        <path d="M42 22l3-2" />
      </g>
    ),
    horn: (
      <g strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="17" width="16" height="13" rx="4" />
        <rect x="27" y="17" width="16" height="13" rx="4" />
        <path d="M21 22h6" />
      </g>
    ),
    half: (
      <g strokeLinecap="round">
        <path d="M5 19h17M26 19h17" strokeWidth="3.6" />
        <path d="M6 20c0 7 3 10 7.5 10S21 27 21 20M27 20c0 7 3 10 7.5 10S42 27 42 20" strokeWidth="1.6" />
      </g>
    ),
    sun: (
      <g fill="currentColor" strokeLinejoin="round">
        <path d="M5 18h17v5c0 5-3 8-8.500 8S5 28 5 23z" />
        <path d="M26 18h17v5c0 5-3 8-8.500 8S26 28 26 23z" />
        <path d="M22 20h4" fill="none" />
      </g>
    ),
  },
}

export function OptionIcon({ part, id, className }: { part: Exclude<AvatarPart, 'skin'>; id: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      {GLYPHS[part][id] ?? null}
    </svg>
  )
}

export function LockIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

export function CheckIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}
