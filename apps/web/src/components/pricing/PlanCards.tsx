'use client'

import { useEffect, useState } from 'react'
import { SamplePreview } from '@/components/home/SamplePreview'
import { ApiError, apiFetch } from '@/lib/api'
import styles from './PlanCards.module.css'

type Plan = 'free' | 'plus'

const PLAN_NAME: Record<Plan, string> = { free: '무료', plus: '플러스' }

function Check() {
  return (
    <svg className={styles.check} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/**
 * 무료와 플러스 카드. 지금은 실제 결제가 없고, 버튼이 가짜 결제 스위치(`/api/billing`)를 켜고 끕니다.
 * 가격과 변환 개수는 아직 정해지지 않아 디자인의 빈칸([ ]) 그대로 둡니다.
 */
export function PlanCards({ initialPlan }: { initialPlan: Plan }) {
  const [plan, setPlan] = useState<Plan>(initialPlan)
  // 스크립트가 준비되기 전에는 눌러도 아무 일이 없으므로, 그동안은 버튼을 꺼 둡니다.
  const [ready, setReady] = useState(false)
  useEffect(() => setReady(true), [])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function change(next: Plan) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await apiFetch<{ plan: Plan }>('/api/billing', { method: 'POST', json: { plan: next } })
      setPlan(res.plan)
      setMessage(res.plan === 'plus' ? '플러스로 바꿨어요.' : '무료로 돌아왔어요.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '플랜을 바꾸지 못했습니다. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.now}>
        지금 플랜{' '}
        <strong className={styles.nowChip} data-plan={plan} data-testid="current-plan">
          {PLAN_NAME[plan]}
        </strong>
      </p>

      <div className={styles.cards}>
        <section className={styles.free} aria-labelledby="plan-free">
          <h2 id="plan-free" className={styles.name}>
            무료
          </h2>
          <p className={styles.price}>0원</p>
          <p className={styles.soft}>도안 한 벌을 끝까지 따라 뜨는 데 필요한 것 전부</p>
          <ul className={styles.list}>
            <li>
              <Check />
              대바늘, 코바늘 PDF 도안 변환 [개수]개
            </li>
            <li>
              <Check />
              기호 도안, 3D 모형, 단계별 안내, 기호별 뜨는 법
            </li>
            <li>
              <Check />
              날짜별 진행 기록과 단수링
            </li>
            <li>
              <Check />
              내 게이지에 맞춘 코 수 계산
            </li>
            <li>
              <Check />
              기본 회색 마네킹
            </li>
          </ul>
          {plan === 'free' ? (
            <span className={styles.current}>지금 쓰는 플랜</span>
          ) : (
            <button type="button" className={styles.backButton} onClick={() => change('free')} disabled={!ready || busy} data-busy={busy || undefined}>
              무료로 돌아가기
            </button>
          )}
        </section>

        <section className={styles.plus} aria-labelledby="plan-plus">
          <div className={styles.plusTop}>
            <div className={styles.plusHead}>
              <h2 id="plan-plus" className={styles.name}>
                플러스
              </h2>
              <p className={styles.price}>
                <span className={styles.amount}>[월 가격]원</span> <span className={styles.per}>/ 월</span>
              </p>
              <p className={styles.plusLead}>완성했을 때의 모습을 나와 비슷하게</p>
            </div>
            <div className={styles.plusArt}>
              <SamplePreview sample="practice-hood" avatar="styled" height={124} label="꾸민 마네킹" />
            </div>
          </div>
          <ul className={styles.list}>
            <li>
              <Check />
              무료의 모든 기능
            </li>
            <li>
              <Check />
              마네킹 꾸미기: 얼굴형, 피부 톤, 머리, 안경
            </li>
            <li>
              <Check />
              꾸민 마네킹을 모든 도안 페이지에 저장
            </li>
            <li>
              <Check />
              PDF 도안 변환 [개수]개
            </li>
          </ul>
          {plan === 'plus' ? (
            <span className={styles.current}>지금 쓰는 플랜</span>
          ) : (
            <button type="button" className={styles.plusButton} onClick={() => change('plus')} disabled={!ready || busy} data-busy={busy || undefined}>
              플러스 시작하기
            </button>
          )}
        </section>
      </div>

      <div className={styles.notes}>
        <p className={styles.testNote}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 7.5v.01" />
          </svg>
          <span>실제 결제가 아니에요. 지금은 이 컴퓨터에서 플랜만 바꿔 보는 테스트용 스위치입니다.</span>
        </p>
        <p className={styles.undecided}>가격과 변환 개수는 아직 정해지지 않아 [ ]로 비워 두었어요.</p>
        <p className={styles.status} role="status">
          {message}
        </p>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
