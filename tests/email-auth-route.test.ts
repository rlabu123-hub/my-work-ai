import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../app/auth/callback/route";

test("real callback and Supabase SDK attach session cookies to the redirect response", async () => {
  const priorUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const priorKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const priorFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  try {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const jwt =
      [
        { alg: "HS256", typ: "JWT" },
        {
          sub: "00000000-0000-4000-8000-000000000001",
          exp,
          aud: "authenticated",
        },
      ]
        .map((v) => Buffer.from(JSON.stringify(v)).toString("base64url"))
        .join(".") + ".test-signature";
    globalThis.fetch = async (input, init) => {
      assert.match(
        String(input),
        /^https:\/\/auth-test\.supabase\.co\/auth\/v1\/token/,
      );
      const body = JSON.parse(String(init?.body));
      assert.equal(body.auth_code, "test-code");
      assert.equal(body.code_verifier, "test-verifier");
      return Response.json({
        access_token: jwt,
        refresh_token: "test-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          aud: "authenticated",
          role: "authenticated",
        },
      });
    };
    const request = new NextRequest(
      "https://work.example/auth/callback?code=test-code&sb_flow_id=testflow123",
      {
        headers: {
          cookie:
            "sb-auth-test-auth-token-code-verifier=" +
            encodeURIComponent(JSON.stringify("another-request-verifier")) +
            "; sb-auth-test-auth-token-flow-testflow123-code-verifier=" +
            encodeURIComponent(JSON.stringify("test-verifier")),
        },
      },
    );
    const response = await GET(request);
    assert.equal(response.headers.get("location"), "https://work.example/");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(
      response.cookies
        .getAll()
        .some(
          (c) =>
            c.name.startsWith("sb-auth-test-auth-token") &&
            !c.name.includes("code-verifier") &&
            Boolean(c.value),
        ),
    );
  } finally {
    globalThis.fetch = priorFetch;
    if (priorUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = priorUrl;
    if (priorKey === undefined)
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = priorKey;
  }
});
