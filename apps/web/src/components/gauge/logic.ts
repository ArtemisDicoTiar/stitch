/**
 * 게이지 화면이 쓰는 순수 계산. 숫자는 모두 보고 있는 도안의 IR에서 나옵니다.
 * 다시 계산 자체는 엔진(`regauge`)이 하고, 여기서는 화면에 보일 말과 표만 만듭니다.
 */
import type { GaugeComparison, RegaugeResult, RegaugeSection } from '@stitch/engine'
import type { GaugeSize, Pattern, Section } from '@stitch/pattern-ir'

/** 넣을 수 있는 범위. 서버가 받는 범위(`src/server/schemas.ts` 의 GaugeInput)와 같게 둡니다. */
export const LIMITS = {
  stitches: { min: 4, max: 60 },
  rows: { min: 4, max: 90 },
} as const

export type Limit = { min: number; max: number }

export const round1 = (v: number) => Math.round(v * 10) / 10

/** 화면에 보이는 숫자. 소수 첫째 자리까지만 씁니다. */
export const fmt = (v: number) => String(round1(v))

export const gaugeText = (g: GaugeSize) => `${fmt(g.stitches)}코 × ${fmt(g.rows)}단`

/** 입력 칸에는 숫자와 소수점 하나만 남깁니다. 쉼표는 소수점으로 봅니다. */
export function cleanInput(raw: string): string {
  const s = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '')
  const dot = s.indexOf('.')
  return dot < 0 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '')
}

export function parseNumber(raw: string): number | null {
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : null
}

const clamp = (v: number, lim: Limit) => Math.min(lim.max, Math.max(lim.min, v))

/** 계산에 쓰는 값. 칸이 비었거나 숫자가 아니면 도안 게이지를 쓰고, 범위를 넘으면 범위 끝으로 맞춥니다. */
export function effective(raw: string, fallback: number, lim: Limit): number {
  return round1(clamp(parseNumber(raw) ?? fallback, lim))
}

/** −/+ 단추. 1씩 움직이고, 칸이 비어 있으면 도안 게이지에서 시작합니다. */
export function bump(raw: string, fallback: number, lim: Limit, delta: number): string {
  return String(round1(clamp((parseNumber(raw) ?? fallback) + delta, lim)))
}

/**
 * 재기를 권할 도안인지 정합니다. 옷이나 모자처럼 크기가 맞아야 하는 도안에만 권합니다.
 * IR의 형태 템플릿(template)과 완성 크기(finished)만 봅니다.
 *  - hood, hat, tube: 머리나 몸에 끼우는 형태라 크기가 맞아야 합니다. 권합니다.
 *  - flat: 목도리나 담요 같은 평면 편물은 조금 크거나 작아도 쓰는 데 지장이 없습니다. 권하지 않습니다.
 *  - none 이거나 템플릿이 없음: 맞는 3D 틀이 없는 도안입니다(스웨터일 수도, 소품일 수도 있음).
 *    완성 가로와 세로가 둘 다 적혀 있을 때만 권합니다. 두 치수를 다 밝힌 도안은 그 크기로 나오는 것이 중요하다고 봅니다.
 *  - 게이지가 없는 도안은 비교할 기준이 없어 권하지 않습니다.
 */
export function isSizeSensitive(ir: Pattern): boolean {
  if (!ir.gauge) return false
  const template = ir.template ?? 'none'
  if (template === 'hood' || template === 'hat' || template === 'tube') return true
  if (template === 'flat') return false
  return ir.finished.width_cm !== undefined && ir.finished.height_cm !== undefined
}

/** 길이로 적힌 묶음(`until_cm`)이 있는 구간인지. 이런 구간은 길이가 그대로이고 예상 단수만 바뀝니다. */
export function lengthTargets(section: Section): number[] {
  const out: number[] = []
  for (const g of section.groups) if ('until_cm' in g.repeat) out.push(g.repeat.until_cm)
  return out
}

export type LengthProfile = {
  /** 게이지가 달라지면 세로 길이가 따라 달라지는 단의 수 */
  countedRows: number
  /** 그 단들이 들어 있는 구간 이름 */
  countedSections: string[]
  /** 길이를 재며 뜨는 구간 이름 */
  lengthSections: string[]
}

/**
 * 도안 숫자 그대로 떴을 때 세로가 달라지는 단을 셉니다.
 * 단 수로 적힌 묶음(`times`)은 단 게이지에 따라 길이가 달라집니다.
 * 길이로 적힌 묶음(`until_cm`, 기준 구간 `from`)은 기준 구간의 첫 단부터 재므로,
 * 그 사이에 있는 단 수 묶음까지 합쳐서 길이가 정해져 있습니다. 그래서 그 사이의 단은 세지 않습니다.
 */
