/**
 * 3D 보기. 캔버스 하나에 편물과 마네킹을 그립니다. 브라우저에서만 부릅니다.
 *
 * 편물은 코마다 사각형 하나인 합친 메쉬 하나이고, 사각형이 뜬 순서로 놓여 있어서
 * 진행 위치는 그리는 범위만 바꿉니다: 앞쪽은 실로 채우고 뒤쪽은 비쳐 보이게.
 * 진행 위치, 단수링, 마네킹을 바꿔도 편물의 모양은 다시 만들지 않습니다.
 *
 * 캔버스의 크기는 CSS로 정해 주세요 (예: width: 100%; height: 100%).
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Expanded, GaugeSize, Progress, Template } from '@stitch/pattern-ir'
import { DEFAULT_AVATAR, sanitizeAvatar, type Avatar } from './avatar'
import { buildGarment, knittedCount, rowIndexOf, stitchAt, stitchIndexAtColumn, type Garment, type GarmentOptions } from './garment'
import { createMannequin } from './mannequin'
import { MANNEQUIN } from './mannequin-dims'
import { createKnitAtlas, createLabelTexture, parseColor, shade, toHex } from './textures'

/** WebGL을 쓸 수 없을 때. 앱은 이 오류를 받아 기호 도안만 보여 줍니다. */
export class WebGLUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('이 기기에서는 3D 보기를 쓸 수 없습니다 (WebGL을 사용할 수 없음).')
    this.name = 'WebGLUnavailableError'
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

/** 단수링. x는 그 단에서 칸의 기둥 위치(ChartCell.x)입니다. */
export type Ring = { id: string; row: number; x: number; color: string; name: string }

export type ViewPreset = 'front' | 'side' | 'back' | 'top'

/** 3D에서 누른 코. stitch는 그 코까지 떴을 때 그 단에서 뜬 코 수입니다. */
export type PickPosition = { row: number; stitch: number; x: number }

export type ViewerOptions = {
  expanded: Expanded
  template: Template
  /** 10cm 기준 코와 단 (도안의 gauge). cm 크기를 정합니다. Expanded에는 게이지가 없어서 따로 받고, 없으면 기본 게이지(18코 24단)로 그립니다. */
  gauge?: GaugeSize | null
  /** 템플릿 옵션 (게이지는 gauge가 먼저) */
  garment?: GarmentOptions
  /** 진행 위치. null이면 다 뜬 모습 */
  progress?: Progress | null
  rings?: readonly Ring[]
  avatar?: Avatar
  /** 실 색 */
  yarnColor?: string
  /** 바탕색. null이나 'transparent'면 투명 */
  background?: string | null
  /** 돌려 보기, 확대, 코 누르기. 기본 true */
  interactive?: boolean
  autoRotate?: boolean
  /** 움직임 줄이기. 주지 않으면 기기 설정을 따릅니다. */
  reducedMotion?: boolean
  /** 3D에서 코를 눌렀을 때 */
  onPick?: (pos: PickPosition) => void
  /** 첫 화면을 그린 뒤 */
  onReady?: () => void
}

export type Viewer = {
  /**
   * 도안이나 템플릿을 바꿉니다. 편물의 모양을 다시 만드는 것은 이 함수뿐입니다.
   * Expanded에는 게이지가 없으니, 게이지가 바뀌었으면(다시 맞춘 도안 등) options.gauge로 꼭 넘겨 주세요.
   * 주지 않은 옵션은 앞서 쓰던 값을 이어 씁니다.
   */
  setPattern(expanded: Expanded, template: Template, options?: GarmentOptions): void
  setProgress(progress: Progress | null): void
  setRings(rings: readonly Ring[]): void
  setAvatar(avatar: Avatar): void
  /** false면 편물을 감춥니다 ("벗은 모습"). */
  setGarmentVisible(visible: boolean): void
  setMannequinVisible(visible: boolean): void
  setAutoRotate(on: boolean): void
  setView(preset: ViewPreset): void
  /** 1보다 크면 가까이, 작으면 멀리 */
  zoomBy(factor: number): void
  resetView(): void
  resize(): void
  /** 지금 화면의 PNG data URL */
  snapshot(): string
  dispose(): void
  /** 지금 그리고 있는 편물 */
  readonly garment: Garment
}

