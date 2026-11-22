/**
 * 마네킹 꾸미기의 선택지와 검증.
 * three.js나 DOM을 쓰지 않아서 서버에서도 그대로 불러 쓸 수 있습니다.
 * (`@stitch/render-3d/avatar`)
 */

export type AvatarFace = 'default' | 'round' | 'slim' | 'square'
export type AvatarSkin = 'gray' | 'tone1' | 'tone2' | 'tone3' | 'tone4' | 'tone5'
export type AvatarHair = 'none' | 'bangs' | 'bob' | 'long' | 'bun'
export type AvatarGlasses = 'none' | 'round' | 'horn' | 'half' | 'sun'

export type Avatar = {
  face: AvatarFace
  skin: AvatarSkin
  hair: AvatarHair
  glasses: AvatarGlasses
}

export type AvatarPart = keyof Avatar
export type AvatarTier = 'free' | 'plus'

export type AvatarOption<Id extends string = string> = {
  id: Id
  /** 화면에 보이는 이름 */
  label: string
  tier: AvatarTier
  /** 색으로 고르는 항목의 견본 색 */
  swatch?: string
}

export type AvatarCatalog = { [P in AvatarPart]: readonly AvatarOption<Avatar[P]>[] }

/** 화면에 보이는 묶음 이름 */
export const AVATAR_PART_LABELS: Record<AvatarPart, string> = {
  face: '얼굴형',
  skin: '피부 톤',
  hair: '머리',
  glasses: '안경',
}

/** 무료는 기본 얼굴형, 회색, 머리 없음, 안경 없음. 나머지는 플러스입니다. */
export const AVATAR_CATALOG: AvatarCatalog = {
  face: [
    { id: 'default', label: '기본', tier: 'free' },
    { id: 'round', label: '둥근형', tier: 'plus' },
    { id: 'slim', label: '갸름한형', tier: 'plus' },
    { id: 'square', label: '각진형', tier: 'plus' },
  ],
  skin: [
    { id: 'gray', label: '기본 회색', tier: 'free', swatch: '#8e959c' },
    { id: 'tone1', label: '밝은 톤', tier: 'plus', swatch: '#f3d9c4' },
    { id: 'tone2', label: '따뜻한 톤', tier: 'plus', swatch: '#e6bfa2' },
    { id: 'tone3', label: '중간 톤', tier: 'plus', swatch: '#c99772' },
    { id: 'tone4', label: '짙은 톤', tier: 'plus', swatch: '#a06a45' },
    { id: 'tone5', label: '깊은 톤', tier: 'plus', swatch: '#6b4428' },
  ],
  hair: [
    { id: 'none', label: '없음', tier: 'free' },
    { id: 'bangs', label: '앞머리', tier: 'plus' },
    { id: 'bob', label: '단발', tier: 'plus' },
    { id: 'long', label: '긴 머리', tier: 'plus' },
    { id: 'bun', label: '묶은 머리', tier: 'plus' },
  ],
  glasses: [
    { id: 'none', label: '없음', tier: 'free' },
    { id: 'round', label: '둥근테', tier: 'plus' },
    { id: 'horn', label: '뿔테', tier: 'plus' },
    { id: 'half', label: '반무테', tier: 'plus' },
    { id: 'sun', label: '선글라스', tier: 'plus' },
  ],
}

export const AVATAR_PARTS: readonly AvatarPart[] = ['face', 'skin', 'hair', 'glasses']

export const DEFAULT_AVATAR: Avatar = { face: 'default', skin: 'gray', hair: 'none', glasses: 'none' }

function optionOf<P extends AvatarPart>(part: P, id: unknown): AvatarOption<Avatar[P]> | undefined {
  if (typeof id !== 'string') return undefined
  return AVATAR_CATALOG[part].find((o) => o.id === id)
}

/** 선택한 항목의 등급. 목록에 없는 값이면 undefined */
export function avatarTier(part: AvatarPart, id: string): AvatarTier | undefined {
  return optionOf(part, id)?.tier
}

/** 플러스 항목을 하나도 쓰지 않았는지 */
export function isFreeAvatar(avatar: Avatar): boolean {
  return AVATAR_PARTS.every((part) => optionOf(part, avatar[part])?.tier === 'free')
}

/** 쓰고 있는 플러스 항목. "플러스 항목 n개를 미리 보는 중" 표시에 씁니다. */
export function plusSelections(avatar: Avatar): { part: AvatarPart; id: string; label: string }[] {
  const out: { part: AvatarPart; id: string; label: string }[] = []
  for (const part of AVATAR_PARTS) {
    const o = optionOf(part, avatar[part])
    if (o && o.tier === 'plus') out.push({ part, id: o.id, label: o.label })
  }
  return out
}

/**
 * 저장된 값이나 요청 본문처럼 믿을 수 없는 입력을 Avatar로 바꿉니다.
 * 목록에 없는 값과 빠진 항목은 기본값이 됩니다. 모르는 키는 버립니다.
 */
export function sanitizeAvatar(input: unknown): Avatar {
  const src = input !== null && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const pick = <P extends AvatarPart>(part: P): Avatar[P] => optionOf(part, src[part])?.id ?? DEFAULT_AVATAR[part]
  return { face: pick('face'), skin: pick('skin'), hair: pick('hair'), glasses: pick('glasses') }
}

/** 입력이 고쳐 쓸 것 없이 그대로 올바른 Avatar인지 */
export function isAvatar(input: unknown): input is Avatar {
  if (input === null || typeof input !== 'object') return false
  const src = input as Record<string, unknown>
  return AVATAR_PARTS.every((part) => optionOf(part, src[part]) !== undefined)
}
