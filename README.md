# Stitch

뜨개 도안 PDF를 올리면 기호 도안, 3D 모형, 단계별 안내가 있는 **따라 뜨기 페이지**로 바꿔 주는 웹 서비스입니다.
계획과 범위는 [`docs/PLAN.md`](docs/PLAN.md)에 있습니다.

- LLM은 도안 글을 구조화하는 데만 씁니다. 코 수 검산, 기호 도안, 3D, 게이지 계산은 코드가 합니다.
- 올린 도안은 올린 사람만 봅니다. 공유 링크를 만들지 않습니다.
- 유료 기능은 마네킹 꾸미기 저장 하나입니다.
- 지금은 대바늘 도안을 읽습니다. 코바늘은 엔진과 코 사전까지 들어가 있고, 화면은 단계별로 붙이는 중입니다 (코바늘 PDF를 올리면 준비 중이라고 알립니다).

## 시작하기

Node 20.9 이상과 pnpm이 필요합니다.

```bash
pnpm install
cp .env.example .env        # PDF를 읽으려면 ANTHROPIC_API_KEY를 넣습니다
pnpm dev                    # http://localhost:3000
```

API 키가 없어도 앱은 뜹니다. 그때는 **예시 도안**(직접 쓴 연습용 도안)으로 확인 → 게이지 → 작업 화면을 둘러볼 수 있고,
`fixtures/reading/practice-hood.pdf`는 준비해 둔 응답으로 읽히므로 올리기부터 끝까지 가 볼 수 있습니다.

| 명령 | 하는 일 |
| --- | --- |
| `pnpm dev` | 앱과 로컬 데이터베이스(내장형 Postgres), 변환 작업을 함께 실행 |
| `pnpm test` | 엔진, 게이지, 읽기, 렌더러, 서버 흐름 테스트. LLM을 부르지 않습니다 |
| `pnpm test:e2e` | 브라우저 자동 테스트 (Playwright). 처음에는 `pnpm exec playwright install chromium` |
| `pnpm typecheck` | 타입 검사 |
| `pnpm reader <도안.pdf>` | PDF 한 개를 읽어 IR과 검산 결과, 토큰 사용량을 출력. `--record` 로 응답을 남기고 `--replay <폴더>` 로 재생 |
| `pnpm fixtures:reading` | 연습 도안의 PDF와 LLM 응답 대역을 다시 만듦 |
| `pnpm exec tsx scripts/compare-read.ts <IR.json> <도안 이름>` | 실제로 읽은 결과를 직접 쓴 도안과 단별로 비교 |
| `node scripts/verify-deployed.mjs <주소> <대바늘 PDF> [코바늘 PDF]` | 배포 주소에서 방문자 둘로 API 흐름 확인. 읽기가 켜져 있으면 실제 변환 비용이 듭니다 |
| `node scripts/live-browser.mjs <주소> <캡처 폴더> <대바늘 PDF>` | 배포 주소를 실제 브라우저로 처음부터 끝까지 따라가기 |
| `pnpm exec tsx scripts/tutorial-sheet.ts <폴더> [이름...]` | 뜨는 법의 단계들을 그림 한 장으로 뽑기 (그림은 눈으로 확인합니다) |

환경 변수의 기본값과 설명은 `.env.example`에 있습니다. 로컬에서 꼭 필요한 것은 PDF를 읽을 때의 `ANTHROPIC_API_KEY` 하나입니다.
로컬 데이터(DB, 올린 PDF)는 `data/`에 쌓이고 git에서 빠져 있습니다.

## 배포 (Vercel)

Vercel 프로젝트의 Root Directory는 `apps/web`, 함수 지역은 데이터베이스와 같은 `sin1`입니다.
지역은 프로젝트 설정(Settings → Functions → Function Region)에서 정합니다. 저장소 맨 위에서 CLI로 배포하면 `apps/web/vercel.json`의 `regions`는 적용되지 않아 기본값(`iad1`)으로 돌고, 데이터베이스까지 왕복이 길어집니다.

