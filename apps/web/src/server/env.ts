import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** 저장소 맨 위 폴더. pnpm-workspace.yaml이 있는 곳입니다. */
export function repoRoot(): string {
  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}

const fromRoot = (p: string) => (isAbsolute(p) ? p : resolve(repoRoot(), p))

const positive = (v: string | undefined): number | null => {
  const n = Number(v)
  return v && Number.isFinite(n) && n > 0 ? Math.floor(n) : null
}

export type Env = {
  anthropicApiKey: string | null
  /** pglite://<폴더> 또는 postgres://... */
  databaseUrl: string
  /** 내장형 Postgres일 때의 데이터 폴더. memory면 메모리에만 둡니다. 배포용 Postgres면 null */
  pgliteDir: string | null
  /** local: 폴더에 저장, db: 데이터베이스에 저장 (파일 시스템을 쓸 수 없는 배포 환경) */
  storageDriver: 'local' | 'db'
  storageDir: string
  /**
   * local: 고정 사용자 1명 (로컬 개발).
   * anonymous: 로그인 없이 브라우저마다 익명 계정 하나 (서명한 쿠키). 공개 배포에서 방문자끼리 도안이 섞이지 않게 합니다.
   * 계정 로그인(카카오, 구글, 애플)은 이후에 붙입니다.
   */
  authMode: 'local' | 'anonymous'
  authSecret: string | null
  billingProvider: 'mock'
  /** 녹화한 LLM 응답을 두는 폴더 */
  recordingsDir: string
  readerModel: string
  feedbackMaxRounds: number
  /** 올릴 수 있는 PDF의 최대 크기 */
  maxPdfBytes: number
  /** 하루에 변환할 수 있는 도안 수(전체). 없으면 제한하지 않습니다. */
  maxConversionsPerDay: number | null
  /** 한 사용자가 올릴 수 있는 도안 수. 없으면 제한하지 않습니다. */
  maxConversionsPerUser: number | null
  /**
   * 한 계정이 둘 수 있는 도안 수. 가격표가 아니라, 익명 계정 하나가 한없이 쌓지 못하게 하는 안전장치입니다.
   * 익명 모드에서는 기본 50개, 로컬(고정 사용자)에서는 제한하지 않습니다.
   */
  maxPatternsPerUser: number | null
  /** 요청이 끝나면 프로세스가 멈출 수 있는 환경 (Vercel 등) */
  serverless: boolean
}

/**
 * 새 PDF를 읽을 수 있는지.
 * on: API 키가 있음. replay: 키는 없지만 남겨 둔 응답으로 읽을 수 있음(로컬 개발). off: 읽을 방법이 없음(키 없는 배포).
 */
export function pdfReading(e: Env): 'on' | 'replay' | 'off' {
  if (e.anthropicApiKey) return 'on'
  return e.serverless ? 'off' : 'replay'
}

export function env(): Env {
  const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'pglite://./data/pg'
  let pgliteDir: string | null = null
  if (databaseUrl.startsWith('pglite://')) {
    const rest = databaseUrl.slice('pglite://'.length)
    pgliteDir = rest === 'memory' ? 'memory' : fromRoot(rest)
  }
  const authMode = process.env.AUTH_MODE || 'local'
  if (authMode !== 'local' && authMode !== 'anonymous') throw new Error(`AUTH_MODE=${authMode} 는 지원하지 않습니다. local 또는 anonymous 를 쓰세요.`)
  const billingProvider = process.env.BILLING_PROVIDER || 'mock'
  if (billingProvider !== 'mock') throw new Error(`BILLING_PROVIDER=${billingProvider} 는 아직 지원하지 않습니다. 결제 제공자는 M4에서 정합니다.`)
  const serverless = !!process.env.VERCEL
  const storageDriver = process.env.STORAGE_DRIVER === 'db' || (process.env.STORAGE_DRIVER !== 'local' && !pgliteDir) ? 'db' : 'local'
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,
    databaseUrl,
    pgliteDir,
    storageDriver,
    storageDir: fromRoot(process.env.STORAGE_DIR || './data/uploads'),
    authMode,
    authSecret: process.env.AUTH_SECRET?.trim() || null,
    billingProvider: 'mock',
    recordingsDir: fromRoot(process.env.READER_RECORDINGS_DIR || './data/recordings'),
    readerModel: process.env.READER_MODEL || 'claude-opus-5-5',
    feedbackMaxRounds: Number(process.env.READER_MAX_FEEDBACK || 2),
    // Vercel 함수는 요청 본문이 4.5MB까지라, 배포에서는 그 아래로 받습니다.
    maxPdfBytes: positive(process.env.MAX_PDF_MB) ? positive(process.env.MAX_PDF_MB)! * 1024 * 1024 : serverless ? 4 * 1024 * 1024 : 20 * 1024 * 1024,
    maxConversionsPerDay: positive(process.env.MAX_CONVERSIONS_PER_DAY),
    maxConversionsPerUser: positive(process.env.MAX_CONVERSIONS_PER_USER),
    maxPatternsPerUser: positive(process.env.MAX_PATTERNS_PER_USER) ?? (authMode === 'anonymous' ? 50 : null),
    serverless,
  }
}
