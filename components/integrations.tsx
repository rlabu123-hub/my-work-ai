"use client";
import { useCallback, useEffect, useState } from "react";
import { browserDb, cloudConfigured } from "@/lib/supabase";
import type { Data } from "@/lib/types";
import { Check, X, Unplug, RefreshCw } from "lucide-react";
type Grant = {
  id: string;
  client_id: string;
  can_read: boolean;
  can_write: boolean;
};
type Pending = {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
};
export default function Integrations({
  data,
  onRefresh,
  onError,
}: {
  data: Data;
  onRefresh: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [grants, setGrants] = useState<Grant[]>([]),
    [actions, setActions] = useState<Pending[]>([]),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!cloudConfigured) return;
    const db = browserDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return;
    const [gs, ps] = await Promise.all([
      db.from("mcp_grants").select("id,client_id,can_read,can_write"),
      db
        .from("pending_actions")
        .select("id,operation,payload,status,created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    if (gs.error || ps.error) {
      onError(
        "MCP 권한 테이블을 읽지 못했습니다. 두 번째 마이그레이션 적용 여부를 확인하세요.",
      );
      return;
    }
    setGrants(gs.data);
    setActions(ps.data);
  }, [onError]);
  useEffect(() => {
    void load();
    if (!cloudConfigured) return;
    const db = browserDb();
    const c = db
      .channel("mcp-actions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_actions" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void db.removeChannel(c);
    };
  }, [load]);
  async function resolve(id: string, approve: boolean) {
    if (approve && !confirm("표시된 변경을 실제 업무 데이터에 적용할까요?"))
      return;
    setBusy(true);
    try {
      const { error } = await browserDb().rpc("resolve_mcp_action", {
        action_id: id,
        approve,
      });
      if (error) throw error;
      await load();
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-card">
      <div className="section-heading">
        <h2>ChatGPT · MCP 연결</h2>
        <button className="text-button" onClick={load}>
          <RefreshCw size={13} />
          갱신
        </button>
      </div>
      <p>
        원격 MCP 엔드포인트: <code>/mcp</code>
        <br />
        공개 HTTPS 배포와 Supabase OAuth 2.1 설정이 필요합니다. 읽기와 쓰기 제안
        권한은 별도로 허용됩니다.
      </p>
      {grants.map((g) => (
        <div className="grant" key={g.id}>
          <code>{g.client_id}</code>
          <small>
            {g.can_read ? "읽기 허용" : "읽기 차단"} ·{" "}
            {g.can_write ? "쓰기 제안 허용" : "읽기 전용"}
          </small>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (!confirm("이 클라이언트의 모든 업무 접근 권한을 해제할까요?"))
                return;
              setBusy(true);
              const { error } = await browserDb()
                .from("mcp_grants")
                .delete()
                .eq("id", g.id);
              if (error) onError(error.message);
              else {
                const revoked = await browserDb().auth.oauth.revokeGrant({
                  clientId: g.client_id,
                });
                if (revoked.error)
                  onError(
                    "앱 접근은 차단했습니다. OAuth 토큰 폐기는 Supabase에서 확인하세요.",
                  );
                await load();
              }
              setBusy(false);
            }}
          >
            <Unplug size={14} />
            권한 해제
          </button>
        </div>
      ))}
      {!grants.length && (
        <p className="muted">
          허용된 MCP 연결이 없습니다. 연결 절차는 docs/chatgpt.md를 확인하세요.
        </p>
      )}
      <h3>
        확인할 변경 요청 <span className="pill">{actions.length}</span>
      </h3>
      {actions.map((a) => (
        <div className="pending-action" key={a.id}>
          <strong>
            {
              (
                {
                  create_task: "업무 추가",
                  update_task: "업무 수정",
                  complete_task: "업무 완료",
                  create_goal: "목표 추가",
                } as Record<string, string>
              )[a.operation]
            }
          </strong>
          {typeof a.payload.task_id === "string" && (
            <p>
              대상 업무:{" "}
              {data.tasks.find((t) => t.id === a.payload.task_id)?.title ||
                String(a.payload.task_id)}
            </p>
          )}
          <pre>{JSON.stringify(a.payload, null, 2)}</pre>
          <small>
            {new Date(a.created_at).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            · 24시간 내 승인
          </small>
          <div className="heading-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => resolve(a.id, true)}
            >
              <Check size={14} />
              확인하고 적용
            </button>
            <button
              className="outline"
              disabled={busy}
              onClick={() => resolve(a.id, false)}
            >
              <X size={14} />
              거절
            </button>
          </div>
        </div>
      ))}
      {!actions.length && (
        <p className="muted">
          대기 중인 변경이 없습니다. MCP 쓰기 요청은 자동 저장되지 않습니다.
        </p>
      )}
    </section>
  );
}
