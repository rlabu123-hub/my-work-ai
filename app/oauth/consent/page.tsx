"use client";
import { useEffect, useState } from "react";
import { browserDb, cloudConfigured } from "@/lib/supabase";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
export default function Consent() {
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(
      null,
    ),
    [error, setError] = useState(""),
    [write, setWrite] = useState(false),
    [busy, setBusy] = useState(false),
    [id, setId] = useState("");
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("authorization_id");
    if (!id || !cloudConfigured) {
      setError("OAuth 설정 또는 요청 ID가 없습니다.");
      return;
    }
    setId(id);
    void browserDb()
      .auth.oauth.getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (error) {
          setError("로그인 후 연결 요청을 다시 시작하세요. " + error.message);
          return;
        }
        if ("redirect_url" in data) {
          location.assign(data.redirect_url);
          return;
        }
        setDetails(data);
      });
  }, []);
  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const db = browserDb();
      if (approve && details) {
        const { error } = await db.from("mcp_grants").upsert(
          {
            user_id: details.user.id,
            client_id: details.client.id,
            can_read: true,
            can_write: write,
          },
          { onConflict: "user_id,client_id" },
        );
        if (error) throw error;
      }
      const { data, error } = await (approve
        ? db.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
        : db.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true }));
      if (error) throw error;
      location.assign(data.redirect_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login">
      <a className="brand" href="/">
        MY WORK <b>AI</b>
      </a>
      <h1>업무 데이터 연결</h1>
      {details && (
        <>
          <p>
            <strong>{details.client.name}</strong>에서 내 업무 데이터에
            접근하려고 합니다.
          </p>
          <p>
            읽기: 목표·프로젝트·업무·회의록 조회
            <br />
            쓰기: 변경을 제안할 수 있으며 실제 저장은 앱에서 승인해야 합니다.
            <br />
            OAuth 범위: {details.scope}
            <br />
            리디렉션: {details.redirect_uri}
          </p>
          <label className="consent">
            <input
              type="checkbox"
              checked={write}
              onChange={(e) => setWrite(e.target.checked)}
            />
            쓰기 제안도 허용합니다.
          </label>
          <div className="heading-actions">
            <button
              className="outline"
              disabled={busy}
              onClick={() => decide(false)}
            >
              거절
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => decide(true)}
            >
              읽기 및 선택한 권한 허용
            </button>
          </div>
        </>
      )}
      <p role="alert">{error}</p>
      <a href="/login" className="text-button">
        로그인 화면으로 →
      </a>
    </main>
  );
}
