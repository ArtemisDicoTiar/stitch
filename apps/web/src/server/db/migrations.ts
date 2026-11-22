/**
 * 데이터베이스 마이그레이션. 순서대로 한 번씩 적용합니다.
 * 내장형 Postgres(PGlite)와 배포용 Postgres가 같은 SQL을 씁니다.
 * 여러 서버가 동시에 시작해도 안전하도록 모든 문장은 다시 실행해도 되는 형태(IF NOT EXISTS)로 씁니다.
 */
export const MIGRATIONS: { name: string; sql: string }[] = [
  {
    name: '0000_init.sql',
    sql: `
-- 사용자 데이터 여덟 개 테이블. 도안에 딸린 것은 모두 소유자 한 명에게만 보입니다.
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  login text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS patterns (
  id text PRIMARY KEY,
  owner_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  craft text NOT NULL DEFAULT 'knit',
  title text NOT NULL,
  -- reading: 읽는 중, needs_review: 확인 필요, ready: 준비됨, failed: 읽지 못함
  status text NOT NULL DEFAULT 'reading',
  source text NOT NULL DEFAULT 'upload',
  pdf_key text,
  pdf_name text,
  pdf_sha256 text,
  current_version_id text,
  -- unset: 아직 고르지 않음, as_is: 도안 숫자 그대로, recalc: 내 게이지로 다시 계산, remeasure: 바늘을 바꿔 다시 재기
  gauge_mode text NOT NULL DEFAULT 'unset',
  my_gauge jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patterns_owner_idx ON patterns(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS patterns_sha_idx ON patterns(owner_id, pdf_sha256);

CREATE TABLE IF NOT EXISTS pattern_versions (
  id text PRIMARY KEY,
  pattern_id text NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  -- original: 원본, gauge: 게이지 파생
  kind text NOT NULL,
  ir jsonb NOT NULL,
  gauge jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pattern_versions_pattern_idx ON pattern_versions(pattern_id, created_at);

CREATE TABLE IF NOT EXISTS conversion_jobs (
  id text PRIMARY KEY,
  pattern_id text NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  -- upload, extract, structure, verify, feedback, review, done
  stage text NOT NULL DEFAULT 'upload',
  -- queued, running, needs_review, done, failed
  status text NOT NULL DEFAULT 'queued',
  verification jsonb,
  pages jsonb,
  llm_calls integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  feedback_rounds integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversion_jobs_pattern_idx ON conversion_jobs(pattern_id, created_at DESC);

CREATE TABLE IF NOT EXISTS progress_entries (
  id text PRIMARY KEY,
  pattern_id text NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  row integer NOT NULL,
  stitch integer NOT NULL DEFAULT 0,
  finishing_step integer,
  memo text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS progress_entries_pattern_idx ON progress_entries(pattern_id, at);

CREATE TABLE IF NOT EXISTS markers (
  id text PRIMARY KEY,
  pattern_id text NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  row integer NOT NULL,
  x integer NOT NULL,
  color text NOT NULL,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS markers_pattern_idx ON markers(pattern_id);

CREATE TABLE IF NOT EXISTS avatars (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  provider text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements(user_id);
`,
  },
  {
    name: '0001_files.sql',
    sql: `
-- 올린 PDF를 데이터베이스에 두는 저장소 (STORAGE_DRIVER=db). 소유자 확인은 앱이 합니다.
CREATE TABLE IF NOT EXISTS files (
  key text PRIMARY KEY,
  bytes bytea NOT NULL,
  size integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
`,
  },
  {
    name: '0002_usage.sql',
    sql: `
-- 변환(LLM 호출)을 시작한 기록. 도안을 지워도 남아서 상한을 셀 때 씁니다.
CREATE TABLE IF NOT EXISTS usage_events (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  kind text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_at_idx ON usage_events(kind, at);
CREATE INDEX IF NOT EXISTS usage_events_user_idx ON usage_events(user_id, kind);
`,
  },
  {
    name: '0003_job_attempts.sql',
    sql: `
-- 변환을 몇 번 시작했는지. 중간에 멈춘 작업을 끝없이 다시 돌리지 않으려고 셉니다.
ALTER TABLE conversion_jobs ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
`,
  },
]
