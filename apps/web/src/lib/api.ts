/** 브라우저에서 API를 부르는 얇은 도우미 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(path, {
    ...rest,
    cache: 'no-store',
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; detail?: unknown } } | null)?.error
    throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? '요청을 처리하지 못했습니다.', e?.detail)
  }
  return data as T
}