/** 단수링의 색 순서 */
export const RING_COLORS = ['#e8590c', '#1f6fd1', '#2f9e44', '#c2255c', '#f0b400', '#7048e8'] as const

export const VIEWER_DEFAULTS = {
  /** 코코아 바탕 */
  background: '#2a201b',
  yarnColor: '#b0937f',
  /** 단수링과 지금 위치의 주황 */
  accent: '#e8590c',
} as const

const NOW_COLOR = 0xff7a2e
const GHOST_COLOR = 0xf3e6d8
const FOV = 32
const VIEW_DIRS: Record<ViewPreset | 'home' | 'homeFlat', [number, number, number]> = {
  home: [64, 12, 92],
  homeFlat: [0.22, 0.06, 1],
  front: [0, 0.1, 1],
  side: [1, 0.1, 0],
  back: [0, 0.1, -1],
  top: [0, 1, 0.04],
}

type Anchor = { object: THREE.Object3D; normal: THREE.Vector3 }
type Label = { sprite: THREE.Sprite; width: number; height: number; anchor: Anchor; occluded: boolean; checked: boolean }

/**
 * 캔버스에 3D 보기를 만듭니다.
 *
 * - WebGL을 쓸 수 없으면 `WebGLUnavailableError`를 던집니다. 앱은 기호 도안만 보여 주면 됩니다.
 * - 그릴 수 없는 템플릿이면 `UnsupportedTemplateError`를 던집니다. `supportsTemplate`으로 먼저 확인하세요.
 * - 다 쓰면 `dispose()`를 부르세요. 같은 캔버스에 다시 만들 수 있습니다.
 */
