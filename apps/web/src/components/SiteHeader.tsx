import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import { MascotMark } from './Mascot'
import styles from './SiteHeader.module.css'

type NavKey = 'features' | 'pricing' | 'library' | 'upload'

/** 모든 화면 위에 놓이는 코코아색 머리띠 */
export function SiteHeader({ current }: { current?: NavKey }) {
  const cur = (k: NavKey) => (current === k ? ('page' as const) : undefined)
  return (
    <div className={styles.band}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <MascotMark />
          {BRAND}
        </Link>
        <nav className={styles.nav} aria-label="주 메뉴">
          <Link href="/#features" className={styles.link} aria-current={cur('features')}>
            기능
          </Link>
          <Link href="/pricing" className={styles.link} aria-current={cur('pricing')}>
            요금제
          </Link>
          <Link href="/library" className={styles.link} aria-current={cur('library')}>
            내 도안
          </Link>
          <Link href="/upload" className={styles.cta} aria-current={cur('upload')}>
            도안 올리기
          </Link>
        </nav>
      </header>
    </div>
  )
}
