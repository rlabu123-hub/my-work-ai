# MY WORK AI

한국어 개인 업무 관리 앱. Next.js App Router · React · TypeScript · Tailwind CSS · Supabase · OpenAI Responses/Transcriptions · MCP TypeScript SDK.

**현재 상태:** 실행 가능한 앱과 외부 서비스 연결 코드를 구현했습니다. 기본 실행은 **로컬 체험 모드**입니다. Supabase/OpenAI 자격 증명이 없는 환경에서 실제 클라우드 동기화·AI·ChatGPT 연결을 검증했다고 주장하지 않습니다. 자세한 검증/미구현 목록은 [테스트 결과](docs/testing.md)를 확인하세요.

## 실행

Node.js 22 이상을 사용합니다. lockfile을 커밋했으므로 `npm ci`로 설치하세요.

```bash
cd /workspace/my-work-ai
npm ci --cache /workspace/.npm-cache
cp .env.example .env.local
npm run dev
```

개인 PC에서는 캐시 옵션을 생략할 수 있습니다. 브라우저에서 포트 3000을 엽니다. `npm run build && npm start`로 프로덕션 실행합니다. 개발 서버와 빌드를 동시에 실행하지 마세요.

환경 변수가 없으면 브라우저 저장소에 데이터가 저장됩니다. 동일 브라우저의 탭은 storage 이벤트로 동기화되지만 PC와 스마트폰 사이에서는 공유되지 않습니다. 업무 내보내기로 백업할 수 있으며 샘플 데이터는 사용자가 버튼을 눌렀을 때만 추가됩니다. 로컬 데이터를 클라우드에 자동 업로드하지 않습니다.

## Supabase 설정

1. Supabase 프로젝트 생성 후 SQL Editor에서 다음 파일을 순서대로 **한 번씩** 실행합니다.
   - `supabase/migrations/001_initial.sql`: 데이터 모델, 사용자별 RLS, Realtime, private recordings 버킷.
   - `002_mcp_permissions.sql`: 클라이언트별 권한, 확인 대기 요청, 트랜잭션 승인 함수.
   - `003_oauth_audience.sql`: MCP 리소스 전용 audience를 발급하는 OAuth Hook.
   - `004_dependencies.sql`: 선행 업무 저장 트랜잭션, 순환 참조 방지.
2. `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 설정합니다. anon/publishable 키만 사용하며 service-role 키는 필요하지 않습니다.
3. Authentication에서 이메일 로그인을 활성화하고 Site URL 및 Redirect URLs에 실제 앱 URL과 `https://앱도메인/auth/callback`을 등록합니다. 로컬 개발 콜백도 별도로 등록합니다. 메일 전송은 운영용 SMTP를 권장합니다.
4. 서버를 재시작합니다. 앱의 이메일 로그인에서 받은 링크를 **요청한 브라우저**로 열어 PKCE 인증을 완료합니다.
5. 로그인한 PC와 스마트폰에서 같은 계정을 사용합니다. 한쪽에서 업무를 추가/완료하고 다른 쪽의 반영을 확인합니다.
6. Supabase Realtime의 publication에 SQL에서 지정한 테이블이 포함되어 있는지 확인합니다.

모든 데이터 테이블은 사용자별 RLS가 적용됩니다. 프로젝트/목표/업무의 복합 FK가 다른 사용자 데이터와의 연결을 막습니다. 음성은 `recordings/<user-id>/...` 경로의 비공개 버킷에 저장하고 짧은 유효기간의 signed URL로 재생합니다. 기본 public bucket으로 바꾸지 마세요.

## OpenAI 연결

서버 환경에 `OPENAI_API_KEY`를 안전하게 설정하세요. Codex 클라우드 설정에서는 플랫폼이 `OPENAI_` 접두사의 secret target을 예약하므로 별칭 `WORK_AI_OPENAI_KEY`를 사용합니다. 서버는 이 별칭을 우선 읽습니다. 두 변수에 다른 키를 동시에 설정하지 마세요. 키를 채팅, Git, 클라이언트 코드 또는 `NEXT_PUBLIC_*` 변수에 넣지 마세요.

- `OPENAI_MODEL`: 기본 `gpt-4.1-mini` (프로젝트에서 이용 가능한 Responses API 모델로 변경 가능).
- `OPENAI_TRANSCRIPTION_MODEL`: 기본 `gpt-4o-transcribe`. 요청서의 `gpt-transcribe`라는 모델명을 유효하다고 가정하지 않고 SDK 지원 모델명을 사용했습니다. 실제 접근 권한은 본인 OpenAI 프로젝트에서 확인하세요.
- ChatGPT 구독과 OpenAI API 요금은 별도입니다.
- AI 채팅은 로그인 사용자의 DB 데이터를 서버에서 조회합니다. 도구 호출은 **변경 제안**을 만들고 사용자가 확인해야 저장됩니다.
- 순위 분석은 수동 우선순위를 덮어쓰지 않습니다. 키 미설정 시 규칙 기반 추천과 수동 업무 관리는 계속 동작합니다.
- 제목·프로젝트·목표 실적·일정 등 분석에 필요한 필드만 전송합니다. 음성/녹취 전송은 별도 확인합니다. Responses 요청은 `store:false`입니다. 이는 OpenAI의 모든 로그 보존을 비활성화한다는 뜻은 아닙니다.

