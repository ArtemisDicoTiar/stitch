/**
 * 마네킹과 꾸미기 부품. 부품은 모두 단순한 도형(구, 원통, 고리)입니다.
 * 좌표는 mannequin-dims.ts 의 마네킹 좌표(cm)이고, 편물에 맞추는 배율과 자리는 group 에 줍니다.
 */
import * as THREE from 'three'
import { AVATAR_CATALOG, type Avatar, type AvatarFace, type AvatarGlasses, type AvatarHair } from './avatar'
import { MANNEQUIN, type Vec3 } from './mannequin-dims'

export type Mannequin = {
  group: THREE.Group
  setAvatar(avatar: Avatar): void
  /** 편물을 쓰고 있는지. 쓰고 있으면 편물 밖으로 나오는 머리(묶은 머리, 긴 머리의 아래쪽)를 감춥니다. */
  setCovered(covered: boolean): void
  dispose(): void
}

type FaceShape = {
  /** 머리 타원체의 반지름 */
  radius: Vec3
  /** 덧붙이는 도형: 턱이나 광대 */
  extra?: { at: Vec3; radius: Vec3 }[]
}

const HEAD = MANNEQUIN.head
const FACES: Record<AvatarFace, FaceShape> = {
  default: { radius: [...HEAD.radius] },
  round: { radius: [8.3, 9.9, 9.4] },
  // 갸름한형: 좁은 머리에 뾰족한 턱
  slim: { radius: [7.0, 10.7, 9.0], extra: [{ at: [0, -5.2, 1.0], radius: [4.4, 6.1, 6.4] }] },
  // 각진형: 넓은 아래턱
  square: { radius: [7.8, 10.3, 9.2], extra: [{ at: [0, -4.6, 0.4], radius: [7.15, 5.4, 7.7] }] },
}

const SKIN_GRAY = 0x8e959c
const CLOTH = 0xd8d0c4
const HAIR = 0x2b1d15
const EYE = 0x2a211c

function skinColor(avatar: Avatar): number {
  const o = AVATAR_CATALOG.skin.find((s) => s.id === avatar.skin)
  return o?.swatch ? parseInt(o.swatch.slice(1), 16) : SKIN_GRAY
}

