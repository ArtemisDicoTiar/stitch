/**
 * @stitch/render-chart: 기호 도안.
 * 엔진이 펼친 결과(Expanded)를 격자로 그립니다. 한 칸은 1코 × 1단이고 겉면에서 본 모양입니다.
 *
 * - SYMBOLS, symbolSvg: 기호(대바늘 10가지, 코바늘 9가지)의 모양과 범례용 SVG
 * - chartLayout: 자리 계산 (칸 좌표, 눌린 칸 찾기)
 * - renderChartSvg: 도안 전체를 SVG 문자열로 (Node에서도 돕니다)
 * - mountChart: 화면에 올리고 누르기, 키보드, 확대와 축소 붙이기
 */
export { SYMBOLS, SYMBOL_ORDER, SYMBOL_INK, SYMBOL_STROKE, symbolOrder, symbolSvg, symbolGlyph } from './symbols'
export type { Pt, SymbolDef, SymbolPrim, SymbolSvgOptions } from './symbols'

export { chartLayout, resolveChartOptions, startsRight, DEFAULT_COLORS, DEFAULT_LABELS, DEFAULT_FONT } from './layout'
export type {
  BlockLayout,
  ChartColors,
  ChartHit,
  ChartLabels,
  ChartLayout,
  ChartMetrics,
  ChartOptions,
  ChartSlot,
  EstimatedSpan,
  Rect,
  ResolvedChartOptions,
  RowLabel,
  SectionSpan,
} from './layout'

export { renderChartSvg, renderLayoutSvg } from './render'
export { hasPolarPieces, polarLayout, renderPolarSvg } from './polar'
export type { PolarColors, PolarLayout, PolarOptions, PolarPiece } from './polar'

export { cellOutlineSvg, moveCursor, progressOverlaySvg, ringsOverlaySvg, selectionCell, workingPosition } from './overlay'
export type { ChartRing, ChartSelection, CursorMove } from './overlay'

export { mountChart, DEFAULT_UI } from './mount'
export type { ChartCellInfo, ChartHandle, ChartPick, ChartUiLabels, MountChartOptions, ZoomPreset } from './mount'
