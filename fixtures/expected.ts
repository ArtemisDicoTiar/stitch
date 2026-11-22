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
