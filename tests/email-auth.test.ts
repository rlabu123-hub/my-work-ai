import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emailCallbackDestination,
  emailAuthMessages,
  emailCallbackOrigin,
} from "../lib/email-auth";
const url = (query: string) =>
  new URL("https://work.example/auth/callback" + query);
test("successful PKCE exchange requires a real session", async () => {
  assert.equal(
    await emailCallbackDestination(url("?code=test-code"), async (code) => {
      assert.equal(code, "test-code");
      return { error: null, hasSession: true };
    }),
    "/",
  );
  assert.equal(
    await emailCallbackDestination(url("?code=test-code"), async () => ({
      error: null,
      hasSession: false,
    })),
    "/login?error=callback",
  );
});
test("expired mail is classified without consuming another authorization code", async () => {
  let calls = 0;
  assert.equal(
    await emailCallbackDestination(
      url(
        "?error=access_denied&error_code=otp_expired&error_description=private-value",
      ),
      async () => {
        calls++;
        return { error: null, hasSession: true };
      },
    ),
    "/login?error=link_expired",
  );
  assert.equal(calls, 0);
});
test("missing or replaced browser verifier gets an actionable error", async () => {
  for (const code of ["pkce_code_verifier_not_found", "bad_code_verifier"])
    assert.equal(
      await emailCallbackDestination(url("?code=test-code"), async () => ({
        error: { code },
        hasSession: false,
      })),
      "/login?error=browser_mismatch",
    );
  assert.match(emailAuthMessages.browser_mismatch, /같은 브라우저/);
});
test("missing code and failed exchange never create a success redirect", async () => {
  assert.equal(
    await emailCallbackDestination(url(""), async () => {
      throw new Error("not called");
    }),
    "/login?error=missing_code",
  );
  assert.equal(
    await emailCallbackDestination(url("?code=private-code"), async () => {
      throw new Error("private response");
    }),
    "/login?error=callback",
  );
});

test("callback redirects use the public Vercel domain instead of internal localhost", () => {
  assert.equal(
    emailCallbackOrigin(url(""), "attacker.example", {
      productionHost: "work.vercel.app",
    }),
    "https://work.vercel.app",
  );
  assert.equal(
    emailCallbackOrigin(
      new URL("http://localhost:3000/auth/callback"),
      "127.0.0.1:3000",
    ),
    "http://127.0.0.1:3000",
  );
  assert.equal(
    emailCallbackOrigin(url(""), "attacker.example"),
    "https://work.example",
  );
});
