import { useId } from 'react'

/**
 * 서비스의 마스코트. 큰 귀를 가진 친구가 실뭉치를 껴안고 있습니다.
 * 이 서비스를 위해 새로 그린 그림이고, 색은 화면의 코코아색과 주황색을 그대로 씁니다.
 */

const CREAM = '#f6e3cf'
const PEACH = '#f6b48f'
const COCOA = '#2a201b'
const YARN = '#e8590c'
const YARN_DARK = '#b8450a'
const YARN_LIGHT = '#fbc9a8'

/** 전신 그림. label을 주면 그림으로 읽히고, 없으면 꾸밈으로만 둡니다. */
export function Mascot({ size = 160, label, className }: { size?: number; label?: string; className?: string }) {
  const clip = useId()
  const arm = 'M62 164 C 58 182, 72 194, 92 190'
  const armRight = 'M178 164 C 182 182, 168 194, 148 190'
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 240 240"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-mascot=""
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="120" cy="178" r="45" />
        </clipPath>
      </defs>
      <g stroke={COCOA} strokeWidth="5" strokeLinejoin="round" strokeLinecap="round">
        {/* 귀 */}
        <path d="M76 60 C 58 26, 22 16, 15 38 C 8 64, 38 94, 66 102 Z" fill={CREAM} />
        <path d="M164 60 C 182 26, 218 16, 225 38 C 232 64, 202 94, 174 102 Z" fill={CREAM} />
        {/* 몸 */}
        <path d="M120 128 C 162 128, 186 156, 186 188 C 186 214, 160 228, 120 228 C 80 228, 54 214, 54 188 C 54 156, 78 128, 120 128 Z" fill={CREAM} />
        {/* 실뭉치 */}
        <circle cx="120" cy="178" r="45" fill={YARN} />
      </g>
      <g clipPath={`url(#${clip})`} fill="none" strokeLinecap="round">
        <g stroke={YARN_DARK} strokeWidth="3.5">
          <path d="M72 168 C 96 150, 140 152, 168 180" />
          <path d="M72 186 C 98 166, 138 168, 164 200" />
          <path d="M78 204 C 100 184, 132 186, 152 218" />
          <path d="M96 222 C 100 190, 132 166, 166 160" />
          <path d="M118 226 C 122 198, 146 180, 168 176" />
        </g>
        <g stroke={YARN_LIGHT} strokeWidth="3">
          <path d="M84 150 C 104 140, 138 140, 160 158" />
          <path d="M140 224 C 144 208, 156 198, 166 194" />
        </g>
      </g>
      {/* 풀린 실 */}
      <path d="M156 208 C 178 232, 196 208, 211 220 C 222 229, 232 223, 229 214" fill="none" stroke={YARN} strokeWidth="5" strokeLinecap="round" />
      {/* 발 */}
      <g stroke={COCOA} strokeWidth="5" fill={CREAM}>
        <ellipse cx="84" cy="222" rx="19" ry="11.5" />
        <ellipse cx="156" cy="222" rx="19" ry="11.5" />
      </g>
      {/* 머리 */}
      <ellipse cx="120" cy="94" rx="62" ry="54" fill={CREAM} stroke={COCOA} strokeWidth="5" />
      {/* 귀 안쪽 */}
      <path d="M67 66 C 54 42, 34 34, 30 46 C 27 62, 46 80, 62 87 Z" fill={PEACH} />
      <path d="M173 66 C 186 42, 206 34, 210 46 C 213 62, 194 80, 178 87 Z" fill={PEACH} />
      {/* 머리 위 실 한 가닥 */}
      <path d="M119 42 C 110 22, 134 16, 132 30 C 131 39, 120 37, 123 29" fill="none" stroke={YARN} strokeWidth="5" strokeLinecap="round" />
      {/* 팔 */}
      <g fill="none" strokeLinecap="round">
        <path d={arm} stroke={COCOA} strokeWidth="24" />
        <path d={arm} stroke={CREAM} strokeWidth="14" />
        <path d={armRight} stroke={COCOA} strokeWidth="24" />
        <path d={armRight} stroke={CREAM} strokeWidth="14" />
      </g>
      {/* 얼굴 */}
      <ellipse cx="82" cy="116" rx="10" ry="6.5" fill={PEACH} />
      <ellipse cx="158" cy="116" rx="10" ry="6.5" fill={PEACH} />
      <ellipse cx="98" cy="98" rx="8.5" ry="10.5" fill={COCOA} />
      <ellipse cx="142" cy="98" rx="8.5" ry="10.5" fill={COCOA} />
      <circle cx="95" cy="94" r="3.2" fill="#ffffff" />
      <circle cx="139" cy="94" r="3.2" fill="#ffffff" />
      <path d="M111 113 q4.5 6 9 0 q4.5 6 9 0" fill="none" stroke={COCOA} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** 머리띠와 탭 아이콘에 쓰는 얼굴 표시. app/icon.svg와 같은 그림입니다. */
export function MascotMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill={YARN} />
      <path d="M9.6 12 C 7.6 6.6, 3 5.6, 2.5 8.8 C 2 12.6, 5.4 16.4, 8.2 17.2 Z" fill={CREAM} />
      <path d="M18.4 12 C 20.4 6.6, 25 5.6, 25.5 8.8 C 26 12.6, 22.6 16.4, 19.8 17.2 Z" fill={CREAM} />
      <path d="M8.3 11.6 C 6.9 8.6, 4.5 7.8, 4.2 9.4 C 4 11.4, 5.8 13.8, 7.5 14.6 Z" fill={PEACH} />
      <path d="M19.7 11.6 C 21.1 8.6, 23.5 7.8, 23.8 9.4 C 24 11.4, 22.2 13.8, 20.5 14.6 Z" fill={PEACH} />
      <ellipse cx="14" cy="17" rx="8.2" ry="7.2" fill={CREAM} />
      <circle cx="11" cy="17" r="1.5" fill={COCOA} />
      <circle cx="17" cy="17" r="1.5" fill={COCOA} />
      <path d="M12.7 19.7 q0.65 0.9 1.3 0 q0.65 0.9 1.3 0" fill="none" stroke={COCOA} strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