export function lengthProfile(ir: Pattern): LengthProfile {
  const counted: { section: number; rows: number }[] = []
  const lengthIdx = new Set<number>()
  ir.sections.forEach((section, si) => {
    for (const g of section.groups) {
      if ('times' in g.repeat) {
        counted.push({ section: si, rows: g.repeat.times * g.rows.length })
        continue
      }
      const from = g.repeat.from
      const origin = ir.sections.findIndex((s) => s.id === from)
      const start = origin >= 0 && origin <= si ? origin : si
      for (const c of counted) if (c.section >= start) c.rows = 0
      lengthIdx.add(si)
    }
  })
  const names = new Set<string>()
  let countedRows = 0
  for (const c of counted) {
    if (c.rows <= 0) continue
    countedRows += c.rows
    names.add(ir.sections[c.section].name)
  }
  return { countedRows, countedSections: [...names], lengthSections: [...lengthIdx].map((i) => ir.sections[i].name) }
}

const list = (names: string[]) => (names.length > 0 && names.length <= 3 ? `(${names.join(', ')})` : '')

/** 세로 길이에 대한 안내. 단 게이지에서 다시 계산합니다. */
export function heightNote(ir: Pattern, mine: GaugeSize): string {
  const base = ir.gauge
  if (!base) return ''
  const p = lengthProfile(ir)
  if (p.countedRows === 0) return p.lengthSections.length > 0 ? '세로는 길이를 재며 뜨니 도안과 같게 나와요.' : ''
  // 같은 단 수를 떴을 때의 길이 차이(cm). 양수면 짧아집니다.
  const diff = p.countedRows * 10 * (1 / base.rows - 1 / mine.rows)
  if (Math.abs(diff) < 0.3) return '세로는 도안과 거의 같게 나와요.'
  // 한 구간 안에 단 수 묶음과 길이 묶음이 함께 있으면 이름을 두 번 부르지 않습니다.
  const onlyMeasured = p.lengthSections.filter((n) => !p.countedSections.includes(n))
  const measured =
    p.lengthSections.length === 0 ? '' : onlyMeasured.length > 0 ? ` 길이를 재며 뜨는 구간${list(onlyMeasured)}은 그대로예요.` : ' 길이를 재며 뜨는 부분은 그대로예요.'
  return `그대로 뜨면 세로는 단 수로 뜨는 구간${list(p.countedSections)}이 약 ${fmt(Math.abs(diff))}cm ${diff > 0 ? '짧아져요.' : '길어져요.'}${measured}`
}

/**
 * 바늘 조언에 넣을 굵기(mm). 방향이 먼저이고 숫자는 어림입니다.
 * 코 너비는 바늘 굵기에 거의 비례하므로, 도안 바늘 굵기에 차이(%)를 곱한 만큼을 0.5mm 단위로 옮깁니다.
 * 한 번에 두 단계(1mm)까지만 권합니다. 제안할 굵기가 너무 가늘어지면 방향만 알려 줍니다(null).
 */
export function needleSuggestion(toolMm: number, stitchPct: number, tighter: boolean): number | null {
  const steps = Math.min(2, Math.max(1, Math.round((toolMm * stitchPct) / 100 / 0.5)))
  const dir = tighter ? 1 : -1
  let mm = Math.round((toolMm + dir * steps * 0.5) * 2) / 2
  if (dir > 0 && mm <= toolMm) mm += 0.5
  if (dir < 0 && mm >= toolMm) mm -= 0.5
  return mm >= 1.5 ? mm : null
}

/** "…로 / …으로" 를 받침에 맞게 붙입니다. 한글이 아니면 "로"를 씁니다. */
export function withRo(word: string): string {
  const w = word.trim()
  const code = w.charCodeAt(w.length - 1)
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return `${w}로`
  const jong = (code - 0xac00) % 28
  return jong === 0 || jong === 8 ? `${w}로` : `${w}으로`
}

/**
 * 스와치 크기 어림. 가운데 10cm를 재려면 가장자리 여유가 있어야 하므로
 * 가로는 15cm쯤(코 게이지의 1.5배), 세로는 12cm쯤(단 게이지의 1.2배)을 5단위로 맞춰 권합니다.
 */
export function swatchSize(gauge: GaugeSize): { stitches: number; rows: number } {
  const to5 = (v: number) => Math.max(5, Math.round(v / 5) * 5)
  return { stitches: to5(gauge.stitches * 1.5), rows: to5(gauge.rows * 1.2) }
}

const START_LABEL: Record<Section['start']['kind'], string> = {
  cast_on: '코잡기',
  chain: '시작 사슬',
  ring: '시작 고리',
  continue: '시작할 때',
}

export const startLabel = (section: Section) => START_LABEL[section.start.kind]

