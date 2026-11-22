import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// 환경 변수는 저장소 맨 위의 .env 하나에 둡니다.
const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const envFile = join(root, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const config: NextConfig = {
  transpilePackages: [
    '@stitch/pattern-ir',
    '@stitch/engine',
    '@stitch/reader',
    '@stitch/render-chart',
    '@stitch/render-3d',
    '@stitch/tutorials',
    '@stitch/fixtures',
  ],
  // 내장형 Postgres와 PDF 읽기는 서버에서만 그대로 불러옵니다.
  serverExternalPackages: ['@electric-sql/pglite', 'pdfjs-dist'],
  outputFileTracingRoot: root,
  turbopack: { root },
  poweredByHeader: false,
  // 개발 서버를 여러 개 띄울 때(화면 테스트 등) 빌드 폴더를 나눕니다.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  agentRules: false,
}

export default config
