import type { Metadata } from 'next'
import { SiteHeader } from '@/components/SiteHeader'
import { Steps } from '@/components/upload/Steps'
import { UploadAside } from '@/components/upload/UploadAside'
import { UploadClient } from '@/components/upload/UploadClient'
import styles from '@/components/upload/Upload.module.css'

export const metadata: Metadata = { title: '도안 올리기' }

export default function UploadPage() {
  return (
    <>
      <SiteHeader current="upload" />
      <main id="main" className={styles.page}>
        <div className={styles.inner}>
          <Steps current={1} />
          <div className={styles.head}>
            <h1 className={styles.title}>도안 PDF를 올려 주세요</h1>
            <p className={styles.lead}>가지고 있는 대바늘이나 코바늘 도안 PDF를 올려요. 준비물, 게이지, 단별 지시문을 읽어 냅니다.</p>
          </div>
          <div className={styles.cols}>
            <UploadClient />
            <UploadAside />
          </div>
        </div>
      </main>
    </>
  )
}