export type TableRow = { key: string; label: string; note?: string; from: string; to: string; changed: boolean }
export type TableGroup = { id: string; name: string; rows: TableRow[] }

/** 구간마다 도안 값과 내 게이지에 맞춘 값을 나란히 놓은 표 */
export function buildTable(ir: Pattern, sections: RegaugeSection[]): TableGroup[] {
  return sections.map((s, i) => {
    const section = ir.sections[i]
    const prev = sections[i - 1]
    const rows: TableRow[] = []
    const count = (key: string, label: string, v: { from: number; to: number }) =>
      rows.push({ key: `${s.id}-${key}`, label, from: `${v.from}코`, to: `${v.to}코`, changed: v.from !== v.to })

    // 앞 구간에서 이어 뜨는 구간은 시작 코 수가 앞 구간의 끝과 같으니 다시 적지 않습니다.
    const sameAsPrev = section?.start.kind === 'continue' && prev && prev.end.from === s.start.from && prev.end.to === s.start.to
    if (!sameAsPrev) count('start', section ? startLabel(section) : START_LABEL.continue, s.start)
    // 코막음으로 끝나 남는 코가 없거나, 코 수가 시작과 같으면 끝 코 수는 적지 않습니다.
    const bound = s.end.from === 0 && s.end.to === 0
    const flat = s.end.from === s.start.from && s.end.to === s.start.to
    if (!bound && !flat) count('end', '마친 뒤', s.end)

    const targets = section ? lengthTargets(section) : []
    const byLength = targets.length > 0
    rows.push({
      key: `${s.id}-rows`,
      label: '단 수',
      note: byLength ? `길이는 그대로(${targets.map((cm) => `${fmt(cm)}cm`).join(', ')}까지 재며 떠요), 예상 단수만 바뀜` : undefined,
      from: `${byLength ? '약 ' : ''}${s.rows.from}단`,
      to: `${byLength ? '약 ' : ''}${s.rows.to}단`,
      changed: s.rows.from !== s.rows.to,
    })
    return { id: s.id, name: s.name, rows }
  })
}

/** 다시 계산했을 때 바뀌는 숫자가 하나라도 있는지 */
export function hasChanges(result: RegaugeResult): boolean {
  return result.sections.some((s) => s.start.from !== s.start.to || s.end.from !== s.end.to || s.rows.from !== s.rows.to)
}

/** 다시 계산이 무엇을 지키는지 한 문장으로. 무늬 반복 단위는 IR의 `multiple`에서 읽습니다. */
export function recalcNote(ir: Pattern): string {
  const multiples = ir.sections
    .filter((s) => s.multiple)
    .map((s) => `${s.name}: ${s.multiple!.of}코의 배수${s.multiple!.plus > 0 ? ` + ${s.multiple!.plus}코` : ''}`)
  const keep = multiples.length > 0 ? `무늬가 맞도록 코 수는 무늬 반복 단위(${multiples.join(', ')})에 맞추고, ` : ''
  const drawn = ir.template && ir.template !== 'none' ? '기호 도안과 3D도' : '기호 도안도'
  return `${keep}늘림과 줄임 횟수는 구간이 서로 이어지도록 다시 정해요. ${drawn} 이 숫자로 다시 그려집니다.`
}

export type Fit = 'recalc' | 'needle' | 'keep'

/**
 * 잰 게이지로 고를 수 있는 길. 맨 앞이 기본값입니다. 같은지는 엔진의 `compareGauge`가 정합니다(same: 코, sameRows: 단).
 *  - 코도 단도 도안과 같으면 도안 숫자 그대로(keep)뿐입니다. 다시 계산을 권하지 않습니다.
 *  - 코는 같고 단만 다르면 그대로가 기본이고, 원하면 단 수를 다시 계산할 수 있습니다.
 *  - 코가 다르면 다시 계산이 기본이고 바늘 바꾸기를 고를 수 있습니다.
 *    엔진의 검산을 통과하지 못하면 다시 계산은 내놓지 않고 바늘 바꾸기만 안내합니다.
 */
export function availableFits(cmp: GaugeComparison, result: RegaugeResult): Fit[] {
  const changes = hasChanges(result)
  const canRecalc = result.ok && changes
  if (cmp.same) return !cmp.sameRows && canRecalc ? ['keep', 'recalc'] : ['keep']
  if (canRecalc) return ['recalc', 'needle']
  // 코 수를 바꿔 계산하지 않는 도안(둥글게 뜨는 코바늘)은 그대로 뜨는 것이 기본입니다.
  if (result.fixedShape) return ['keep', 'needle']
  // 통과는 했지만 바뀌는 숫자가 없으면 그대로 뜨는 것과 같습니다.
  return result.ok ? ['keep', 'needle'] : ['needle']
}
