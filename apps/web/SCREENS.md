# 화면 구현 안내 (apps/web)

화면을 만드는 사람이 공통으로 지킬 것을 적어 둡니다.

## 기술

- Next.js 16.4 App Router, React 19, TypeScript strict. 이 버전의 문서는 `apps/web/node_modules/next/dist/docs/` 에 들어 있습니다. 확실하지 않은 API는 거기서 확인합니다. (`params`는 Promise 입니다.)
- 스타일은 CSS Modules와 `src/app/globals.css` 의 토큰(`var(--accent)` 등)과 공통 클래스(`.btn`, `.card`, `.chip`, `.wrap` 등). Tailwind나 UI 라이브러리는 쓰지 않습니다. 새 의존성을 넣지 않습니다.
- 서버 컴포넌트는 `src/server/*` 의 함수를 바로 부릅니다 (`currentUser()` → `getPatternView(user.id, id)` 등). 데이터베이스를 읽는 페이지는 `export const dynamic = 'force-dynamic'`.
- 클라이언트에서는 `src/lib/api.ts` 의 `apiFetch` 로 `/api/*` 를 부릅니다. 오류는 `ApiError(code, message)` 이고 `message`는 사용자에게 그대로 보여 줄 수 있는 한국어입니다.
- 엔진은 브라우저에서도 돕니다: `expand(ir)` (`@stitch/engine`) 로 IR을 펼쳐 씁니다.

## 경로

| 경로 | 화면 | 디자인 |
| --- | --- | --- |
| `/` | 랜딩 | `Main.dc.html` |
| `/upload` | 도안 올리기 | `Upload.dc.html` |
| `/patterns/[id]/reading` | 읽는 중 | `Upload.dc.html` 의 읽는 중 상태 |
| `/patterns/[id]/review` | 읽은 내용 확인 | `Review.dc.html` |
| `/patterns/[id]/gauge` | 게이지 맞추기 | `Gauge.dc.html`, `M-Gauge.dc.html` |
| `/patterns/[id]` | 작업 화면 | `Workspace.dc.html`, `M-Workspace.dc.html` |
| `/mannequin` | 마네킹 꾸미기 | `Mannequin.dc.html` |
| `/pricing` | 요금제 | `Pricing.dc.html` |
| `/library` | 내 도안 | `Library.dc.html` |

도안의 상태에 따라 갈 곳: `reading`/`failed` → reading, `needs_review` → review, `ready` 이고 `gaugeMode === 'unset'` → gauge, 그 밖에는 작업 화면.

## API

타입은 `src/server/patterns.ts` (`PatternView`, `LibraryItem`, `ProgressEntry`, `RingMarker`), `src/server/job-view.ts` (`JobView`), `src/server/avatar.ts` (`AvatarState`), `src/server/schemas.ts` 에 있습니다.

| 요청 | 하는 일 |
| --- | --- |
| `GET /api/me` | `{ user, plan, canReadPdf, pdfReading, maxPdfBytes }`. `canReadPdf`가 false면 API 키가 없습니다. `pdfReading`은 `on`(키 있음), `replay`(로컬: 남겨 둔 응답으로만), `off`(배포인데 키 없음: 올리기를 503 `reader_off`로 막음) |
| `GET /api/patterns` | `{ patterns: LibraryItem[] }` |
| `POST /api/patterns` (multipart `file`) | PDF 올리기 → `{ id, status, reused }` |
| `POST /api/patterns` (JSON `{ sample }`) | 예시 도안(`practice-hood`, `garter-scarf`)으로 시작 |
| `GET /api/patterns/:id` | `{ pattern: PatternView, job: JobView }` |
| `DELETE /api/patterns/:id` | 도안과 PDF, 기록, 단수링을 함께 삭제 |
| `GET /api/patterns/:id/job` | `{ patternStatus, title, job }`. 읽는 중 화면이 1~2초마다 읽습니다 |
| `PUT /api/patterns/:id/ir` | 고친 IR 전체를 저장 → `{ verification, ir }` (바로 재검산) |
| `POST /api/patterns/:id/confirm` | 확인 완료. 오류가 남아 있으면 422 `has_errors` |
| `POST /api/patterns/:id/gauge/preview` (`{ stitches, rows }`) | 저장하지 않고 다시 계산 결과만 → `{ ok, reason, sections, width }` |
| `POST /api/patterns/:id/gauge` (`{ mode: 'as_is' \| 'recalc' \| 'remeasure', gauge }`) | 게이지 정하기 → `{ pattern }` |
| `GET/POST /api/patterns/:id/progress`, `PATCH/DELETE .../progress/:entryId` | 기록 |
| `GET/POST /api/patterns/:id/rings`, `PATCH/DELETE .../rings/:ringId` | 단수링 |
| `GET /api/patterns/:id/pdf` | 원본 PDF (소유자만) |
| `GET/PUT /api/avatar` | 마네킹. 저장은 플러스만 (403 `plus_required`) |
| `GET/POST /api/billing` (`{ plan: 'free' \| 'plus' }`) | 가짜 결제 스위치 |

## 지킬 것

- **저작권**: `prototype/` 과 `private/` 는 구매한 도안의 데이터라 git에서 빠져 있습니다. 그 도안의 이름, 지시문, 그림(디자인 파일의 `/_blob/...` 이미지 포함)을 `apps/`, `packages/`, `fixtures/` 에 옮기지 않습니다. 화면에 보이는 도안 내용은 모두 실행 중에 DB의 IR에서 나와야 합니다. 예시는 `@stitch/fixtures` 의 직접 쓴 도안을 씁니다.
- 디자인 파일(`prototype/design/*.dc.html`)의 배치, 간격, 색, 문구를 그대로 옮기되 색은 토큰으로 바꿉니다. 디자인에 없는 숫자(가격, 통계)를 지어내지 않습니다.
- 접근성: 실제 `<button>`, `<a href>`, `<label>` + `<input>`. 모든 조작이 키보드로 됩니다. 글자 대비 4.5:1 이상, 누르는 영역 44px 이상. 360px 너비에서도 가로 스크롤이 생기지 않습니다. 아이콘은 인라인 SVG, 이모지는 쓰지 않습니다.
- 도안은 올린 사람만 봅니다. 공유 링크나 공개 페이지를 만들지 않습니다.

## 따로 띄워 확인하기

여러 사람이 동시에 개발 서버를 띄울 수 있게 포트와 데이터 폴더를 나눕니다. (내장형 Postgres는 한 프로세스만 열 수 있습니다.)

```bash
cd apps/web
NEXT_TELEMETRY_DISABLED=1 NEXT_DIST_DIR=.next-<이름> DATABASE_URL=pglite://./data/pg-<이름> STORAGE_DIR=./data/uploads-<이름> pnpm exec next dev --port <포트>
```

API 키가 없어도 `fixtures/reading/practice-hood.pdf` 는 준비해 둔 응답으로 읽힙니다 (올리기 → 읽는 중 → 확인까지 실제로 돕니다).
화면 테스트는 `apps/web/e2e/<이름>.spec.ts` 에 두고 `pnpm test:e2e` 로 돌립니다. 휴대폰 크기 테스트는 `<이름>.phone.spec.ts`.
