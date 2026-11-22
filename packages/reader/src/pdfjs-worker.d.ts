// pdfjs-dist는 작업자 모듈의 타입을 싣지 않습니다. extract.ts에서 불러 등록만 합니다.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