| 환경 변수 | 값 | 까닭 |
| --- | --- | --- |
| `DATABASE_URL` | Vercel에 연결한 Postgres(Neon)가 넣어 줌 | 로컬과 같은 SQL, 같은 마이그레이션 |
| `STORAGE_DRIVER` | `db` | 함수의 파일 시스템은 남지 않아서 PDF를 데이터베이스에 둠 |
| `AUTH_MODE`, `AUTH_SECRET` | `anonymous`, 긴 무작위 문자열 | 로그인 없이 브라우저마다 익명 계정 하나. 방문자끼리 도안이 보이지 않음 |
| `BILLING_PROVIDER` | `mock` | 결제 제공자는 아직 미정 |
| `MAX_CONVERSIONS_PER_DAY` | 예: `20` | 공개 주소에서 LLM 비용이 한없이 나가지 않게 |
| `ANTHROPIC_API_KEY` | 직접 넣음 | 없으면 예시 도안만 되고, PDF 올리기는 받지 않고 돌려보냄 (503 `reader_off`) |

```bash
vercel deploy --prod        # 저장소 맨 위에서. private/ 와 prototype/ 은 .vercelignore 로 올라가지 않습니다
```

배포에서 로컬과 다른 점:

- PDF 변환은 응답을 보낸 뒤 같은 함수 안에서 이어 돕니다 (`after()`, 최대 300초). 계획서의 Workflow SDK로는 아직 옮기지 않았습니다.
- 올릴 수 있는 PDF는 4MB까지입니다 (Vercel 함수의 요청 본문 한도). 더 큰 파일은 브라우저에서 저장소로 바로 올리는 방식이 필요합니다.
- 익명 계정은 쿠키에 묶여 있어서, 쿠키를 지우면 그 브라우저의 도안에 다시 들어갈 수 없습니다. 계정 로그인을 붙이면 해결됩니다.

## 구조

```
apps/web/               Next.js 앱. 화면, API, 변환 작업
packages/pattern-ir/    패턴 IR 타입과 스키마, 코 사전, 엔진이 펼친 결과의 타입
packages/engine/        코 수 검산, 게이지 재계산, 진행 위치 계산
packages/reader/        PDF 읽기: 글 꺼내기, LLM 구조화, 검산 되먹임, 응답 녹화와 재생
packages/render-chart/  기호 도안 (SVG)
packages/render-3d/     3D 형태 템플릿과 three.js 뷰어, 마네킹
packages/tutorials/     기호별 뜨는 법
fixtures/               직접 쓴 테스트 도안과 기대 결과
scripts/                읽기 결과 비교, 배포 주소 확인 스크립트
docs/PLAN.md            구현 계획서 사본
private/                실제 도안에서 나온 자료 (git 제외)
prototype/              프로토타입 소스와 화면 설계 (참고용, git 제외)
```

도안 하나는 JSON 문서(패턴 IR)로 저장하고, 엔진이 그 문서를 한 코씩 따라가며 단마다 코 수를 계산합니다.
기호 도안, 3D, 단계별 안내, 진행 표시는 모두 엔진이 펼친 같은 결과를 읽습니다.
진행 위치는 "단과 그 단에서 뜬 코 수"로만 저장하고, 진행률은 총 코 수에서 계산합니다.

바깥 서비스는 어댑터 뒤에 있습니다: 데이터베이스(`apps/web/src/server/db`, 로컬은 내장형 Postgres, 배포는 Postgres), 파일 저장(`storage.ts`),
변환 작업 실행(`convert.ts`), LLM(`packages/reader/src/llm.ts`), 로그인(`auth.ts`), 결제(`billing.ts`).

## 저작권

이 저장소에는 **직접 쓴 도안만** 둡니다 (`fixtures/`).
구매한 도안의 PDF, 그 내용에서 나온 데이터, 프로토타입의 도안 데이터는 `private/`와 `prototype/`에 두고 git에서 제외합니다.
그 폴더가 없으면 해당 자료를 쓰는 테스트는 건너뜁니다.
