// Only bounded, non-sensitive error labels may reach the URL or UI.
export const emailAuthMessages: Record<string, string> = {
  link_expired:
    "이 로그인 링크는 만료됐거나 이미 사용되었습니다. 아래에서 새 메일을 요청하고 가장 최신 링크를 한 번만 열어 주세요.",
  browser_mismatch:
    "로그인을 요청한 브라우저의 확인 정보가 없거나 다른 요청으로 바뀌었습니다. 지금 이 브라우저에서 새 메일을 요청한 뒤, 가장 최신 링크를 같은 브라우저에서 열어 주세요.",
  missing_code:
    "로그인 확인 코드가 전달되지 않았습니다. 메일의 전체 로그인 링크를 열었는지 확인하고, 필요하면 새 메일을 요청하세요.",
  configuration:
    "로그인 서버 설정을 확인할 수 없습니다. 관리자에게 Supabase 환경 변수 설정을 확인해 달라고 요청하세요.",
  callback:
    "이메일 로그인 확인을 완료하지 못했습니다. 아래에서 새 메일을 요청해 다시 시도하세요. 계속 실패하면 관리자에게 이 메시지를 알려 주세요.",
};
type AuthFailure = { code?: string; name?: string };
export function authFailureReason(
  error: AuthFailure | null | undefined,
): string {
  if (
    ["pkce_code_verifier_not_found", "bad_code_verifier"].includes(
      error?.code || "",
    ) ||
    error?.name === "AuthPKCECodeVerifierMissingError"
  )
    return "browser_mismatch";
  if (
    ["otp_expired", "flow_state_not_found", "flow_state_expired"].includes(
      error?.code || "",
    )
  )
    return "link_expired";
  if (error?.code === "configuration_missing") return "configuration";
  return "callback";
}
export async function emailCallbackDestination(
  url: URL,
  exchange: (
    code: string,
  ) => Promise<{ error: AuthFailure | null; hasSession: boolean }>,
): Promise<string> {
  if (url.searchParams.has("error") || url.searchParams.has("error_code"))
    return (
      "/login?error=" +
      authFailureReason({ code: url.searchParams.get("error_code") || "" })
    );
  const code = url.searchParams.get("code");
  if (!code) return "/login?error=missing_code";
  try {
    const result = await exchange(code);
    if (!result.error && result.hasSession) return "/";
    return "/login?error=" + authFailureReason(result.error);
  } catch {
    return "/login?error=callback";
  }
}

export function emailCallbackOrigin(
  requestUrl: URL,
  host: string | null,
  config: {
    appUrl?: string;
    productionHost?: string;
    deploymentHost?: string;
  } = {},
): string {
  // Configuration comes from the app owner or Vercel, never an arbitrary forwarded host.
  for (const value of [
    config.appUrl,
    config.productionHost ? `https://${config.productionHost}` : undefined,
    config.deploymentHost ? `https://${config.deploymentHost}` : undefined,
  ]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password)
        return url.origin;
    } catch {
      /* fall back to the next trusted origin */
    }
  }
  const loopback = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);
  if (loopback.has(requestUrl.hostname) && host) {
    try {
      const local = new URL(`${requestUrl.protocol}//${host}`);
      if (loopback.has(local.hostname)) return local.origin;
    } catch {
      /* invalid Host is ignored */
    }
  }
  return requestUrl.origin;
}
