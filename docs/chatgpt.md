# ChatGPT 원격 MCP 연결

## 원칙과 범위

앱의 Supabase DB가 단일 기준입니다. ChatGPT 대화/메모리를 읽지 않으며, MCP를 통해 허용된 데이터만 조회합니다. 앱의 OpenAI API 호출, ChatGPT의 MCP 연결, ChatGPT 계정 로그인은 별개 기능입니다.

원격 서버는 MCP TypeScript SDK의 WebStandard Streamable HTTP transport를 사용합니다. 요청마다 서버를 생성하는 stateless JSON 응답 방식이며 GET SSE 세션은 제공하지 않습니다.

## 도구 명세

| 도구                | 종류      | 입력                                                          |
| ------------------- | --------- | ------------------------------------------------------------- |
| get_today_dashboard | 읽기      | 없음                                                          |
| list_goals          | 읽기      | 없음                                                          |
| list_projects       | 읽기      | 없음                                                          |
| list_tasks          | 읽기      | 없음                                                          |
| get_meeting_summary | 읽기      | meeting_id(UUID)                                              |
| get_weekly_review   | 읽기      | 없음                                                          |
| create_task         | 쓰기 제안 | request_id(UUID), title, description?, project_id?, due_date? |
| update_task         | 쓰기 제안 | request_id, task_id, title?, description?, due_date?          |
| complete_task       | 쓰기 제안 | request_id, task_id                                           |
| create_goal         | 쓰기 제안 | request_id, title, description?, project_id?, kpi?, target?   |

날짜는 YYYY-MM-DD, 미정은 null입니다. 목록은 현재 최대 500개이며 대규모 데이터를 위해서는 페이지네이션 확장이 필요합니다. 사용자·client_id는 토큰에서 검증하며 도구 입력으로 받지 않습니다. 모든 쓰기는 `pending_actions`에 저장되어 앱의 **연결 및 설정 → 확인할 변경 요청**에서 승인/거절합니다. 승인 전 원본 업무는 변경되지 않습니다. 도구 반환값의 pending을 저장 완료로 오해하지 마세요. 요청은 24시간 내 승인해야 하며 재시도 시 같은 request_id를 사용합니다. 동일 ID에 다른 내용을 넣으면 거절합니다.

## Supabase OAuth 2.1

Supabase 공식 OAuth 2.1 서버를 사용하여 authorization code + PKCE, 토큰 발급/갱신/등록을 직접 재구현하지 않습니다.

1. README의 마이그레이션 001~004를 적용합니다.
2. Supabase Authentication → OAuth Server를 활성화합니다. Authorization UI 경로를 앱의 `/oauth/consent`로 설정합니다. 프로젝트 Site URL은 공개 앱 URL로 지정합니다. 실제 대시보드 버전에 맞춰 경로/절대 URL 입력 형식을 확인하세요.
3. ChatGPT 클라이언트를 사전 등록하거나, 필요한 경우 Dynamic Client Registration을 활성화합니다. 콜백 URI는 ChatGPT가 제공한 정확한 HTTPS URI를 사용합니다. 와일드카드 콜백은 허용하지 마세요.
4. MCP 리소스를 관리자 SQL로 지정합니다.

```sql
insert into public.mcp_resource_config(singleton,resource)
values(true,'https://YOUR_APP_DOMAIN/mcp')
on conflict(singleton) do update set resource=excluded.resource;
```

