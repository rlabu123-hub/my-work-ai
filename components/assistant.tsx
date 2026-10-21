"use client";
import { useState } from "react";
import { Sparkles, ArrowUp, Check, Loader2 } from "lucide-react";
import type { Data } from "@/lib/types";
import { rankedTasks, weeklyReview } from "@/lib/domain";
import { cloudConfigured } from "@/lib/supabase";
type Proposal = {
  operation: "create_task" | "update_task" | "complete_task";
  id: string;
  title: string;
  project_id: string | null;
  due_date: string | null;
};
type Message = {
  role: "user" | "assistant";
  text: string;
  proposal?: Proposal;
  confirmed?: boolean;
  cancelled?: boolean;
};
export default function Assistant({
  data,
  onRefresh,
  onError,
}: {
  data: Data;
  onRefresh: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false);
  async function send(text = input) {
    if (!text.trim() || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      if (!cloudConfigured) {
        const top = rankedTasks(data).slice(0, 3);
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text:
              "[로컬 규칙 기반 안내 · OpenAI 미연결]\n" +
              (text.includes("프로젝트")
                ? data.projects.map((p) => p.title).join("\n") ||
                  "등록된 프로젝트가 없습니다."
                : text.includes("리뷰") || text.includes("달성률")
                  ? weeklyReview(data)
                  : top
                      .map(
                        (r, i) =>
                          `${i + 1}. ${r.task.title} (P${r.level})\n${r.reason}`,
                      )
                      .join("\n\n") ||
                    "첫 업무를 등록하면 우선순위를 안내해 드립니다.") +
              "\n\n자연어 업무 변경과 AI 분석은 클라우드 로그인 및 OpenAI 설정 후 사용할 수 있습니다.",
          },
        ]);
        return;
      }
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chat", message: text }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMessages((m) => [
        ...m,
        { role: "assistant", text: out.message, proposal: out.proposal },
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : "AI 연결 실패");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "요청을 처리하지 못했습니다. 연결 설정을 확인해 주세요. 수동 업무 관리는 계속 사용할 수 있습니다.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(index: number) {
    setBusy(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "confirm",
          proposal: messages[index].proposal,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setMessages((m) =>
        m.map((v, i) => (i === index ? { ...v, confirmed: true } : v)),
      );
      await onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel assistant">
      <div className="assistant-intro">
        <span className="assistant-icon">
          <Sparkles size={25} />
        </span>
        <h2>함께 정리하면, 명확해집니다.</h2>
        <p>실제 업무 데이터를 바탕으로 오늘의 방향을 찾아보세요.</p>
        <small>
          클라우드 AI 사용 시 업무 제목·일정·중요도·목표 실적과 입력한 메시지가
          OpenAI로 전송됩니다.
        </small>
      </div>
      {!messages.length && (
        <div className="suggestion-grid">
          {[
            "오늘 내가 가장 먼저 해야 할 일은?",
            "현재 진행 중인 프로젝트를 정리해 줘.",
            "이번 주 목표 달성률을 분석해 줘.",
            "오늘 2시간 안에 끝낼 업무를 추천해 줘.",
          ].map((q) => (
            <button key={q} onClick={() => send(q)}>
              {q}
              <Sparkles size={14} />
            </button>
          ))}
        </div>
      )}
      <div className="messages" aria-live="polite">
        {messages.map((m, i) => (
          <div className={"message " + m.role} key={i}>
            <span>{m.role === "assistant" ? "MY WORK AI" : "나"}</span>
            <p>{m.text}</p>
            {m.proposal && (
              <div className="proposal">
                <strong>
                  {
                    {
                      create_task: "업무 추가",
                      update_task: "업무 수정",
                      complete_task: "완료 처리",
                    }[m.proposal.operation]
                  }{" "}
                  제안
                </strong>
                <p>
                  {m.proposal.title}
                  <br />
                  프로젝트:{" "}
                  {data.projects.find((p) => p.id === m.proposal?.project_id)
                    ?.title || "미지정"}
                  <br />
                  마감: {m.proposal.due_date || "확인 필요"}
                </p>
                {m.confirmed ? (
                  <span>
                    <Check size={14} />
                    저장됨
                  </span>
                ) : m.cancelled ? (
                  <span>취소됨</span>
                ) : (
                  <div className="heading-actions">
                    <button
                      className="primary"
                      disabled={busy}
                      onClick={() => confirm(i)}
                    >
                      확인하고 저장
                    </button>
                    <button
                      className="outline"
                      onClick={() =>
                        setMessages((ms) =>
                          ms.map((v, j) =>
                            i === j ? { ...v, cancelled: true } : v,
                          ),
                        )
                      }
                    >
                      취소
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <p className="muted">
            <Loader2 size={15} className="spin" />
            처리 중…
          </p>
        )}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          aria-label="AI에게 메시지"
          placeholder="오늘 어떤 일을 함께 정리할까요?"
          value={input}
          maxLength={4000}
          onChange={(e) => setInput(e.target.value)}
        />
        <button
          className="primary"
          disabled={busy || !input.trim()}
          aria-label="메시지 보내기"
        >
          <ArrowUp size={19} />
        </button>
      </form>
      <small className="chat-disclaimer">
        AI는 추천하고, 결정은 당신이 합니다. 변경 사항은 확인 후 저장됩니다.
      </small>
    </section>
  );
}
