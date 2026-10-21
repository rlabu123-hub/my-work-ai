import { createClient } from "@supabase/supabase-js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const base = process.env.APP_URL;
  if (
    !base ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    return Response.json(
      { error: "MCP 서버 설정이 필요합니다." },
      { status: 503 },
    );
  const challenge = `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource/mcp"`;
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/i)?.[1];
  if (!token)
    return Response.json(
      { error: "인증이 필요합니다." },
      { status: 401, headers: { "WWW-Authenticate": challenge } },
    );
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(base).origin
  )
    return Response.json(
      { error: "허용되지 않은 Origin입니다." },
      { status: 403 },
    );
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  // getClaims validates signatures through Supabase JWKS; never trust decoded JWT data alone.
  const { data, error } = await db.auth.getClaims(token);
  const claims = data?.claims;
  if (
    error ||
    !claims ||
    !claims.sub ||
    typeof claims.client_id !== "string" ||
    claims.iss !== process.env.NEXT_PUBLIC_SUPABASE_URL + "/auth/v1" ||
    !(
      Array.isArray(claims.aud) &&
      claims.aud.includes("authenticated") &&
      claims.aud.includes(base + "/mcp")
    )
  )
    return Response.json(
      { error: "유효한 OAuth 접근 토큰이 필요합니다." },
      { status: 401, headers: { "WWW-Authenticate": challenge } },
    );
  const { data: grant, error: grantError } = await db
    .from("mcp_grants")
    .select("can_read,can_write")
    .eq("user_id", claims.sub)
    .eq("client_id", claims.client_id)
    .single();
  if (grantError || !grant?.can_read)
    return Response.json(
      { error: "앱에서 읽기 권한을 허용해야 합니다." },
      { status: 403 },
    );
  const server = createMcpServer(
    db,
    claims.sub,
    claims.client_id,
    grant.can_write,
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
