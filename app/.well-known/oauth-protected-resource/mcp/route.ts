export async function GET() {
  const base = process.env.APP_URL,
    supabase = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !supabase)
    return Response.json(
      { error: "OAuth 설정이 필요합니다." },
      { status: 503 },
    );
  return Response.json(
    {
      resource: base + "/mcp",
      authorization_servers: [supabase + "/auth/v1"],
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
      resource_name: "MY WORK AI",
      resource_documentation: base,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