export function createViewer(canvas: HTMLCanvasElement, opts: ViewerOptions): Viewer {
  /** 지금 쓰는 템플릿 옵션. setPattern에 준 값만 덮어쓰고 나머지는 이어 씁니다. */
  let garmentOptions: GarmentOptions = { ...opts.garment, gauge: opts.gauge ?? opts.garment?.gauge ?? null }
  // 모양을 먼저 만듭니다. 그릴 수 없는 템플릿이면 WebGL을 만들기 전에 오류가 납니다.
  let garment = buildGarment(opts.expanded, opts.template, garmentOptions)

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  } catch (err) {
    throw new WebGLUnavailableError(err)
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  const bg = opts.background === undefined ? VIEWER_DEFAULTS.background : opts.background
  if (bg === null || bg === 'transparent') renderer.setClearColor(0x000000, 0)
  else renderer.setClearColor(toHex(parseColor(bg, VIEWER_DEFAULTS.background)), 1)

  const interactive = opts.interactive !== false
  const reduced = opts.reducedMotion ?? (typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)').matches : false)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1000)
  const controls = new OrbitControls(camera, interactive ? canvas : null)
  controls.enableDamping = !reduced
  controls.autoRotate = opts.autoRotate === true
  controls.autoRotateSpeed = 1.6

  scene.add(new THREE.HemisphereLight(0xfff4e8, 0x3a2d26, 1.4))
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(40, 70, 60)
  const rim = new THREE.DirectionalLight(0xffe0c8, 1.1)
  rim.position.set(-50, 30, -60)
  scene.add(key, rim)

  // ---- 편물 ----
  const yarn = parseColor(opts.yarnColor, VIEWER_DEFAULTS.yarnColor)
  const atlas = createKnitAtlas(yarn, renderer.capabilities.getMaxAnisotropy())
  const frontMat = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.92, side: THREE.FrontSide })
  const backMat = new THREE.MeshStandardMaterial({ color: toHex(shade(yarn, 0.6)), roughness: 0.95, side: THREE.BackSide })
  const ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_COLOR, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide })
  const rowMat = new THREE.MeshBasicMaterial({
    color: NOW_COLOR,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
  const pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

  const garmentGroup = new THREE.Group()
  scene.add(garmentGroup)
  let knitGeo = new THREE.BufferGeometry()
  let ghostGeo = new THREE.BufferGeometry()
  let rowGeo = new THREE.BufferGeometry()
  let pickGeo = new THREE.BufferGeometry()
  const frontMesh = new THREE.Mesh(knitGeo, frontMat)
  const backMesh = new THREE.Mesh(knitGeo, backMat)
  const ghostMesh = new THREE.Mesh(ghostGeo, ghostMat)
  ghostMesh.renderOrder = 2
  const rowMesh = new THREE.Mesh(rowGeo, rowMat)
  rowMesh.renderOrder = 3
  /** 코 누르기에만 쓰는 메쉬. 뜨지 않은 부분도 누를 수 있어야 해서 전체를 담습니다. 장면에는 넣지 않습니다. */
  const pickMesh = new THREE.Mesh(pickGeo, pickMat)
  garmentGroup.add(frontMesh, backMesh, ghostMesh, rowMesh)

  // ---- 지금 위치와 단수링 ----
  const nowMat = new THREE.MeshBasicMaterial({ color: NOW_COLOR })
  const nowDotGeo = new THREE.SphereGeometry(0.42, 20, 14)
  const nowRingGeo = new THREE.TorusGeometry(0.75, 0.08, 8, 32)
  const nowRing = new THREE.Mesh(nowRingGeo, nowMat)
  const nowGroup = new THREE.Group()
  nowGroup.add(new THREE.Mesh(nowDotGeo, nowMat), nowRing)
  nowGroup.visible = false
  const nowNormal = new THREE.Vector3(0, 0, 1)
  const ringGroup = new THREE.Group()
  garmentGroup.add(nowGroup, ringGroup)
  const ringGeo = new THREE.TorusGeometry(0.6, 0.15, 12, 32)
  const claspGeo = new THREE.SphereGeometry(0.24, 12, 10)
  let ringMats: THREE.Material[] = []

  const labelGroup = new THREE.Group()
  scene.add(labelGroup)
  let ringLabels: Label[] = []
  let nowLabel: Label | null = null
  /** 카메라나 장면이 바뀌어서 이름표가 가려졌는지 다시 확인해야 하는지 */
  let labelsStale = true

  // ---- 마네킹 ----
  let avatar = sanitizeAvatar(opts.avatar ?? DEFAULT_AVATAR)
  const mannequin = createMannequin(avatar)
  scene.add(mannequin.group)

  // ---- 상태 ----
  let progress: Progress | null = opts.progress === undefined ? null : opts.progress
  let rings: Ring[] = [...(opts.rings ?? [])]
  let garmentVisible = true
  let mannequinVisible = true
  let disposed = false
  let needsRender = true
  let onScreen = true
  let frame = 0
  let homeDistance = 100
  const homeTarget = new THREE.Vector3()
  let width = 1
  let height = 1

  const _c = new THREE.Vector3()
  const _n = new THREE.Vector3()
  const _u = new THREE.Vector3()
  const _r = new THREE.Vector3()
  const _m = new THREE.Matrix4()

  /** 코 하나의 크기에 맞춘 표시물의 배율 */
  const markScale = () => THREE.MathUtils.clamp((10 / garment.gauge.stitches) / 0.588, 0.7, 1.7)

  /** 표시물을 코 위에 놓습니다: 겉면에서 lift만큼 띄우고, 단 아래쪽으로 drop만큼 내립니다. */
  function placeOnStitch(obj: THREE.Object3D, q: number, lift: number, drop: number, normalOut: THREE.Vector3) {
    _c.fromArray(garment.centers, q * 3)
    _n.fromArray(garment.stitchNormals, q * 3)
    _u.fromArray(garment.stitchUps, q * 3)
    _r.crossVectors(_u, _n).normalize()
    obj.position.copy(_c).addScaledVector(_n, lift).addScaledVector(_u, -drop)
    _m.makeBasis(_r, _u, _n)
    obj.quaternion.setFromRotationMatrix(_m)
    normalOut.copy(_n)
  }

  function makeLabel(text: string, style: { background: string; color: string; border: string }, anchor: Anchor): Label {
    const { texture, width: w, height: h } = createLabelTexture(text, style)
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false })
    const sprite = new THREE.Sprite(material)
    sprite.center.set(0.5, -0.55)
    sprite.renderOrder = 10
    labelGroup.add(sprite)
    return { sprite, width: w, height: h, anchor, occluded: false, checked: false }
  }
  function dropLabel(label: Label) {
    labelGroup.remove(label.sprite)
    label.sprite.material.map?.dispose()
    label.sprite.material.dispose()
  }

  // ---- 편물 만들기 (setPattern만 부릅니다) ----
  function installGarment() {
    for (const g of [knitGeo, ghostGeo, rowGeo, pickGeo]) g.dispose()
    const position = new THREE.BufferAttribute(garment.positions, 3)
    const normal = new THREE.BufferAttribute(garment.normals, 3)
    const uv = new THREE.BufferAttribute(garment.uvs, 2)
    const index = new THREE.BufferAttribute(garment.indices, 1)
    const make = () => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', position)
      g.setAttribute('normal', normal)
      g.setAttribute('uv', uv)
      g.setIndex(index)
      return g
    }
    knitGeo = make()
    ghostGeo = make()
    rowGeo = make()
    pickGeo = make()
    knitGeo.computeBoundingSphere()
    ghostGeo.boundingSphere = rowGeo.boundingSphere = pickGeo.boundingSphere = knitGeo.boundingSphere
    frontMesh.geometry = backMesh.geometry = knitGeo
    ghostMesh.geometry = ghostGeo
    rowMesh.geometry = rowGeo
    pickMesh.geometry = pickGeo

    const fit = garment.mannequin
    if (fit) {
      mannequin.group.position.set(fit.origin[0], fit.origin[1], fit.origin[2])
      mannequin.group.scale.setScalar(fit.scale)
    }
    const k = markScale()
    nowGroup.scale.setScalar(k)
    applyVisibility()
    applyProgress()
    applyRings()
    frameScene()
  }

  function applyVisibility() {
    garmentGroup.visible = garmentVisible
    labelGroup.visible = garmentVisible
    mannequin.group.visible = mannequinVisible && garment.mannequin !== null
    mannequin.setCovered(garmentVisible)
    labelsStale = true
    needsRender = true
  }

  // ---- 진행 위치: 그리는 범위만 바꿉니다 ----
  function applyProgress() {
    const total = garment.stitchCount
    if (progress === null) {
      knitGeo.setDrawRange(0, total * 6)
      ghostGeo.setDrawRange(0, 0)
      rowGeo.setDrawRange(0, 0)
      nowGroup.visible = false
    } else {
      const done = knittedCount(garment, progress)
      knitGeo.setDrawRange(0, done * 6)
      ghostGeo.setDrawRange(done * 6, (total - done) * 6)
      if (done < total) {
        // 다음에 뜰 코가 있는 단을 밝히고, 그 코에 표시를 둡니다.
        const row = garment.rows[rowIndexOf(garment, garment.stitchRow[done])]
        rowGeo.setDrawRange(row.first * 6, row.count * 6)
        placeOnStitch(nowGroup, done, 0.35 * markScale(), 0, nowNormal)
        nowGroup.visible = true
        nowLabel ??= makeLabel('지금 여기', { background: VIEWER_DEFAULTS.accent, color: '#ffffff', border: '#ffffff' }, { object: nowGroup, normal: nowNormal })
        nowLabel.checked = false
      } else {
        rowGeo.setDrawRange(0, 0)
        nowGroup.visible = false
      }
    }
    sizeLabels()
    labelsStale = true
    needsRender = true
  }

  // ---- 단수링 ----
  function applyRings() {
    for (const l of ringLabels) dropLabel(l)
    ringLabels = []
    for (const m of ringMats) m.dispose()
    ringMats = []
    ringGroup.clear()
    const k = markScale()
    for (const ring of rings) {
      if (!ring || !(ring.row >= 1)) continue
      const q = stitchIndexAtColumn(garment, ring.row, ring.x)
      if (q < 0) continue
      const color = toHex(parseColor(ring.color, RING_COLORS[0]))
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 })
      ringMats.push(mat)
      const g = new THREE.Group()
      const loop = new THREE.Mesh(ringGeo, mat)
      loop.scale.set(1, 1.45, 1)
      const clasp = new THREE.Mesh(claspGeo, mat)
      clasp.position.set(0, -0.86, 0.05)
      g.add(loop, clasp)
      g.scale.setScalar(k)
      const normal = new THREE.Vector3()
      placeOnStitch(g, q, 0.32 * k, 0.5 * k, normal)
      ringGroup.add(g)
      const css = `#${color.toString(16).padStart(6, '0')}`
      ringLabels.push(makeLabel(ring.name?.trim() || `${ring.row}단`, { background: '#fffaf4', color: '#241d19', border: css }, { object: g, normal }))
    }
    sizeLabels()
    labelsStale = true
    needsRender = true
  }

  // ---- 이름표 ----
  function sizeLabels() {
    // 거리와 상관없이 화면에서 같은 크기(px)로 보이게
    const unit = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, height)
    for (const l of nowLabel ? [...ringLabels, nowLabel] : ringLabels) l.sprite.scale.set(l.width * unit, l.height * unit, 1)
  }
  const occRay = new THREE.Raycaster()
  const _d = new THREE.Vector3()
  const _p = new THREE.Vector3()
  function isOccluded(pos: THREE.Vector3): boolean {
    _d.copy(pos).sub(camera.position)
    const dist = _d.length()
    occRay.set(camera.position, _d.normalize())
    occRay.far = Math.max(0.1, dist - 0.45)
    const targets: THREE.Object3D[] = [frontMesh]
    if (mannequin.group.visible) targets.push(mannequin.group)
    return occRay.intersectObjects(targets, true).length > 0
  }
  function updateLabels(force: boolean) {
    // 가려졌는지 보는 일은 비싸서, 움직이는 동안에는 12장에 한 번만 합니다.
    const recheck = force || (labelsStale && frame % 12 === 0)
    if (recheck) labelsStale = false
    for (const l of nowLabel ? [...ringLabels, nowLabel] : ringLabels) {
      const o = l.anchor.object
      l.sprite.position.copy(o.position)
      _p.copy(o.position).project(camera)
      _d.copy(camera.position).sub(o.position)
      let vis = o.visible && _p.z < 1 && Math.abs(_p.x) < 1.05 && Math.abs(_p.y) < 1.05 && l.anchor.normal.dot(_d) > 0
      if (vis && (recheck || !l.checked)) {
        l.occluded = isOccluded(o.position)
        l.checked = true
      }
      l.sprite.visible = vis && !l.occluded
    }
  }

  // ---- 카메라 ----
  const anim: { active: boolean; t0: number; dur: number; from: THREE.Spherical; to: THREE.Spherical; target0: THREE.Vector3; target1: THREE.Vector3 } = {
    active: false,
    t0: 0,
    dur: 0,
    from: new THREE.Spherical(),
    to: new THREE.Spherical(),
    target0: new THREE.Vector3(),
    target1: new THREE.Vector3(),
  }
  const _off = new THREE.Vector3()
  const _sph = new THREE.Spherical()
  const portrait = () => Math.max(1, 0.95 / camera.aspect)

  function setCamera(sph: THREE.Spherical, target: THREE.Vector3) {
    labelsStale = true
    _off.setFromSpherical(sph)
    camera.position.copy(target).add(_off)
    controls.target.copy(target)
    camera.lookAt(target)
    needsRender = true
  }
  function flyTo(dir: [number, number, number], distance: number, target: THREE.Vector3, instant = false) {
    anim.to.setFromVector3(_off.set(dir[0], dir[1], dir[2]).normalize().multiplyScalar(distance))
    anim.to.makeSafe()
    anim.target1.copy(target)
    if (instant || reduced) {
      anim.active = false
      setCamera(anim.to, target)
      controls.update()
      return
    }
    anim.from.setFromVector3(_off.copy(camera.position).sub(controls.target))
    anim.target0.copy(controls.target)
    // 가까운 쪽으로 돕니다.
    let d = anim.to.theta - anim.from.theta
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    anim.to.theta = anim.from.theta + d
    anim.t0 = performance.now()
    anim.dur = 700
    anim.active = true
  }
  function stepAnim(now: number): boolean {
    if (!anim.active) return false
    const t = Math.min(1, (now - anim.t0) / anim.dur)
    const e = t * t * (3 - 2 * t)
    _sph.set(THREE.MathUtils.lerp(anim.from.radius, anim.to.radius, e), THREE.MathUtils.lerp(anim.from.phi, anim.to.phi, e), THREE.MathUtils.lerp(anim.from.theta, anim.to.theta, e))
    _sph.makeSafe()
    setCamera(_sph, _off.copy(anim.target0).lerp(anim.target1, e).clone())
    if (t >= 1) anim.active = false
    return true
  }
  const currentDistance = () => camera.position.distanceTo(controls.target)

  /** 편물과 마네킹이 화면에 들어오도록 기준 거리와 중심을 정합니다. */
  function frameScene() {
    const b = garment.bbox
    let radius = Math.max(0.5 * Math.hypot(b.size[0], b.size[1], b.size[2]), 6)
    homeTarget.set(b.center[0], b.center[1], b.center[2])
    const fit = garment.mannequin
    if (fit) {
      // 어깨에서 편물(또는 머리) 꼭대기까지가 화면에 들어오게 합니다.
      const s = fit.scale
      const bottom = fit.origin[1] + MANNEQUIN.shoulders.center[1] * s
      const top = Math.max(b.max[1], fit.head.center[1] + fit.head.radius[1])
      radius = Math.max(radius, ((top - bottom) / 2) * 1.15)
      homeTarget.set(0, (top + bottom) / 2, 0)
    }
    homeDistance = (1.3 * radius) / Math.sin(THREE.MathUtils.degToRad(FOV / 2))
    camera.near = Math.max(0.1, homeDistance / 200)
    camera.far = homeDistance * 12
    camera.updateProjectionMatrix()
    controls.minDistance = homeDistance * 0.22
    controls.maxDistance = homeDistance * 3.2
    flyTo(garment.mannequin ? VIEW_DIRS.home : VIEW_DIRS.homeFlat, homeDistance * portrait(), homeTarget, true)
  }

  function resize() {
    if (disposed) return
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    if (w < 1 || h < 1) return
    const dpr = Math.min(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 2)
    if (w === width && h === height && renderer.getPixelRatio() === dpr) return
    const wasPortrait = portrait()
    width = w
    height = h
    renderer.setPixelRatio(dpr)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    // 세로로 긴 화면에서는 같은 것이 보이도록 물러납니다.
    const k = portrait() / wasPortrait
    if (Math.abs(k - 1) > 1e-3 && !anim.active) {
      _off.copy(camera.position).sub(controls.target).multiplyScalar(k)
      camera.position.copy(controls.target).add(_off)
    }
    sizeLabels()
    labelsStale = true
    needsRender = true
  }

  function render(recheckLabels = false) {
    frame += 1
    updateLabels(recheckLabels)
    renderer.render(scene, camera)
    needsRender = false
  }

  // ---- 코 누르기 ----
  const pickRay = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let downAt: { x: number; y: number; t: number } | null = null
  function onPointerDown(e: PointerEvent) {
    if (e.isPrimary === false) {
      downAt = null
      return
    }
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() }
  }
  function onPointerUp(e: PointerEvent) {
    if (!downAt || !opts.onPick) return
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y)
    const dt = performance.now() - downAt.t
    downAt = null
    // 돌려 보는 끌기와 구분합니다.
    if (moved > 6 || dt > 600 || !garmentVisible) return
    const r = canvas.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    pickRay.setFromCamera(pointer, camera)
    const hit = pickRay.intersectObject(pickMesh, false)[0]
    if (!hit || hit.faceIndex == null) return
    // 마네킹이 앞을 가리고 있으면 누른 것으로 치지 않습니다.
    if (mannequin.group.visible) {
      const head = pickRay.intersectObject(mannequin.group, true)[0]
      if (head && head.distance < hit.distance) return
    }
    const ref = stitchAt(garment, Math.floor(hit.faceIndex / 2))
    if (ref) opts.onPick({ row: ref.row, stitch: ref.k + 1, x: ref.x })
  }
  function onPointerCancel() {
    downAt = null
  }
  function onContextLost(e: Event) {
    e.preventDefault()
  }
  function onContextRestored() {
    needsRender = true
  }
  function onControlStart() {
    anim.active = false
  }
  function onControlChange() {
    labelsStale = true
    needsRender = true
  }

  if (interactive) {
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerCancel)
  }
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)
  controls.addEventListener('start', onControlStart)
  controls.addEventListener('change', onControlChange)

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null
  resizeObserver?.observe(canvas)
  const screenObserver =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
          onScreen = entries[entries.length - 1]?.isIntersecting ?? true
          if (onScreen) needsRender = true
        })
      : null
  screenObserver?.observe(canvas)

  // ---- 그리기 ----
  let raf = 0
  let last = performance.now()
  function tick(now: number) {
    if (disposed) return
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (!onScreen) return
    let active = stepAnim(now)
    if (controls.update(dt)) active = true
    if (nowGroup.visible && garmentVisible && !reduced) {
      const s = 1 + 0.18 * Math.sin(now / 260)
      nowRing.scale.set(s, s, s)
      active = true
    }
    if (active || needsRender) render()
    else if (labelsStale) render(true)
  }

  installGarment()
  // 처음 크기를 맞춥니다. (resize는 값이 같으면 건너뛰므로 처음에는 다르게 둡니다.)
  width = height = 0
  resize()
  if (width === 0) {
    width = height = 1
  }
  flyTo(garment.mannequin ? VIEW_DIRS.home : VIEW_DIRS.homeFlat, homeDistance * portrait(), homeTarget, true)
  render(true)
  raf = requestAnimationFrame(tick)
  if (opts.onReady) {
    const ready = opts.onReady
    queueMicrotask(() => {
      if (!disposed) ready()
    })
  }

  return {
    get garment() {
      return garment
    },
    setPattern(expanded, template, options) {
      if (disposed) return
      // 그릴 수 없는 템플릿이면 여기서 오류가 나고 화면은 그대로 남습니다.
      const next: GarmentOptions = { ...garmentOptions, ...options }
      garment = buildGarment(expanded, template, next)
      garmentOptions = next
      installGarment()
    },
    setProgress(p) {
      if (disposed) return
      progress = p
      applyProgress()
    },
    setRings(next) {
      if (disposed) return
      rings = [...next]
      applyRings()
    },
    setAvatar(a) {
      if (disposed) return
      avatar = sanitizeAvatar(a)
      mannequin.setAvatar(avatar)
      mannequin.setCovered(garmentVisible)
      labelsStale = true
      needsRender = true
    },
    setGarmentVisible(v) {
      if (disposed) return
      garmentVisible = v
      applyVisibility()
    },
    setMannequinVisible(v) {
      if (disposed) return
      mannequinVisible = v
      applyVisibility()
    },
    setAutoRotate(on) {
      controls.autoRotate = on
      needsRender = true
    },
    setView(preset) {
      if (disposed) return
      flyTo(VIEW_DIRS[preset] ?? VIEW_DIRS.front, currentDistance(), homeTarget)
    },
    zoomBy(factor) {
      if (disposed || !(factor > 0) || !Number.isFinite(factor)) return
      anim.active = false
      const d = THREE.MathUtils.clamp(currentDistance() / factor, controls.minDistance, controls.maxDistance)
      _off.copy(camera.position).sub(controls.target).setLength(d)
      camera.position.copy(controls.target).add(_off)
      controls.update()
      labelsStale = true
      needsRender = true
    },
    resetView() {
      if (disposed) return
      flyTo(garment.mannequin ? VIEW_DIRS.home : VIEW_DIRS.homeFlat, homeDistance * portrait(), homeTarget)
    },
    resize,
    snapshot() {
      if (disposed) return ''
      // 그린 바로 뒤에 읽어야 빈 그림이 나오지 않습니다.
      render(true)
      return canvas.toDataURL('image/png')
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(raf)
      resizeObserver?.disconnect()
      screenObserver?.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerCancel)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      controls.removeEventListener('start', onControlStart)
      controls.removeEventListener('change', onControlChange)
      if (interactive) controls.dispose()

      for (const l of ringLabels) dropLabel(l)
      if (nowLabel) dropLabel(nowLabel)
      ringLabels = []
      nowLabel = null
      for (const m of ringMats) m.dispose()
      ringMats = []
      for (const g of [knitGeo, ghostGeo, rowGeo, pickGeo, nowDotGeo, nowRingGeo, ringGeo, claspGeo]) g.dispose()
      for (const m of [frontMat, backMat, ghostMat, rowMat, pickMat, nowMat]) m.dispose()
      atlas.dispose()
      mannequin.dispose()
      scene.clear()
      renderer.renderLists.dispose()
      // 같은 캔버스에 다시 만들 수 있도록 컨텍스트는 강제로 버리지 않고, GL 상태만 처음으로 돌려놓습니다.
      renderer.resetState()
      renderer.dispose()
    },
  }
}
