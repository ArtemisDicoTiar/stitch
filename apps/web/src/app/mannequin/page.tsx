import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { MannequinClient } from '@/components/mannequin/MannequinClient'
import { currentUser } from '@/server/auth'
import { getAvatar } from '@/server/avatar'
import styles from './mannequin.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: '마네킹 꾸미기' }

/**
 * 마네킹 꾸미기. 유료 기능은 이것 하나입니다.
 * 골라 보는 것은 누구나 되고, 저장은 플러스만 됩니다 (권한은 `PUT /api/avatar` 가 확인합니다).
 */
export default async function MannequinPage() {
  const user = await currentUser()
  const state = await getAvatar(user.id)
  return (
    <div className={styles.page}>
      <SiteHeader />
      <main id="main" className={styles.main}>
        <div className={styles.inner}>
          <MannequinClient initial={state} />
        </div>
      </main>
    </div>
  )
}
