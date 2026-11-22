import { currentUser } from '@/server/auth'
import { getAvatar, saveAvatar } from '@/server/avatar'
import { api } from '@/server/http'

export const dynamic = 'force-dynamic'

export const GET = api(async () => getAvatar((await currentUser()).id))

/** 저장은 플러스만 됩니다. 서버가 플러스 여부를 확인합니다. */
export const PUT = api(async (req: Request) => saveAvatar((await currentUser()).id, await req.json()))
