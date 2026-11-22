import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db/client'
import { env } from './env'

/**
 * 올린 PDF를 두는 비공개 저장소.
 * 로컬은 폴더, 파일 시스템을 쓸 수 없는 배포 환경은 데이터베이스에 둡니다.
 * 어느 쪽이든 바깥에 주소가 생기지 않고, 서버가 소유자를 확인한 뒤에만 내려보냅니다.
 */
export interface Storage {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  delete(key: string): Promise<void>
}

class LocalStorage implements Storage {
  constructor(private root: string) {}

  private path(key: string): string {
    const p = normalize(join(this.root, key))
    if (!p.startsWith(normalize(this.root) + sep)) throw new Error('저장소 밖의 경로입니다.')
    return p
  }
  async put(key: string, bytes: Uint8Array) {
    const p = this.path(key)
    await mkdir(dirname(p), { recursive: true })
    await writeFile(p, bytes)
  }
  async get(key: string) {
    try {
      return new Uint8Array(await readFile(this.path(key)))
    } catch {
      return null
    }
  }
  async delete(key: string) {
    await rm(this.path(key), { force: true })
  }
}

class DbStorage implements Storage {
  async put(key: string, bytes: Uint8Array) {
    const db = await getDb()
    const value = { key, bytes, size: bytes.length }
    await db.insert(schema.files).values(value).onConflictDoUpdate({ target: schema.files.key, set: { bytes, size: bytes.length } })
  }
  async get(key: string) {
    const db = await getDb()
    const [row] = await db.select({ bytes: schema.files.bytes }).from(schema.files).where(eq(schema.files.key, key)).limit(1)
    return row ? new Uint8Array(row.bytes) : null
  }
  async delete(key: string) {
    const db = await getDb()
    await db.delete(schema.files).where(eq(schema.files.key, key))
  }
}

export function storage(): Storage {
  const e = env()
  return e.storageDriver === 'db' ? new DbStorage() : new LocalStorage(e.storageDir)
}