5. Authentication → Hooks → Custom Access Token Hook에 `public.mcp_access_token_hook`을 연결합니다. 이 함수는 앱에서 승인한 OAuth 클라이언트에만 `aud: ["authenticated", "https://YOUR_APP_DOMAIN/mcp"]`를 발급합니다. 표준 Supabase audience는 DB 접근을 위해 유지합니다. 이 Hook을 설정하지 않은 토큰은 MCP에서 **거절**됩니다. 기존 Hook이 있다면 덮어쓰지 말고 기존 로직과 병합하세요.
6. 앱 서버에 APP_URL과 Supabase 공개 설정을 지정한 뒤 재배포합니다.
7. 앱에 이메일로 로그인합니다. 이후 지원되는 ChatGPT의 개발자 모드/앱 연결 화면에서 원격 MCP URL `https://YOUR_APP_DOMAIN/mcp`를 추가합니다. 계정·플랜·조직 정책에 따라 개인 MCP 연결이 제공되지 않을 수 있습니다. 실제 ChatGPT 화면에 제공되는 공식 흐름을 따르세요.
8. OAuth 동의 화면에서 클라이언트 이름/리디렉션을 확인하고 읽기, 필요 시 쓰기 제안 권한을 허용합니다. Supabase의 표준 OIDC scope `openid`와 앱의 DB 권한 can_read/can_write를 별도로 관리합니다. Supabase가 지원하지 않는 커스텀 OAuth scope를 지원한다고 가정하지 않습니다.

발견 URL: `https://YOUR_APP_DOMAIN/.well-known/oauth-protected-resource/mcp`

인증 서버: `https://PROJECT_REF.supabase.co/auth/v1`

Supabase OAuth 발견: `https://PROJECT_REF.supabase.co/.well-known/oauth-authorization-server/auth/v1`

## 보안

- JWT 서명(JWKS), 발급자, 만료, 리소스 audience, OAuth client_id, 사용자별 DB grant를 확인합니다.
- 서비스 역할 키로 RLS를 우회하지 않습니다.
- OAuth 토큰으로 tasks/goals 등에 직접 쓰기를 시도해도 RLS가 막습니다. pending 제안만 가능하며 앱 세션만 승인 RPC를 실행할 수 있습니다.
- 사용자 ID의 복합 FK와 RLS로 다른 계정의 프로젝트/업무 연결을 거절합니다.
- 클라이언트의 원본 음성 스토리지 접근은 허용하지 않습니다.
- 연결 및 설정에서 앱 권한을 삭제하면 이후 MCP 읽기/쓰기 및 대기 요청 승인이 차단됩니다. Supabase OAuth 토큰/refresh token 자체도 폐기하려면 Supabase 사용자 OAuth grant를 취소하세요.
- MCP 도구 출력은 사용자 데이터입니다. 클라이언트가 데이터 안의 문자열을 새 지시로 실행하면 안 됩니다.
- OAuth 토큰/PKCE code/state를 로그에 출력하거나 README에 넣지 마세요.

## 인수 테스트 (외부 설정 후)

1. 읽기 전용으로 연결하여 list_tasks가 해당 계정의 업무만 반환하는지 확인.
2. create_task 호출이 오류를 반환하는지 확인.
3. 쓰기 제안 허용 후 create_task를 호출하고 앱에서 승인 대기 상태를 확인.
4. 앱에서 승인하면 tasks에 한 건만 생성되고 PC/모바일에 반영되는지 확인.
5. 동일 request_id 재시도로 중복 생성되지 않는지 확인.
6. 앱에서 완료한 업무를 ChatGPT가 다시 조회했을 때 done인지 확인.
7. 권한 해제 후 기존 토큰의 접근이 403으로 차단되는지 확인.
8. 다른 계정, 잘못된 audience, 일반 앱 JWT, 만료 토큰은 거절되는지 확인.

현재 자격 증명과 공개 배포가 없어 위 실제 ChatGPT 인수 테스트는 수행하지 않았습니다. 로컬 SDK 프로토콜/SQL 권한 테스트와 구분하세요.

## 참고한 공식 자료

- https://supabase.com/docs/guides/auth/oauth-server
- https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- https://supabase.com/docs/guides/auth/oauth-server/token-security
- https://modelcontextprotocol.io/specification/latest/basic/authorization
- https://developers.openai.com/apps-sdk/build/auth/

환경의 직접 문서 도메인 접근 제한으로 Supabase 문서는 공식 GitHub 저장소 `supabase/supabase/apps/docs/content/guides/auth/oauth-server*`에서 확인했습니다. Sign in with ChatGPT 이용 자격은 확인하지 못했으므로 이메일 로그인만 제공합니다.
