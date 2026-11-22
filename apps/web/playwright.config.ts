import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '../..')
const PORT = Number(process.env.E2E_PORT || 3210)

// 화면 테스트는 따로 둔 데이터 폴더에서 매번 새로 시작합니다. 개발용 데이터는 건드리지 않습니다.
// 빌드 폴더(.next-e2e)도 함께 지웁니다. 여러 번 다시 쓰면 개발 서버의 캐시가 어긋나
// 화면이 "다시 빌드 → 새로 고침"을 끝없이 되풀이한 적이 있습니다.
if (!process.env.E2E_KEEP_DATA && !process.env.TEST_WORKER_INDEX) {
  for (const dir of ['data/e2e-pg', 'data/e2e-uploads']) rmSync(join(root, dir), { recursive: true, force: true })
  rmSync(join(here, '.next-e2e'), { recursive: true, force: true })
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ko-KR', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /.*\.phone\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    cwd: here,
    url: `http://localhost:${PORT}/api/me`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_DIST_DIR: '.next-e2e',
      DATABASE_URL: 'pglite://./data/e2e-pg',
      STORAGE_DIR: './data/e2e-uploads',
      AUTH_MODE: 'local',
      BILLING_PROVIDER: 'mock',
      ANTHROPIC_API_KEY: '',
    },
  },
})
