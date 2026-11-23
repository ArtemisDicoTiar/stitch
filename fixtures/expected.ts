/** 직접 쓴 도안을 엔진으로 검산했을 때 나와야 하는 숫자 */
export const practiceHoodExpected = {
  totalRows: 93,
  sections: [
    { id: 'neck', rows: 18, start: 85, end: 79 },
    { id: 'head', rows: 54, start: 79, end: 94 },
    { id: 'crown', rows: 21, start: 94, end: 0 },
  ],
  /** 단 번호 → 그 단을 뜬 뒤의 코 수 */
  checkpoints: { 1: 85, 8: 85, 9: 79, 18: 79, 19: 84, 20: 88, 21: 90, 23: 92, 25: 94, 72: 94, 73: 92, 77: 90, 81: 88, 85: 86, 87: 84, 89: 82, 91: 80, 92: 80, 93: 0 } as Record<number, number>,
  symbols: ['K', 'P', 'YO', 'K2TOG', 'SSK', 'SK2P', 'M1L', 'M1R', 'CO', 'BO'],
}

export const garterScarfExpected = { totalRows: 91, castOn: 24 }

export const practiceBallExpected = {
  totalRows: 14,
  totalStitches: 300,
  /** 단 번호 순서대로, 그 단을 뜬 뒤의 코 수 */
  counts: [6, 12, 18, 24, 30, 30, 30, 30, 30, 30, 24, 18, 12, 6],
  symbols: ['SC', 'SC2'],
}

export const practiceScarfExpected = {
  /** 시작 사슬 단 1 + 뜨는 단 80 */
  totalRows: 81,
  chain: 26,
  stitches: 24,
}

export const practiceBearExpected = {
  /** 머리 14 + 몸통 13 + 팔 8 × 2 + 귀 3 × 2 */
  totalRows: 49,
  sections: [
    { id: 'head', rows: 14, start: 0, end: 12 },
    { id: 'body', rows: 13, start: 0, end: 12 },
    { id: 'arm', rows: 16, start: 0, end: 9, copies: 2 },
    { id: 'ear', rows: 6, start: 0, end: 12, copies: 2 },
  ],
  /** 따로 뜨는 조각 수 */
  pieces: 6,
}

