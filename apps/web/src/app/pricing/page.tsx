import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { PlanCards } from '@/components/pricing/PlanCards'
import { currentUser } from '@/server/auth'
import { planOf } from '@/server/billing'
import styles from './pricing.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '요금제' }

const FAQ = [
  { q: '올린 도안은 누가 볼 수 있나요?', a: '올린 사람만 볼 수 있어요. 만들어진 페이지에는 공유 링크가 생기지 않습니다.' },
  { q: '플러스를 그만두면 어떻게 되나요?', a: '마네킹은 기본 모습으로 돌아가요. 도안과 뜨개 기록은 그대로 남습니다.' },
  { q: '게이지 계산도 무료인가요?', a: '네. 크기를 맞추는 기능은 누구나 쓸 수 있어요.' },
]

export default async function PricingPage() {
  const user = await currentUser()
  const plan = await planOf(user.id)
  return (
    <div className={styles.page}>
      <SiteHeader current="pricing" />
      <main id="main" className={styles.main}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <h1 className={styles.h1}>요금제</h1>
            <p className={styles.soft}>도안을 읽고 따라 뜨는 기능은 무료예요. 마네킹 꾸미기는 플러스에서 열립니다.</p>
          </div>

          <PlanCards initialPlan={plan} />

          <section className={styles.faq} aria-labelledby="faq-title">
            <h2 id="faq-title" className={styles.h2}>
              자주 묻는 것
            </h2>
            <div className={styles.faqGrid}>
              {FAQ.map((f) => (
                <div key={f.q} className={styles.faqItem}>
                  <h3 className={styles.q}>{f.q}</h3>
                  <p className={styles.a}>{f.a}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
