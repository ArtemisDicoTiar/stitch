import { mkdirSync } from 'node:fs'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { env } from '../env'
import { MIGRATIONS } from './migrations'
import * as schema from './schema'

/** 드라이버와 상관없이 같은 질의 API를 씁니다 (로컬: PGlite, 배포: Postgres). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** 마이그레이션과 종료에 쓰는 최소한의 원시 연결 */
type Raw = {
  exec(sql: string): Promise<void>
  names(): Promise<string[]>
  record(name: string): Promise<void>
  close(): Promise<void>
}

type Holder = { db: Db; raw: Raw }

// 개발 서버가 코드를 다시 읽어도 데이터베이스는 한 번만 엽니다.
const g = globalThis as unknown as { __stitchDb?: Promise<Holder> }

async function migrate(raw: Raw) {
  await raw.exec('CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const done = new Set(await raw.names())
  for (const m of MIGRATIONS) {
    if (done.has(m.name)) continue
    await raw.exec(m.sql)
    await raw.record(m.name)
  }
}

async function openPglite(dir: string): Promise<Holder> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  let client: InstanceType<typeof PGlite>
  if (dir === 'memory') client = new PGlite()
  else {
    mkdirSync(dir, { recursive: true })
    client = new PGlite(dir)
  }
  await client.waitReady
  const raw: Raw = {
    exec: async (sql) => void (await client.exec(sql)),
    names: async () => (await client.query<{ name: string }>('SELECT name FROM _migrations')).rows.map((r) => r.name),
    record: async (name) => void (await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name])),
    close: () => client.close(),
  }
  await migrate(raw)
  return { raw, db: drizzle({ client, schema }) as unknown as Db }
}

async function openPostgres(url: string): Promise<Holder> {
  const { default: postgres } = await import('postgres')
  const { drizzle } = await import('drizzle-orm/postgres-js')
  // 연결 풀(pgbouncer) 뒤에서도 돌도록 prepare를 끕니다. 서버리스에서는 연결을 적게 씁니다.
  const client = postgres(url, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 15, onnotice: () => {} })
  type Runner = { unsafe(query: string, args?: string[]): PromiseLike<unknown> }
  const rawOf = (c: Runner): Raw => ({
    exec: async (sql) => void (await c.unsafe(sql)),
    names: async () => ((await c.unsafe('SELECT name FROM _migrations')) as { name: string }[]).map((r) => r.name),
    record: async (name) => void (await c.unsafe('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name])),
    close: () => client.end({ timeout: 5 }),
  })
  // 함수 인스턴스 여러 개가 동시에 처음 뜨면 같은 마이그레이션을 겹쳐 돌릴 수 있습니다.
  // 한 트랜잭션 안에서 잠금을 잡고 돌려서, 뒤에 온 쪽은 기다렸다가 "이미 됨"을 봅니다.
  // (트랜잭션 잠금이라 연결 풀 뒤에서도 안전하고, 중간에 실패하면 전부 되돌아갑니다.)
  await client.begin(async (tx) => {
    await tx.unsafe('SELECT pg_advisory_xact_lock(727113701)')
    await migrate(rawOf(tx))
  })
  return { raw: rawOf(client), db: drizzle({ client, schema }) as unknown as Db }
}

async function open(): Promise<Holder> {
  const e = env()
  if (e.pgliteDir) return openPglite(e.pgliteDir)
  if (/^postgres(ql)?:\/\//.test(e.databaseUrl)) return openPostgres(e.databaseUrl)
  throw new Error('DATABASE_URL 은 pglite://<폴더> 또는 postgres://... 이어야 합니다.')
}

export async function getDb(): Promise<Db> {
  if (!g.__stitchDb) {
    g.__stitchDb = open().catch((err) => {
      g.__stitchDb = undefined
      throw err
    })
  }
  return (await g.__stitchDb).db
}

/** 테스트에서 데이터베이스를 닫고 비웁니다. */
export async function closeDb() {
  const h = g.__stitchDb
  g.__stitchDb = undefined
  if (h) await (await h).raw.close()
}

export { schema }