### 녹음 및 회의록

HTTPS 또는 로컬 호스트에서 마이크 권한과 참석자의 동의를 확인하고 시작합니다. 시작/일시정지/재개/종료, 다운로드, 업로드, 재생, 녹취 편집, 회의록 저장·검색·삭제·Markdown 내보내기를 제공합니다. 화면이 숨겨지면 녹음을 일시정지합니다. iOS 잠금/백그라운드 녹음을 보장하지 않습니다. 브라우저를 닫기 전 파일을 저장하세요.

24MB 이하만 처리하며 약 22MB에 도달하면 녹음을 종료합니다. **긴 파일 자동 분할은 미구현**입니다. 원본 음성과 텍스트 기록은 각각 삭제할 수 있습니다. 회의 실행 과제는 업무 추가 폼에서 사용자가 프로젝트·마감 등을 확인한 뒤 등록합니다.

Vercel Functions의 요청 본문 한도는 API의 24MB 제한보다 작을 수 있습니다. 현재 `/api/transcribe`는 직접 multipart 업로드 방식이므로 Vercel에서 큰 파일 전사를 사용하려면 private Storage 직접 업로드 + 비동기 작업자/분할 처리로 확장해야 합니다. 현재 버전을 대용량 전사 서비스로 배포하지 마세요.

## ChatGPT 연동

[MCP 및 OAuth 설정 가이드](docs/chatgpt.md)를 따르세요. 원격 엔드포인트는 `/mcp`이며 앱과 같은 DB/RLS를 사용합니다. 기존 ChatGPT 대화나 메모리를 가져오지 않습니다. 연결은 지원되는 ChatGPT 환경의 앱/커넥터 기능과 공개 HTTPS 배포가 필요합니다.

ChatGPT 계정 로그인은 구현하지 않았습니다. 현재 환경에서 공식 Sign in with ChatGPT 등록 자격/승인을 확인할 수 없으므로 가짜 로그인 대신 Supabase 이메일 로그인을 제공합니다.

## 배포

1. 코드를 본인의 GitHub 저장소에 커밋/푸시합니다. 이 작업에서 원격 푸시나 배포는 수행하지 않았습니다.
2. Vercel에서 Next.js 프로젝트로 가져옵니다. Node.js 22 이상, 빌드 `npm run build`를 사용합니다.
3. `.env.example`의 변수를 Vercel 프로젝트 설정에 입력하고 `APP_URL`은 마지막 `/` 없이 공개 HTTPS 앱 URL로 지정합니다. 공개 Supabase 변수는 빌드 시 포함되므로 수정 후 재배포하세요.
4. Supabase에 SQL, 이메일 리디렉션, MCP OAuth 설정을 적용합니다.
5. [실서비스 인수 테스트](docs/testing.md)를 실제 두 계정/기기에서 실행합니다. 인증되지 않은 API는 거절되어야 합니다.

현재 공개 배포, Supabase 프로젝트 생성 및 외부 비용 발생 작업은 수행하지 않았습니다. 클라우드 환경 설정 초안에 설치·시작 지침, 필요한 환경 변수 이름과 OpenAI 키 요구사항 및 접속 도메인을 저장했습니다. 초안 저장은 실행 환경 적용이나 게시가 아닙니다. 환경 설정에서 값을 안전하게 입력하고 검토·저장한 뒤 환경을 게시하세요.

허용 도메인 추가: `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, `storage.googleapis.com`(브라우저 설치), `api.openai.com`, `*.supabase.co`(서비스), `developers.openai.com`, `supabase.com`(공식 문서). 기존 패키지 관리자 preset은 유지했습니다.

## 프로젝트 구조

```text
app/                       Next.js 화면, API, 인증 콜백
  api/ai/                  Responses API, 함수 호출 제안 및 확정
  api/transcribe/          한국어 음성 전사
  mcp/                     Stateless Streamable HTTP MCP
  oauth/consent/           OAuth 동의와 앱 권한 선택
  .well-known/             OAuth protected resource metadata
components/                반응형 업무 공간, 채팅, 녹음, 연결 승인
lib/                       데이터 타입, 우선순위/리뷰, Supabase, MCP 도구
supabase/migrations/       SQL 모델, RLS, Storage, Realtime, OAuth
public/                    PWA manifest 및 아이콘
 tests/                    도메인, PostgreSQL/RLS, Playwright 테스트
```

## 검증

브라우저 테스트는 Supabase 환경 변수가 없는 로컬 체험 전용입니다. 실서비스 계정/데이터를 대상으로 실행하지 마세요.

```bash
npm test
npm run typecheck
npm run build
# 로컬 Chromium이 있는 클라우드 환경
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
# 개인 PC
npx playwright install chromium
npm run test:e2e
```

실행 결과와 미완료 요구사항은 [docs/testing.md](docs/testing.md)에 기록합니다.
