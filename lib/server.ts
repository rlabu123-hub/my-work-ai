import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import OpenAI from "openai";
export async function serverDb() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new Error("Supabase 설정이 필요합니다.");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items) => {
          for (const { name, value, options } of items)
            jar.set(name, value, options);
        },
      },
    },
  );
}
export async function requireUser() {
  const db = await serverDb();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new Error("로그인이 필요합니다.");
  return { db, user };
}
export function ai() {
  const apiKey = process.env.WORK_AI_OPENAI_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey)
    throw new Error(
      "OpenAI API 키가 설정되지 않았습니다. 수동 업무 관리는 계속 사용할 수 있습니다.",
    );
  return new OpenAI({ apiKey });
}
export function apiError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "요청을 처리하지 못했습니다.";
  const status = message.includes("로그인")
    ? 401
    : message.includes("설정")
      ? 503
      : 400;
  return Response.json(
    {
      error:
        status === 400
          ? "요청 처리에 실패했습니다. 입력 또는 외부 서비스 연결 상태를 확인하세요."
          : message,
    },
    { status },
  );
}
