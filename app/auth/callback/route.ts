import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  emailCallbackDestination,
  emailCallbackOrigin,
} from "@/lib/email-auth";
export async function GET(request: NextRequest) {
  const origin = emailCallbackOrigin(
    request.nextUrl,
    request.headers.get("host"),
    {
      appUrl: process.env.APP_URL,
      productionHost: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      deploymentHost: process.env.VERCEL_URL,
    },
  );
  // Attach session cookies to the exact response returned after the code exchange.
  const response = NextResponse.redirect(new URL("/", origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const destination = await emailCallbackDestination(
    request.nextUrl,
    async (code) => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key)
        return { error: { code: "configuration_missing" }, hasSession: false };
      const db = createServerClient(url, key, {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (items) => {
            for (const { name, value, options } of items)
              response.cookies.set(name, value, options);
          },
        },
      });
      const { data, error } = await db.auth.exchangeCodeForSession(
        code,
        request.nextUrl.searchParams.has("sb_flow_id")
          ? { flowId: request.nextUrl.searchParams.get("sb_flow_id")! }
          : undefined,
      );
      return { error, hasSession: Boolean(data.session) };
    },
  );
  response.headers.set("Location", new URL(destination, origin).toString());
  return response;
}
