import { describe, expect, it } from 'vitest'
import { expand } from '@stitch/engine'
import { garterScarf, practiceBall, practiceGranny, practiceHood, practiceScarf } from '@stitch/fixtures'
import { KNIT_SYMBOLS, type Expanded } from '@stitch/pattern-ir'
import { TUTORIALS, symbolsIn, tutorialFor } from '../src'

describe('도안에 나온 기호', () => {
  it('연습용 후드 워머에는 기호 10가지가 모두 나오고, 코 사전 순서로 돌려준다', () => {
    expect(symbolsIn(expand(practiceHood))).toEqual(['K', 'P', 'YO', 'K2TOG', 'SSK', 'SK2P', 'M1L', 'M1R', 'CO', 'BO'])
    expect(symbolsIn(expand(practiceHood))).toEqual([...KNIT_SYMBOLS])
  })

  it('가터 목도리에는 쓰인 기호만 나온다', () => {
    // 모든 단을 겉뜨기로 뜨면 안면 단은 겉에서 안뜨기로 보이고, 마지막 단은 코막음입니다.
    expect(symbolsIn(expand(garterScarf))).toEqual(['K', 'P', 'BO'])
  })

  it('칸이 없으면 빈 목록이고, 칸이 나온 순서와 상관없이 코 사전 순서다', () => {
    const empty: Expanded = { blocks: [], sections: [], totalRows: 0, totalStitches: 0, issues: [] }
    expect(symbolsIn(empty)).toEqual([])
    const e = expand(garterScarf)
    const rows = e.blocks.flatMap((b) => b.rows)
    const reversed: Expanded = { ...e, blocks: [{ name: 'r', W: e.blocks[0].W, rows: [...rows].reverse() }] }
    expect(symbolsIn(reversed)).toEqual(['K', 'P', 'BO'])
  })
})

describe('코바늘 도안에 필요한 뜨는 법', () => {
  it('공: 매직링, 짧은뜨기, 늘림, 줄임을 배우는 순서로 돌려준다', () => {
    expect(symbolsIn(expand(practiceBall))).toEqual(['RING', 'SC', 'INC', 'SC2'])
  })

  it('목도리: 시작 사슬, 한길긴뜨기, 기둥코 세우고 돌리기', () => {
    expect(symbolsIn(expand(practiceScarf))).toEqual(['CH', 'DC', 'TURN'])
  })

  it('그래니 스퀘어: 매직링, 사슬, 한길긴뜨기, 사슬 공간에 뜨기', () => {
    expect(symbolsIn(expand(practiceGranny))).toEqual(['RING', 'CH', 'DC', 'SPACE'])
  })

  it('조각의 tech가 코바늘 뜨는 법으로 이어진다: 늘림이 섞인 조각은 늘림', () => {
    const techs = new Set(expand(practiceBall).blocks.flatMap((b) => b.rows.flatMap((r) => r.segments.map((s) => s.tech))))
    expect([...techs].sort()).toEqual(['INC', 'RING', 'SC', 'SC2'])
    for (const t of techs) expect(tutorialFor(t), t).toBe(t)
    expect(tutorialFor('CH')).toBe('CH')
    expect(tutorialFor('ring')).toBe('RING')
  })
})

describe('조각의 tech에 맞는 뜨는 법', () => {
  it('기호 이름은 그 기호', () => {
    for (const s of KNIT_SYMBOLS) expect(tutorialFor(s)).toBe(s)
  })

  it('고무단과 무늬대로 뜨기는 겉뜨기, 단춧구멍은 바늘비우기', () => {
    expect(tutorialFor('RIB')).toBe('K')
    expect(tutorialFor('PAT')).toBe('K')
    expect(tutorialFor('BH')).toBe('YO')
  })

  it('대소문자와 앞뒤 공백은 가리지 않는다', () => {
    expect(tutorialFor('k2tog')).toBe('K2TOG')
    expect(tutorialFor(' m1l ')).toBe('M1L')
    expect(tutorialFor('bh')).toBe('YO')
  })

  it('뜨는 법이 없는 값은 null', () => {
    for (const t of ['', 'SK2', 'DC2', 'CL', 'KFB', 'constructor', 'toString', '__proto__', 'as_set']) expect(tutorialFor(t), t).toBeNull()
  })

  it('두 도안의 모든 조각이 뜨는 법으로 이어진다', () => {
    for (const p of [practiceHood, garterScarf]) {
      const e = expand(p)
      const techs = new Set(e.blocks.flatMap((b) => b.rows.flatMap((r) => r.segments.map((s) => s.tech))))
      expect(techs.size).toBeGreaterThan(0)
      const shown = symbolsIn(e)
      for (const t of techs) {
        const id = tutorialFor(t)
        expect(id, `${p.title} ${t}`).not.toBeNull()
        if (!id) continue
        expect(TUTORIALS[id]).toBeDefined()
        // 안내가 가리키는 뜨는 법은 그 도안의 기호 탭에도 있어야 합니다.
        expect(shown, `${p.title} ${t} → ${id}`).toContain(id)
      }
    }
  })
})
