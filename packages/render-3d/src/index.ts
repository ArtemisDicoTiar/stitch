/**
 * @stitch/render-3d: 3D 보기.
 * 마네킹이 쓴 편물에서 지금까지 뜬 부분만 실로 채우고 나머지는 비쳐 보이게 그립니다.
 *
 * - `./avatar`  마네킹 꾸미기의 선택지와 검증 (three.js 없음, `@stitch/render-3d/avatar`)
 * - `./garment` 형태 템플릿으로 편물 모양 만들기 (three.js 없음, `@stitch/render-3d/garment`)
 * - `createViewer` 캔버스에 그리기 (브라우저, WebGL)
 */
export * from './avatar'
export * from './garment'
export { MANNEQUIN } from './mannequin-dims'
export { RING_COLORS, VIEWER_DEFAULTS, WebGLUnavailableError, createViewer } from './viewer'
export type { PickPosition, Ring, ViewPreset, Viewer, ViewerOptions } from './viewer'
