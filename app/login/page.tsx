"use client";
import { useEffect, useState } from "react";
import { emailAuthMessages } from "@/lib/email-auth";
import { browserDb, cloudConfigured } from "@/lib/supabase";
export default function Login() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [callbackError, setCallbackError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    const reason = url.searchParams.get("error");
    if (reason)
      setCallbackError(emailAuthMessages[reason] || emailAuthMessages.callback);
  }, []);
  return (
    <main className="login">
      <a className="brand" href="/">
        MY WORK <b>AI</b>
      </a>
      <h1>좋은 하루의 시작.</h1>
      <p>이메일로 로그인하고 모든 기기에서 업무를 이어가세요.</p>
      {callbackError && (
        <div className="error" role="alert">
          {callbackError}
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMessage("");
          setCallbackError("");
          try {
            if (!cloudConfigured)
              throw new Error(
                "Supabase 설정이 필요합니다. 현재는 홈에서 로컬 체험 모드를 사용할 수 있습니다.",
              );
            const { error } = await browserDb().auth.signInWithOtp({
              email,
              options: { emailRedirectTo: location.origin + "/auth/callback" },
            });
            if (error) throw error;
            setSent(true);
            setMessage(
              "새 로그인 메일을 보냈습니다. 가장 최신 메일의 링크를 지금 이 브라우저에서 열어 주세요. 다시 요청하면 이전 메일 대신 새 메일을 사용해야 합니다.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "로그인 실패");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          이메일
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy
            ? "전송 중…"
            : sent
              ? "새 로그인 메일 다시 받기"
              : "이메일 로그인 링크 받기"}
        </button>
      </form>
      <p role="status">{message}</p>
      <small>ChatGPT 로그인 및 구독과 별개의 계정입니다.</small>
    </main>
  );
}
