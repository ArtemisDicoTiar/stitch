import { describe, expect, it } from 'vitest'
import {
  AVATAR_CATALOG,
  AVATAR_PARTS,
  DEFAULT_AVATAR,
  avatarTier,
  isAvatar,
  isFreeAvatar,
  plusSelections,
  sanitizeAvatar,
  type Avatar,
} from '../src/avatar'

describe('마네킹 꾸미기 목록', () => {
  it('무료는 기본 얼굴형, 회색, 머리 없음, 안경 없음뿐이다', () => {
    const free = Object.fromEntries(AVATAR_PARTS.map((p) => [p, AVATAR_CATALOG[p].filter((o) => o.tier === 'free').map((o) => o.id)]))
    expect(free).toEqual({ face: ['default'], skin: ['gray'], hair: ['none'], glasses: ['none'] })
  })

  it('선택지가 설계와 같다', () => {
    const ids = Object.fromEntries(AVATAR_PARTS.map((p) => [p, AVATAR_CATALOG[p].map((o) => o.id)]))
    expect(ids).toEqual({
      face: ['default', 'round', 'slim', 'square'],
      skin: ['gray', 'tone1', 'tone2', 'tone3', 'tone4', 'tone5'],
      hair: ['none', 'bangs', 'bob', 'long', 'bun'],
      glasses: ['none', 'round', 'horn', 'half', 'sun'],
    })
    for (const p of AVATAR_PARTS) {
      for (const o of AVATAR_CATALOG[p]) {
        expect(o.label.length).toBeGreaterThan(0)
        expect(['free', 'plus']).toContain(o.tier)
      }
      expect(new Set(AVATAR_CATALOG[p].map((o) => o.id)).size).toBe(AVATAR_CATALOG[p].length)
    }
    // 피부 톤은 견본 색이 있다
    for (const o of AVATAR_CATALOG.skin) expect(o.swatch).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('기본 마네킹은 무료다', () => {
    expect(isFreeAvatar(DEFAULT_AVATAR)).toBe(true)
    expect(DEFAULT_AVATAR).toEqual({ face: 'default', skin: 'gray', hair: 'none', glasses: 'none' })
    expect(plusSelections(DEFAULT_AVATAR)).toEqual([])
  })

  it('플러스 항목이 하나라도 있으면 무료가 아니다', () => {
    for (const p of AVATAR_PARTS) {
      for (const o of AVATAR_CATALOG[p]) {
        const a = { ...DEFAULT_AVATAR, [p]: o.id } as Avatar
        expect(isFreeAvatar(a), `${p}=${o.id}`).toBe(o.tier === 'free')
        expect(avatarTier(p, o.id)).toBe(o.tier)
      }
    }
    const a: Avatar = { face: 'default', skin: 'tone2', hair: 'bangs', glasses: 'round' }
    expect(plusSelections(a).map((s) => s.label)).toEqual(['따뜻한 톤', '앞머리', '둥근테'])
  })
})

describe('sanitizeAvatar', () => {
  it('올바른 값은 그대로 둔다', () => {
    const a: Avatar = { face: 'slim', skin: 'tone4', hair: 'bun', glasses: 'sun' }
    expect(sanitizeAvatar(a)).toEqual(a)
    expect(isAvatar(a)).toBe(true)
  })

  it('목록에 없는 값은 받지 않고 기본값으로 바꾼다', () => {
    expect(sanitizeAvatar({ face: 'alien', skin: 'tone9', hair: 'mohawk', glasses: 'monocle' })).toEqual(DEFAULT_AVATAR)
    expect(sanitizeAvatar({ face: 'round', skin: 'blue', hair: 'bob', glasses: 7 })).toEqual({ face: 'round', skin: 'gray', hair: 'bob', glasses: 'none' })
    expect(isAvatar({ face: 'round', skin: 'blue', hair: 'bob', glasses: 'none' })).toBe(false)
    // 객체의 기본 속성 이름도 값으로 통하지 않는다
    expect(sanitizeAvatar({ face: 'constructor', skin: '__proto__', hair: 'toString', glasses: 'hasOwnProperty' })).toEqual(DEFAULT_AVATAR)
  })

  it('빠진 항목과 객체가 아닌 입력은 기본값이 된다', () => {
    expect(sanitizeAvatar({ hair: 'long' })).toEqual({ ...DEFAULT_AVATAR, hair: 'long' })
    for (const bad of [null, undefined, 'round', 42, [], true]) expect(sanitizeAvatar(bad)).toEqual(DEFAULT_AVATAR)
    expect(isAvatar(null)).toBe(false)
  })

  it('모르는 키는 버리고 새 객체를 돌려준다', () => {
    const input = { ...DEFAULT_AVATAR, hat: 'crown', admin: true }
    const out = sanitizeAvatar(input)
    expect(Object.keys(out).sort()).toEqual(['face', 'glasses', 'hair', 'skin'])
    expect(out).not.toBe(input)
    expect(sanitizeAvatar(DEFAULT_AVATAR)).not.toBe(DEFAULT_AVATAR)
  })
})
