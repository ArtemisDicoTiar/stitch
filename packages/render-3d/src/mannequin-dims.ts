/**
 * 마네킹의 치수 (배율 1, cm). three.js 없이 형태 템플릿과 그리는 쪽이 함께 씁니다.
 *
 * 마네킹 좌표: y가 위, 얼굴이 +z를 봅니다. y = 0은 목 편물이 시작하는 높이(어깨 바로 위)이고
 * `chinY`는 턱 바로 아래, 곧 목 편물이 끝나고 머리 부분이 시작하는 높이입니다.
 */
export type Vec3 = [number, number, number]

export const MANNEQUIN = {
  head: { center: [0, 23.4, 1.0] as Vec3, radius: [7.6, 10.5, 9.2] as Vec3 },
  neck: { center: [0, 7, 0.3] as Vec3, radiusTop: 5.1, radiusBottom: 5.6, height: 20 },
  shoulders: { center: [0, -4.5, 0.5] as Vec3, radius: [17, 6, 10] as Vec3 },
  nose: { center: [0, 22.4, 10.0] as Vec3, radius: [1.1, 1.8, 1.4] as Vec3 },
  /** 턱 바로 아래 높이 */
  chinY: 10.8,
  /** 목의 중심이 z로 비켜난 정도 */
  neckZ: 0.3,
} as const

/** 마네킹을 편물에 맞춰 놓는 방법 */
export type MannequinFit = {
  /** 마네킹 전체 배율. 1이 표준 어른 머리입니다. */
  scale: number
  /** 마네킹 좌표의 원점을 둘 자리 (편물 좌표) */
  origin: Vec3
  /** 맞춘 뒤의 머리 타원체 (편물 좌표). 기본 얼굴형 기준입니다. */
  head: { center: Vec3; radius: Vec3 }
}

export function fitMannequin(scale: number, origin: Vec3): MannequinFit {
  const h = MANNEQUIN.head
  return {
    scale,
    origin,
    head: {
      center: [origin[0] + h.center[0] * scale, origin[1] + h.center[1] * scale, origin[2] + h.center[2] * scale],
      radius: [h.radius[0] * scale, h.radius[1] * scale, h.radius[2] * scale],
    },
  }
}