export function createMannequin(initial: Avatar): Mannequin {
  const group = new THREE.Group()
  group.name = 'mannequin'
  let parts = new THREE.Group()
  group.add(parts)
  let geometries: THREE.BufferGeometry[] = []
  let materials: THREE.Material[] = []
  /** 편물을 쓰면 감추는 부품 */
  let outside: THREE.Object3D[] = []
  let covered = true

  const build = (avatar: Avatar) => {
    for (const g of geometries) g.dispose()
    for (const m of materials) m.dispose()
    geometries = []
    materials = []
    outside = []
    group.remove(parts)
    parts = new THREE.Group()
    group.add(parts)

    const geo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g)
      return g
    }
    const mat = <T extends THREE.Material>(m: T): T => {
      materials.push(m)
      return m
    }
    const toned = avatar.skin !== 'gray'
    const skin = mat(new THREE.MeshStandardMaterial({ color: skinColor(avatar), roughness: toned ? 0.75 : 0.85 }))
    const cloth = toned ? mat(new THREE.MeshStandardMaterial({ color: CLOTH, roughness: 0.9 })) : skin
    const sphere = geo(new THREE.SphereGeometry(1, 48, 32))
    const smallSphere = geo(new THREE.SphereGeometry(1, 24, 16))

    const ball = (material: THREE.Material, at: Vec3, radius: Vec3, small = false) => {
      const m = new THREE.Mesh(small ? smallSphere : sphere, material)
      m.position.set(at[0], at[1], at[2])
      m.scale.set(radius[0], radius[1], radius[2])
      parts.add(m)
      return m
    }

    // ---- 몸 ----
    const face = FACES[avatar.face] ?? FACES.default
    const [cx, cy, cz] = HEAD.center
    const [rx, ry, rz] = face.radius
    ball(skin, [cx, cy, cz], face.radius)
    for (const e of face.extra ?? []) ball(skin, [cx + e.at[0], cy + e.at[1], cz + e.at[2]], e.radius)
    const neck = new THREE.Mesh(geo(new THREE.CylinderGeometry(MANNEQUIN.neck.radiusTop, MANNEQUIN.neck.radiusBottom, MANNEQUIN.neck.height, 40)), skin)
    neck.position.set(...MANNEQUIN.neck.center)
    parts.add(neck)
    ball(cloth, [...MANNEQUIN.shoulders.center], [...MANNEQUIN.shoulders.radius])

    /** 얼굴 쪽 머리 겉면의 z */
    const surfZ = (x: number, y: number) => cz + rz * Math.sqrt(Math.max(0.02, 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2))
    const kx = rx / HEAD.radius[0]
    const noseY = MANNEQUIN.nose.center[1]
    ball(skin, [0, noseY, surfZ(0, noseY) - 0.15], [...MANNEQUIN.nose.radius], true)

    const eyeX = 3.05 * kx
    const eyeY = cy + 1.8
    if (toned) {
      const eye = mat(new THREE.MeshStandardMaterial({ color: EYE, roughness: 0.4 }))
      for (const sx of [-1, 1]) ball(eye, [sx * eyeX, eyeY, surfZ(sx * eyeX, eyeY) - 0.05], [0.42, 0.42, 0.21], true)
    }

    // ---- 머리 ----
    if (avatar.hair !== 'none') buildHair(avatar.hair)
    if (avatar.glasses !== 'none') buildGlasses(avatar.glasses)
    for (const o of outside) o.visible = !covered

    function buildHair(kind: AvatarHair) {
      const hair = mat(new THREE.MeshStandardMaterial({ color: HAIR, roughness: 0.55, side: THREE.DoubleSide }))
      // 머리 타원체보다 조금 큰 껍질. 껍질 안에서 돌려야 머리 모양을 따라갑니다.
      const shell = (grow: number) => {
        const s = new THREE.Group()
        s.position.set(cx, cy, cz)
        s.scale.set(rx * grow, ry * grow, rz * grow)
        parts.add(s)
        return s
      }
      /** 뒤로 기울인 반구: 앞은 이마선, 뒤는 뒤통수 아래까지 덮습니다. */
      const cap = (grow: number, cover: number, tilt: number) => {
        const m = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * cover)), hair)
        m.rotation.x = -tilt
        shell(grow).add(m)
      }
      /** 얼굴 쪽이 트인 띠: 귀 위에서 아래로 내려오는 옆머리와 뒷머리 */
      const curtain = (grow: number, from: number, to: number, open: number) => {
        const m = new THREE.Mesh(geo(new THREE.SphereGeometry(1, 48, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, Math.PI * from, Math.PI * (to - from))), hair)
        shell(grow).add(m)
      }
      const fringe = () => {
        for (const i of [-2, -1, 0, 1, 2]) {
          const x = i * 1.75 * kx
          const y = cy + (4.9 - Math.abs(i) * 0.3) * (ry / HEAD.radius[1])
          const m = ball(hair, [x, y, surfZ(x, y) + 0.3], [1.35 * kx, 2.5, 0.55], true)
          m.rotation.set(-0.42, 0, -i * 0.13)
        }
      }
      const sideLocks = (length: number) => {
        for (const sx of [-1, 1]) {
          const x = sx * 6.75 * kx
          const y = cy - 1.2 - (length - 6.2) * 0.5
          const m = ball(hair, [x, y, surfZ(x, cy - 1.2) + 0.35], [0.8, length, 1.9], true)
          m.rotation.z = sx * 0.06
        }
      }

      if (kind === 'bangs') {
        cap(1.045, 0.56, 0.5)
        fringe()
        sideLocks(6.2)
      } else if (kind === 'bob') {
        cap(1.05, 0.58, 0.45)
        curtain(1.09, 0.3, 0.74, 0.95)
      } else if (kind === 'long') {
        cap(1.05, 0.58, 0.45)
        curtain(1.09, 0.3, 0.7, 1.0)
        // 등으로 내려오는 머리와 어깨 앞으로 넘어온 머리. 편물을 쓰면 안으로 넣은 것으로 보고 감춥니다.
        outside.push(ball(hair, [0, cy - 13, cz - rz * 0.8 - 0.6], [rx * 0.98, 13.5, 2.8]))
        for (const sx of [-1, 1]) outside.push(ball(hair, [sx * (rx + 0.2), cy - 11.5, cz + 1.2], [1.7, 11, 2.6], true))
      } else if (kind === 'bun') {
        cap(1.045, 0.62, 0.7)
        outside.push(ball(hair, [0, cy + ry * 0.86, cz - rz * 0.52], [3.3, 3.0, 3.3], true))
      }
    }

    // ---- 안경 ----
    function buildGlasses(kind: AvatarGlasses) {
      const style = {
        round: { color: 0x1b1918, metal: 0.35, rough: 0.35, r: 2.15, tube: 0.2, lens: 0xcfe3ee, lensOpacity: 0.28, flat: 1 },
        horn: { color: 0x2a1710, metal: 0.05, rough: 0.5, r: 2.2, tube: 0.42, lens: 0xcfe3ee, lensOpacity: 0.22, flat: 0.86 },
        half: { color: 0x1b1918, metal: 0.45, rough: 0.3, r: 2.2, tube: 0.24, lens: 0xcfe3ee, lensOpacity: 0.3, flat: 0.84 },
        sun: { color: 0x121010, metal: 0.2, rough: 0.35, r: 2.35, tube: 0.26, lens: 0x17120f, lensOpacity: 0.93, flat: 0.92 },
      }[kind as Exclude<AvatarGlasses, 'none'>]
      if (!style) return
      const frame = mat(new THREE.MeshStandardMaterial({ color: style.color, roughness: style.rough, metalness: style.metal }))
      const lens = mat(new THREE.MeshStandardMaterial({ color: style.lens, roughness: 0.1, transparent: true, opacity: style.lensOpacity, side: THREE.DoubleSide }))
      // 반무테는 위쪽 반만 테가 있습니다.
      const rimGeo = geo(new THREE.TorusGeometry(style.r, style.tube, 12, 48, kind === 'half' ? Math.PI : Math.PI * 2))
      const lensGeo = geo(new THREE.CircleGeometry(style.r - 0.05, 40))
      const y = eyeY + 0.1
      for (const sx of [-1, 1]) {
        const x = sx * eyeX
        const z = surfZ(x, y) + 0.75
        const eyeGroup = new THREE.Group()
        eyeGroup.position.set(x, y, z)
        eyeGroup.rotation.y = sx * 0.2
        eyeGroup.scale.set(1, style.flat, 1)
        eyeGroup.add(new THREE.Mesh(rimGeo, frame), new THREE.Mesh(lensGeo, lens))
        parts.add(eyeGroup)
        // 다리: 테의 바깥쪽에서 귀 쪽으로
        const a = new THREE.Vector3(sx * (eyeX + style.r - 0.1), y + 0.3, z - 0.5)
        const b = new THREE.Vector3(sx * (rx - 0.1), y + 0.6, cz + 1.5)
        const temple = new THREE.Mesh(geo(new THREE.CylinderGeometry(style.tube * 0.85, style.tube * 0.85, a.distanceTo(b), 10)), frame)
        temple.position.copy(a).add(b).multiplyScalar(0.5)
        temple.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
        parts.add(temple)
      }
      // 코걸이
      const gap = eyeX - style.r
      const bridge = new THREE.Mesh(geo(new THREE.TorusGeometry(Math.max(0.5, gap + 0.05), style.tube * 0.85, 10, 24, Math.PI)), frame)
      bridge.position.set(0, y - 0.15, surfZ(0, y) + 0.95)
      parts.add(bridge)
    }
  }

  build(initial)

  return {
    group,
    setAvatar: build,
    setCovered(v) {
      covered = v
      for (const o of outside) o.visible = !covered
    },
    dispose() {
      for (const g of geometries) g.dispose()
      for (const m of materials) m.dispose()
      geometries = []
      materials = []
      group.remove(parts)
    },
  }
}
