/** 사용자에게 그대로 보여 줄 수 있는 오류 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = () => new AppError(404, 'not_found', '도안을 찾을 수 없습니다.')
