/**
 * 로그인 없는 익명 세션 (AUTH_MODE=anonymous).
 * 브라우저마다 무작위 id를 하나 만들어 서명한 쿠키에 담습니다. 서명이 맞지 않으면 받지 않습니다.
 * proxy와 서버 코드가 함께 쓰므로 Web Crypto만 씁니다.
 */
export const SESSION_COOKIE = 'stitch_uid'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 400

const enc = new TextEncoder()

async function sign(id: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(id)))
  let bin = ''
  for (const b of mac) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 새 세션 쿠키 값 */
export async function issueSession(secret: string): Promise<string> {
  const id = crypto.randomUUID()
  return `${id}.${await sign(id, secret)}`
}

/** 쿠키 값이 우리가 서명한 것이면 그 id를, 아니면 null을 돌려줍니다. */
export async function verifySession(value: string | undefined, secret: string): Promise<string | null> {
  if (!value) return null
  const dot = value.indexOf('.')
  if (dot <= 0) return null
  const id = value.slice(0, dot)
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const expected = await sign(id, secret)
  const given = value.slice(dot + 1)
  if (expected.length !== given.length) return null
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i)
  return diff === 0 ? id : null
}
