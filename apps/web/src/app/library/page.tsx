import type { Metadata } from 'next'
import Link from 'next/link'
import { Mascot } from '@/components/Mascot'
import { SiteHeader } from '@/components/SiteHeader'
import { PatternCard } from '@/components/library/PatternCard'
import { currentUser } from '@/server/auth'
import { planOf } from '@/server/billing'
import { listPatterns } from '@/server/patterns'
import styles from './library.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '내 도안' }

function UploadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

export default async function LibraryPage() {
  const user = await currentUser()
  const plan = await planOf(user.id)
  const items = await listPatterns(user.id)

  return (
    <div className={styles.page}>
      <SiteHeader current="library" />
      <main id="main" className={styles.main}>
        <div className={styles.inner}>
          <div className={styles.head}>
            <div className={styles.headText}>
              <h1 className={styles.h1}>내 도안</h1>
              <p className={styles.soft}>
                {plan === 'plus' ? '플러스' : '무료'} 플랜 · 도안 {items.length}개
              </p>
            </div>
            <Link href="/upload" className={styles.cta}>
              <UploadIcon />새 도안 올리기
            </Link>
          </div>

          {items.length === 0 ? (
            <div className={styles.empty}>
              <Mascot size={132} />
              <h2 className={styles.emptyTitle}>아직 올린 도안이 없어요</h2>
              <p className={styles.emptyText}>PDF를 올리면 따라 뜨는 페이지가 만들어져요. 예시 도안으로 먼저 둘러볼 수도 있어요.</p>
              <Link href="/upload" className={styles.cta}>
                첫 도안 올리기
              </Link>
            </div>
          ) : (
            <ul className={styles.grid}>
              {items.map((item) => (
                <PatternCard key={item.id} item={item} gaugeMode={item.status === 'ready' ? item.gaugeMode : null} />
              ))}
              <li className={styles.addItem}>
                <Link href="/upload" className={styles.add}>
                  <span className={styles.plus}>
                    <PlusIcon />
                  </span>
                  <strong className={styles.addTitle}>새 도안 올리기</strong>
                  <span className={styles.addText}>PDF를 올리면 따라 뜨는 페이지가 만들어져요.</span>
                </Link>
              </li>
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}
