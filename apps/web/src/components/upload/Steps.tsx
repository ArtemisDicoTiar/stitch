import styles from './Steps.module.css'

const STEPS = ['도안 올리기', '읽은 내용 확인', '게이지 맞추기', '페이지 완성'] as const

/** 올리기 → 확인 → 게이지 → 완성 가운데 지금 어디인지 보여 주는 줄 */
export function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className={styles.steps} aria-label="진행 단계">
      {STEPS.map((name, i) => {
        const n = i + 1
        const state = n < current ? 'done' : n === current ? 'current' : 'todo'
        return (
          <li key={name} className={styles.step} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.num} aria-hidden="true">
              {state === 'done' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : (
                n
              )}
            </span>
            {name}
            {state === 'done' && <span className="sr-only"> (끝남)</span>}
          </li>
        )
      })}
    </ol>
  )
}
