import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_KR } from 'next/font/google'
import { BRAND, TAGLINE } from '@/lib/brand'
import './globals.css'

const plex = IBM_Plex_Sans_KR({ weight: ['400', '500', '600', '700'], subsets: ['latin'], variable: '--font-plex', display: 'swap' })

export const metadata: Metadata = {
  title: { default: `${BRAND} · ${TAGLINE}`, template: `%s · ${BRAND}` },
  description: '뜨개 도안 PDF를 올리면 기호 도안, 3D 모형, 단계별 안내가 있는 따라 뜨기 페이지를 만들어 줍니다.',
  // 올린 도안은 올린 사람만 봅니다. 검색에 걸릴 페이지는 없습니다.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2a201b' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={plex.variable}>
      <body>
        <a href="#main" className="skip">
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  )
}
