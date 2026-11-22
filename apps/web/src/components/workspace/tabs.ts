import type { KeyboardEvent } from 'react'

/**
 * 탭 목록의 키보드 조작: 좌우 화살표, Home, End로 옮기고 바로 고릅니다.
 * tablist 요소의 onKeyDown에 답니다. 탭은 그 안의 [role=tab] 순서를 따릅니다.
 */
export function onTabKey<K extends string>(e: KeyboardEvent<HTMLElement>, keys: readonly K[], current: K, select: (key: K) => void) {
  const i = keys.indexOf(current)
  let next = -1
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % keys.length
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + keys.length) % keys.length
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = keys.length - 1
  if (next < 0) return
  e.preventDefault()
  select(keys[next])
  const tabs = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')
  tabs[next]?.focus()
}
