"use client";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Check,
  Clock,
  CalendarDays,
  LayoutDashboard,
  FolderKanban,
  Target,
  Sparkles,
  Mic,
  Settings,
  Search,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  PanelLeftClose,
  CheckCheck,
  Flag,
  Download,
  Trash2,
  X,
  GripVertical,
  Play,
  RefreshCw,
  LogOut,
  Cloud,
  ChevronDown,
} from "lucide-react";
import { useWorkspace } from "@/lib/use-workspace";
import { cloudConfigured, browserDb } from "@/lib/supabase";
import { rankedTasks, seoulDate, priority, weeklyReview } from "@/lib/domain";
import {
  type Task,
  type Project,
  type Goal,
  type Schedule,
  type Data,
  statusLabels,
  emptyData,
} from "@/lib/types";
import Recorder from "./recorder";
import Assistant from "./assistant";
import Integrations from "./integrations";
import Reminders from "./reminders";
const tabs = [
  { id: "today", label: "Today", icon: LayoutDashboard },
  { id: "tasks", label: "오늘의 할 일", icon: CheckCheck },
  { id: "projects", label: "프로젝트", icon: FolderKanban },
  { id: "goals", label: "목표", icon: Target },
  { id: "calendar", label: "캘린더", icon: CalendarDays },
  { id: "ai", label: "AI 업무 비서", icon: Sparkles },
  { id: "record", label: "녹음 · 회의록", icon: Mic },
  { id: "review", label: "업무 리뷰", icon: Flag },
];
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export default function Workspace() {
  const w = useWorkspace();
  const { data, ready, error, setError, user, synced, busy, mutate } = w;
  const [tab, setTab] = useState("today"),
    [now, setNow] = useState<Date | null>(null),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [editor, setEditor] = useState<{
      kind: "tasks" | "projects" | "goals" | "schedules";
      row?: Record<string, unknown>;
    } | null>(null),
    [drag, setDrag] = useState<string | null>(null),
    [available, setAvailable] = useState(480),
    [aiRanks, setAiRanks] = useState<
      { task_id: string; priority: number; reason: string }[]
    >([]),
    [analyzing, setAnalyzing] = useState(false),
    [calendarMode, setCalendarMode] = useState("week"),
    [calendarOffset, setCalendarOffset] = useState(0),
    [reviewDays, setReviewDays] = useState(7);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const today = now ? seoulDate(now) : "";
  const taskSignature = JSON.stringify(data.tasks);
  useEffect(() => setAiRanks([]), [taskSignature]);
  const ranked = rankedTasks(data, available).sort((a, b) => {
    const aa = aiRanks.find((r) => r.task_id === a.task.id),
      bb = aiRanks.find((r) => r.task_id === b.task.id);
    return (
      (a.task.manual_priority ?? aa?.priority ?? a.level) -
        (b.task.manual_priority ?? bb?.priority ?? b.level) ||
      (aa ? -1 : 0) - (bb ? -1 : 0) ||
      b.score - a.score
    );
  });
  const due = data.tasks.filter((t) => t.due_date === today);
  const overdue = data.tasks.filter(
    (t) => t.status !== "done" && t.due_date && t.due_date < today,
  );
  const done = due.filter((t) => t.status === "done").length;
  const completion = due.length ? Math.round((done / due.length) * 100) : 0;
  const currentTitle = tabs.find((t) => t.id === tab)?.label ?? "연결 및 설정";
  const openTask = (task?: Task) =>
    setEditor({
      kind: "tasks",
      row: task as unknown as Record<string, unknown> | undefined,
    });
  async function sample() {
    if (data.projects.length || data.tasks.length) {
      if (!confirm("현재 데이터에 샘플 프로젝트와 업무를 추가할까요?")) return;
    }
    const names = [
      "일본 HAL 플랫폼 전면 리뉴얼",
      "일본 디지털 채널 운영 및 MCM 전략",
      "조직이식결과기록지 앱 고도화",
      "글로벌 인콰이어리 관리",
      "마케팅팀 KPI 관리 및 성과 분석",
    ];
    for (const [i, title] of names.entries()) {
      const id = crypto.randomUUID();
      if (
        !(await mutate("projects", {
          id,
          title,
          description: "샘플 프로젝트 · 자유롭게 수정하거나 삭제하세요.",
          due_date: today,
          status: "doing",
        }))
      )
        return;
      await mutate("tasks", {
        ...taskDefaults(),
        id: crypto.randomUUID(),
        title: [
          "리뉴얼 핵심 요구사항 정리",
          "디지털 채널 운영 지표 검토",
          "앱 개선 요구사항 우선순위 정리",
          "인콰이어리 현황 확인",
          "이번 주 KPI 실적 업데이트",
        ][i],
        project_id: id,
        due_date: today,
        importance: i === 0 ? 5 : 3,
        urgency: i === 0 ? 5 : 3,
        position: i,
      });
    }
  }
  async function analyze() {
    setAnalyzing(true);
    setError("");
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "priorities",
          availableMinutes: available,
        }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error);
      setAiRanks(out.recommendations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      setAnalyzing(false);
    }
  }
  const taskRows = data.tasks
    .filter(
      (t) =>
        (filter === "all" || t.status === filter) &&
        (!query || t.title.toLowerCase().includes(query.toLowerCase())),
    )
    .sort((a, b) => a.position - b.position);
  const scheduleRows = data.schedules
    .filter((s) => seoulDate(new Date(s.starts_at)) === today)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const showTask = (task: Task) => {
    const p = priority(task);
    return (
      <div
        className={"task-row " + (task.status === "done" ? "completed" : "")}
        key={task.id}
        draggable={tab === "tasks" && !busy}
        onDragStart={() => setDrag(task.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          if (!drag || drag === task.id) return;
          const source = data.tasks.find((t) => t.id === drag);
          if (!source) return;
          const sorted = data.tasks
            .filter((t) => t.id !== drag)
            .sort((a, b) => a.position - b.position);
          const index = sorted.findIndex((t) => t.id === task.id);
          const position =
            index === 0
              ? task.position - 1
              : (sorted[index - 1].position + task.position) / 2;
          await mutate("tasks", { ...source, position });
          setDrag(null);
        }}
      >
        <button
          className={"check " + (task.status === "done" ? "checked" : "")}
          aria-label={task.status === "done" ? "업무 다시 열기" : "업무 완료"}
          disabled={busy}
          onClick={() =>
            mutate("tasks", {
              ...task,
              status: task.status === "done" ? "todo" : "done",
            })
          }
        >
          {task.status === "done" && <Check size={13} />}
        </button>
        <button className="task-label" onClick={() => openTask(task)}>
          <strong>{task.title}</strong>
          <span>
            {data.projects.find((p) => p.id === task.project_id)?.title ||
              "프로젝트 없음"}
          </span>
        </button>
        <span className={"priority p" + p.level}>P{p.level}</span>
        <span
          className={
            "task-date " +
            (task.due_date && task.due_date < today ? "late" : "")
          }
        >
          {task.due_date === today
            ? "오늘"
            : task.due_date?.slice(5) || "마감 미정"}
        </span>
        <span className="task-duration">{task.estimated_minutes}분</span>
        <span className={"status " + task.status}>
          {statusLabels[task.status]}
        </span>
        <button aria-label="업무 수정" onClick={() => openTask(task)}>
          <MoreHorizontal size={18} />
        </button>
        {tab === "tasks" && <GripVertical className="drag" size={16} />}
      </div>
    );
  };
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          MY WORK <b>AI</b>
          <span className="brand-dot" />
        </a>
        <div className="workspace-label">
          <span className="avatar">M</span>
          <div>
            나의 워크스페이스<small>PERSONAL WORKSPACE</small>
          </div>
          <ChevronDown size={13} />
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav>
          {tabs.slice(0, 5).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} />
              {t.label}
              {t.id === "tasks" && (
                <span className="nav-count">
                  {data.tasks.filter((t) => t.status !== "done").length}
                </span>
              )}
            </button>
          ))}
          <div className="nav-separator" />
          {tabs.slice(5).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              <t.icon size={18} />
              {t.label}
              {t.id === "ai" && <span className="beta">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-note">
            <Sparkles size={18} />
            <strong>중요한 일에 집중하세요.</strong>
            <p>
              계획은 명확하게,
              <br />
              오늘의 실행은 가볍게.
            </p>
          </div>
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <Settings size={17} />
            연결 및 설정
          </button>
          <div className="profile">
            <span className="avatar">나</span>
            <div>
              나의 업무 공간
              <small>
                {cloudConfigured ? "클라우드 모드" : "로컬 체험 모드"}
              </small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            워크스페이스 <span>/</span> <strong>{currentTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="timezone">Asia/Seoul</span>
            <span className="sync">
              <span
                className={cloudConfigured && user ? "online-dot" : "local-dot"}
              />
              {cloudConfigured
                ? user
                  ? "클라우드 연결"
                  : "로그인 필요"
                : "로컬 체험"}
            </span>
            <button
              className="avatar"
              onClick={() => setTab("settings")}
              aria-label="계정 설정"
            >
              나
            </button>
          </div>
        </header>
        <nav className="mobile-secondary" aria-label="추가 메뉴">
          {[
            { id: "tasks", label: "오늘의 할 일" },
            { id: "goals", label: "목표" },
            { id: "review", label: "업무 리뷰" },
            { id: "settings", label: "연결 및 설정" },
          ].map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {tab === "today" ? "YOUR DAY, IN FOCUS" : "MY WORK AI"}
              </div>
              <h1>
                {tab === "today" ? "오늘의 중요한 일." : currentTitle}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {tab === "today"
                  ? now
                    ? new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        month: "long",
                        day: "numeric",
                        weekday: "long",
                      }).format(now) +
                      " · " +
                      new Intl.DateTimeFormat("ko-KR", {
                        timeZone: "Asia/Seoul",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      }).format(now)
                    : "오늘의 업무를 준비하고 있습니다."
                  : tab === "projects"
                    ? "큰 목표를 구체적인 실행으로 연결하세요."
                    : tab === "goals"
                      ? "당신의 방향과 성과를 한눈에."
                      : tab === "record"
                        ? "대화는 기록으로, 기록은 다음 행동으로."
                        : "계획부터 실행까지, 하나의 흐름으로."}
              </p>
            </div>
            <div className="heading-actions">
              {tab === "today" && (
                <button className="outline" onClick={() => setTab("calendar")}>
                  <CalendarDays size={15} />
                  일정 보기
                </button>
              )}
              <Button
                className="primary"
                onClick={() =>
                  tab === "projects"
                    ? setEditor({ kind: "projects" })
                    : tab === "goals"
                      ? setEditor({ kind: "goals" })
                      : tab === "calendar"
                        ? setEditor({ kind: "schedules" })
                        : openTask()
                }
              >
                <Plus size={16} />
                {tab === "projects"
                  ? "프로젝트 추가"
                  : tab === "goals"
                    ? "목표 추가"
                    : tab === "calendar"
                      ? "일정 추가"
                      : "새 업무"}
              </Button>
            </div>
          </div>
          {!cloudConfigured && (
            <div className="mode-notice">
              <Cloud size={15} />
              <span>
                로컬 체험 모드 · 데이터는 이 브라우저에만 저장됩니다. 기기 간
                동기화는 Supabase 연결 후 사용할 수 있습니다.
              </span>
              <button onClick={() => setTab("settings")}>
                연결 안내 <ArrowUpRight size={13} />
              </button>
            </div>
          )}
          {cloudConfigured && !user && ready && (
            <div className="mode-notice">
              클라우드 데이터를 사용하려면 로그인하세요.
              <a href="/login">이메일 로그인 →</a>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button aria-label="오류 닫기" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className="empty">업무 공간을 불러오는 중…</div>
          ) : (
            <>
              {tab === "today" && (
                <>
                  <section className="stats">
                    <Stat
                      label="진행 중인 프로젝트"
                      value={
                        data.projects.filter((p) => p.status === "doing").length
                      }
                      unit="개"
                      icon={<FolderKanban size={17} />}
                      foot="목표를 향해 진행하고 있어요"
                    />
                    <Stat
                      label="오늘의 업무"
                      value={due.length}
                      unit="개"
                      icon={<CheckCheck size={17} />}
                      foot={`${done}개 완료 · ${due.length - done}개 남음`}
                    />
                    <Stat
                      label="지연된 업무"
                      value={overdue.length}
                      unit="개"
                      icon={<Clock size={17} />}
                      foot={
                        overdue.length
                          ? "우선순위를 확인해 주세요"
                          : "차근차근 잘 진행하고 있어요"
                      }
                      alert={overdue.length > 0}
                    />
                    <Stat
                      label="오늘의 완료율"
                      value={completion}
                      unit="%"
                      icon={<Target size={17} />}
                      foot={
                        <div className="progress">
                          <i style={{ width: completion + "%" }} />
                        </div>
                      }
                    />
                  </section>
                  <div className="content-columns">
                    <div className="primary-column">
                      <section className="recommend-section">
                        <div className="section-heading">
                          <div>
                            <span className="ai-label">
                              <Sparkles size={15} /> TODAY’S FOCUS
                            </span>
                            <h2>오늘, 이 세 가지부터.</h2>
                            <p>중요도와 마감일을 살펴 추천한 업무입니다.</p>
                          </div>
                          <button
                            className="text-button"
                            onClick={analyze}
                            disabled={analyzing || !data.tasks.length}
                          >
                            <RefreshCw
                              size={13}
                              className={analyzing ? "spin" : ""}
                            />
                            {analyzing ? "분석 중" : "AI 분석"}
                          </button>
                        </div>
                        <div className="focus-cards">
                          {ranked.slice(0, 3).map((r, i) => {
                            const ai = aiRanks.find(
                              (a) => a.task_id === r.task.id,
                            );
                            return (
                              <article
                                className={
                                  "focus-card " + (i === 0 ? "first" : "")
                                }
                                key={r.task.id}
                              >
                                <div className="focus-card-top">
                                  <span className="focus-number">0{i + 1}</span>
                                  <span
                                    className={
                                      "priority p" + (ai?.priority ?? r.level)
                                    }
                                  >
                                    P
                                    {r.task.manual_priority ??
                                      ai?.priority ??
                                      r.level}{" "}
                                    ·{" "}
                                    {r.task.manual_priority !== null
                                      ? "직접 설정"
                                      : ai
                                        ? "AI 추천"
                                        : "규칙 추천"}
                                  </span>
                                </div>
                                <span className="project-tag">
                                  {data.projects.find(
                                    (p) => p.id === r.task.project_id,
                                  )?.title || "개인 업무"}
                                </span>
                                <h3>{r.task.title}</h3>
                                <div className="reason">
                                  <Sparkles size={13} />
                                  <p>{ai?.reason ?? r.reason}</p>
                                </div>
                                <div className="focus-meta">
                                  <span>
                                    <CalendarDays size={12} />
                                    {r.task.due_date === today
                                      ? "오늘 마감"
                                      : r.task.due_date?.slice(5) ||
                                        "마감 미정"}
                                  </span>
                                  <span>
                                    <Clock size={12} />
                                    {r.task.estimated_minutes}분
                                  </span>
                                </div>
                                <div className="focus-buttons">
                                  <button
                                    onClick={() =>
                                      mutate("tasks", {
                                        ...r.task,
                                        status: "doing",
                                      })
                                    }
                                    disabled={busy}
                                  >
                                    <Play size={12} />
                                    {r.task.status === "doing"
                                      ? "진행 중"
                                      : "바로 시작"}
                                  </button>
                                  <button
                                    aria-label={r.task.title + " 완료"}
                                    onClick={() =>
                                      mutate("tasks", {
                                        ...r.task,
                                        status: "done",
                                      })
                                    }
                                    disabled={busy}
                                  >
                                    <Check size={15} />
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                          {!ranked.length && (
                            <div className="empty focus-empty">
                              <Target size={32} />
                              <h3>작은 시작이 큰 변화를 만듭니다.</h3>
                              <p>
                                첫 업무를 추가하면 오늘의 우선순위를 함께 정리해
                                드려요.
                              </p>
                              <button
                                className="primary"
                                onClick={() => openTask()}
                              >
                                <Plus size={14} />첫 업무 추가
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="recommend-foot">
                          <span className="tiny-dot" />
                          AI 추천은 제안입니다. 최종 우선순위는 직접 결정하세요.
                          <span>
                            {aiRanks.length
                              ? "OpenAI 분석 결과"
                              : "현재: 규칙 기반 추천"}
                          </span>
                        </div>
                      </section>
                      <section className="panel today-list">
                        <div className="section-heading compact">
                          <h2>
                            오늘의 업무{" "}
                            <span className="pill">{due.length}</span>
                          </h2>
                          <button
                            className="text-button"
                            onClick={() => setTab("tasks")}
                          >
                            전체 보기 <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="list-tabs">
                          <button
                            className={filter === "all" ? "selected" : ""}
                            onClick={() => setFilter("all")}
                          >
                            전체
                          </button>
                          <button
                            className={filter === "todo" ? "selected" : ""}
                            onClick={() => setFilter("todo")}
                          >
                            예정
                          </button>
                          <button
                            className={filter === "doing" ? "selected" : ""}
                            onClick={() => setFilter("doing")}
                          >
                            진행 중
                          </button>
                          <button
                            className={filter === "done" ? "selected" : ""}
                            onClick={() => setFilter("done")}
                          >
                            완료
                          </button>
                        </div>
                        {due
                          .filter(
                            (t) => filter === "all" || t.status === filter,
                          )
                          .map(showTask)}
                        {!due.filter(
                          (t) => filter === "all" || t.status === filter,
                        ).length && (
                          <div className="empty small">
                            표시할 오늘의 업무가 없습니다.
                          </div>
                        )}
                        <button className="add-row" onClick={() => openTask()}>
                          <Plus size={15} />
                          업무 추가하기
                        </button>
                      </section>
                    </div>
                    <aside className="right-column">
                      <section className="panel daily-plan">
                        <div className="section-heading compact">
                          <h2>오늘의 일정</h2>
                          <button
                            aria-label="캘린더 열기"
                            onClick={() => setTab("calendar")}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </div>
                        <span className="small-date">
                          {today?.replaceAll("-", ". ")}
                        </span>
                        <div className="timeline">
                          {scheduleRows.length ? (
                            scheduleRows.map((s) => (
                              <button
                                className="timeline-item"
                                key={s.id}
                                onClick={() =>
                                  setEditor({
                                    kind: "schedules",
                                    row: s as unknown as Record<
                                      string,
                                      unknown
                                    >,
                                  })
                                }
                              >
                                <span>
                                  {new Intl.DateTimeFormat("ko-KR", {
                                    timeZone: "Asia/Seoul",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                  }).format(new Date(s.starts_at))}
                                </span>
                                <div>
                                  <strong>{s.title}</strong>
                                  <small>
                                    {Math.round(
                                      (Date.parse(s.ends_at) -
                                        Date.parse(s.starts_at)) /
                                        60000,
                                    )}
                                    분
                                  </small>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="empty small">
                              <CalendarDays size={25} />
                              <p>
                                아직 등록된 일정이 없어요.
                                <br />
                                집중할 시간을 미리 확보하세요.
                              </p>
                            </div>
                          )}
                        </div>
                        <button
                          className="outline full"
                          onClick={() => setEditor({ kind: "schedules" })}
                        >
                          <Plus size={14} />
                          시간 블록 추가
                        </button>
                      </section>
                      <section className="insight">
                        <span className="ai-label">
                          <Sparkles size={15} /> WORK INSIGHT
                        </span>
                        <h3>여유를 남기는 계획.</h3>
                        <p>
                          오늘의 가용 시간을 설정하면 그 안에 끝낼 수 있는
                          업무를 살펴볼 수 있어요.
                        </p>
                        <label className="available">
                          오늘 가용 시간
                          <select
                            value={available}
                            onChange={(e) =>
                              setAvailable(Number(e.target.value))
                            }
                          >
                            {[60, 120, 240, 360, 480].map((v) => (
                              <option key={v} value={v}>
                                {v / 60}시간
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className="insight-note">
                          추천 업무 예상{" "}
                          {ranked
                            .slice(0, 3)
                            .reduce((s, r) => s + r.task.estimated_minutes, 0)}
                          분 / 가용 {available}분
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setTab("ai")}
                        >
                          AI와 오늘 계획하기 <ArrowRight size={14} />
                        </button>
                      </section>
                      {!data.tasks.length && (
                        <button className="sample-card" onClick={sample}>
                          <span>먼저 둘러보고 싶으신가요?</span>
                          <strong>
                            샘플 데이터 추가 <ArrowUpRight size={15} />
                          </strong>
                          <small>직접 선택한 경우에만 추가됩니다.</small>
                        </button>
                      )}
                      {overdue.length > 0 && (
                        <section className="panel rollover">
                          <h3>미완료 업무 이월 제안</h3>
                          <p>
                            지연된 {overdue.length}건의 새 마감일은 직접 확인해
                            주세요.
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setTab("tasks");
                              setFilter("all");
                            }}
                          >
                            업무 검토하기 →
                          </button>
                        </section>
                      )}
                    </aside>
                  </div>
                </>
              )}
              {tab === "tasks" && (
                <section className="panel">
                  <div className="section-heading compact">
                    <h2>
                      모든 업무{" "}
                      <span className="pill">{data.tasks.length}</span>
                    </h2>
                    <div className="search">
                      <Search size={15} />
                      <input
                        aria-label="업무 검색"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="업무 검색"
                      />
                    </div>
                  </div>
                  <div className="list-tabs">
                    {["all", "todo", "doing", "done", "hold"].map((s) => (
                      <button
                        key={s}
                        className={filter === s ? "selected" : ""}
                        onClick={() => setFilter(s)}
                      >
                        {s === "all"
                          ? "전체"
                          : statusLabels[s as keyof typeof statusLabels]}
                      </button>
                    ))}
                    <small>드래그하여 순서 변경</small>
                  </div>
                  {taskRows.map(showTask)}
                  {!taskRows.length && (
                    <div className="empty">
                      <CheckCheck size={30} />
                      <h3>업무를 한곳에 모아보세요.</h3>
                      <p>마감일과 예상 시간을 정하면 계획이 명확해집니다.</p>
                      <button className="primary" onClick={() => openTask()}>
                        업무 추가
                      </button>
                    </div>
                  )}
                </section>
              )}
              {tab === "projects" && (
                <div className="project-grid">
                  {data.projects.map((p) => {
                    const ts = data.tasks.filter((t) => t.project_id === p.id),
                      pct = ts.length
                        ? Math.round(
                            (ts.filter((t) => t.status === "done").length /
                              ts.length) *
                              100,
                          )
                        : 0;
                    const late = ts.filter(
                      (t) =>
                        t.status !== "done" && t.due_date && t.due_date < today,
                    ).length;
                    return (
                      <article className="panel project-card" key={p.id}>
                        <div className="project-icon">
                          <FolderKanban size={22} />
                        </div>
                        <span className={"status " + p.status}>
                          {statusLabels[p.status]}
                        </span>
                        <h2>{p.title}</h2>
                        <p>{p.description || "프로젝트 설명을 추가하세요."}</p>
                        <div className="project-progress">
                          <span>업무 완료율</span>
                          <b>{pct}%</b>
                        </div>
                        <div className="progress">
                          <i style={{ width: pct + "%" }} />
                        </div>
                        <div className="project-footer">
                          <span>
                            {ts.filter((t) => t.status !== "done").length}개
                            남음 · {late ? late + "개 지연" : "지연 없음"}
                          </span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setEditor({
                                kind: "projects",
                                row: p as unknown as Record<string, unknown>,
                              })
                            }
                          >
                            관리 <ArrowUpRight size={13} />
                          </button>
                        </div>
                        <small>마감 {p.due_date || "미정"}</small>
                      </article>
                    );
                  })}
                  <button
                    className="new-card"
                    onClick={() => setEditor({ kind: "projects" })}
                  >
                    <Plus size={28} />
                    <strong>새 프로젝트</strong>
                    <span>다음 목표를 향한 첫걸음</span>
                  </button>
                </div>
              )}
              {tab === "goals" && (
                <div className="project-grid">
                  {data.goals.map((g) => (
                    <article className="panel project-card" key={g.id}>
                      <div className="project-icon">
                        <Target size={22} />
                      </div>
                      <span className="tag">
                        {
                          {
                            long: "장기 목표",
                            month: "월간 목표",
                            week: "주간 계획",
                          }[g.period]
                        }
                      </span>
                      <h2>{g.title}</h2>
                      <p>{g.description}</p>
                      <small>
                        {data.projects.find((p) => p.id === g.project_id)
                          ?.title || "프로젝트 미연결"}{" "}
                        · {g.owner || "담당자 확인 필요"}
                      </small>
                      <div className="project-progress">
                        <span>
                          {g.kpi || "KPI"} {g.actual}/{g.target}
                        </span>
                        <b>{Math.round((g.actual / g.target) * 100)}%</b>
                      </div>
                      <div className="progress">
                        <i
                          style={{
                            width:
                              Math.min(100, (g.actual / g.target) * 100) + "%",
                          }}
                        />
                      </div>
                      <div className="project-footer">
                        <span>{g.due_date || "마감 미정"}</span>
                        <button
                          className="text-button"
                          onClick={() =>
                            setEditor({
                              kind: "goals",
                              row: g as unknown as Record<string, unknown>,
                            })
                          }
                        >
                          목표 수정 →
                        </button>
                      </div>
                    </article>
                  ))}
                  <button
                    className="new-card"
                    onClick={() => setEditor({ kind: "goals" })}
                  >
                    <Target size={28} />
                    <strong>목표 추가</strong>
                    <span>성과를 측정할 기준을 정하세요</span>
                  </button>
                </div>
              )}
              {tab === "calendar" && (
                <section className="panel calendar">
                  <div className="section-heading compact">
                    <div className="calendar-controls">
                      <button
                        aria-label="이전 기간"
                        onClick={() => setCalendarOffset((n) => n - 1)}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      <h2>
                        {calendarOffset === 0
                          ? "이번"
                          : calendarOffset > 0
                            ? `다음 ${calendarOffset}`
                            : `이전 ${-calendarOffset}`}{" "}
                        {{ day: "일", week: "주", month: "월" }[calendarMode]}
                      </h2>
                      <button
                        aria-label="다음 기간"
                        onClick={() => setCalendarOffset((n) => n + 1)}
                      >
                        <ChevronRight size={18} />
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setCalendarOffset(0)}
                      >
                        오늘
                      </button>
                    </div>
                    <div className="segmented">
                      {["day", "week", "month"].map((m) => (
                        <button
                          className={calendarMode === m ? "selected" : ""}
                          key={m}
                          onClick={() => {
                            setCalendarMode(m);
                            setCalendarOffset(0);
                          }}
                        >
                          {{ day: "일", week: "주", month: "월" }[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <CalendarGrid
                    data={data}
                    mode={calendarMode}
                    offset={calendarOffset}
                    onTask={openTask}
                    onSchedule={(s) =>
                      setEditor({
                        kind: "schedules",
                        row: s as unknown as Record<string, unknown>,
                      })
                    }
                  />
                  <p className="muted">
                    시간은 대한민국(Asia/Seoul) 기준입니다. 일정이 중복되면 저장
                    전에 표시됩니다.
                  </p>
                </section>
              )}
              <div hidden={tab !== "ai"}>
                <Assistant
                  data={data}
                  onRefresh={() => w.refresh()}
                  onError={setError}
                />
              </div>
              <div hidden={tab !== "record"}>
                <Recorder
                  data={data}
                  mutate={mutate}
                  onError={setError}
                  onAddTask={(title) =>
                    setEditor({
                      kind: "tasks",
                      row: { ...taskDefaults(), title },
                    })
                  }
                />
              </div>
              {tab === "review" && (
                <section className="panel review">
                  <div className="section-heading compact">
                    <div className="segmented">
                      <button
                        className={reviewDays === 7 ? "selected" : ""}
                        onClick={() => setReviewDays(7)}
                      >
                        주간
                      </button>
                      <button
                        className={reviewDays === 30 ? "selected" : ""}
                        onClick={() => setReviewDays(30)}
                      >
                        월간
                      </button>
                    </div>
                    <div className="heading-actions">
                      <button
                        className="outline"
                        onClick={() =>
                          download(
                            "업무-리뷰.md",
                            weeklyReview(data, reviewDays),
                          )
                        }
                      >
                        <Download size={15} />
                        Markdown
                      </button>
                      <button
                        className="outline"
                        onClick={() => window.print()}
                      >
                        인쇄 / PDF
                      </button>
                    </div>
                  </div>
                  <pre>{weeklyReview(data, reviewDays)}</pre>
                  <small>
                    현재 리뷰는 저장된 상태와 최종 수정일 기준 집계입니다. 반복
                    지연 분석에는 이력 기반 확장이 필요합니다.
                  </small>
                </section>
              )}
              {tab === "settings" && (
                <div className="settings-grid">
                  <Integrations
                    data={data}
                    onRefresh={w.refresh}
                    onError={setError}
                  />
                  <section className="panel settings-card">
                    <h2>연결 상태</h2>
                    <dl>
                      <dt>데이터 저장</dt>
                      <dd>
                        {cloudConfigured
                          ? "Supabase PostgreSQL"
                          : "이 브라우저의 localStorage"}
                      </dd>
                      <dt>인증</dt>
                      <dd>
                        {user
                          ? "이메일 계정 로그인됨"
                          : cloudConfigured
                            ? "로그인 필요"
                            : "미설정"}
                      </dd>
                      <dt>실시간 동기화</dt>
                      <dd>
                        {cloudConfigured && user
                          ? "Supabase Realtime 구독 중"
                          : "기기 간 동기화 불가"}
                      </dd>
                      <dt>마지막 데이터 갱신</dt>
                      <dd>
                        {synced
                          ? new Date(synced).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })
                          : "아직 없음"}
                      </dd>
                      <dt>ChatGPT MCP</dt>
                      <dd>서버 구현됨 · OAuth 설정 후 연결</dd>
                      <dt>ChatGPT 로그인</dt>
                      <dd>미제공 · 공식 자격 및 등록 확인 필요</dd>
                      <dt>Google Calendar</dt>
                      <dd>미연결 · 선택적 확장 예정</dd>
                    </dl>
                    {user ? (
                      <button
                        className="outline"
                        onClick={async () => {
                          await browserDb().auth.signOut();
                          location.reload();
                        }}
                      >
                        <LogOut size={15} />
                        로그아웃
                      </button>
                    ) : (
                      <a className="primary" href="/login">
                        이메일 로그인
                      </a>
                    )}
                    <p className="muted">
                      ChatGPT 구독과 OpenAI API 사용료는 별도입니다. 대화
                      내역이나 메모리를 자동으로 가져오지 않습니다.
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <h2>데이터와 시작하기</h2>
                    <p>
                      Supabase 프로젝트를 만든 뒤 README의 SQL 마이그레이션과
                      환경 변수를 설정하세요. 로컬 체험 데이터는 클라우드로 자동
                      전송되지 않습니다.
                    </p>
                    <button className="outline" onClick={sample}>
                      <Plus size={15} />
                      샘플 데이터 추가
                    </button>
                    <button
                      className="outline"
                      onClick={() =>
                        download(
                          "my-work-ai-backup.json",
                          JSON.stringify(data, null, 2),
                        )
                      }
                    >
                      <Download size={15} />
                      현재 데이터 내보내기
                    </button>
                    <p className="muted">
                      로컬 체험 데이터는 브라우저 저장 공간 삭제 시 사라집니다.
                      중요한 업무는 클라우드 연결 후 입력하세요.
                    </p>
                  </section>
                  <section className="panel settings-card">
                    <h2>최근 작업 이력</h2>
                    {[...data.activity_logs]
                      .reverse()
                      .slice(0, 15)
                      .map((a) => (
                        <div className="activity" key={a.id}>
                          <span>{a.action}</span>
                          <small>
                            {new Date(a.created_at).toLocaleString("ko-KR", {
                              timeZone: "Asia/Seoul",
                            })}
                          </small>
                        </div>
                      ))}
                    {!data.activity_logs.length && (
                      <p className="muted">
                        업무를 변경하면 이곳에 기록됩니다.
                      </p>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          <Reminders
            data={data}
            onError={setError}
            visible={tab === "settings"}
          />
          <footer className="page-footer">
            <span>
              MY WORK AI <span>·</span> 계획은 명확하게, 실행은 가볍게.
            </span>
            <span>오늘의 작은 실행이 내일의 성과가 됩니다.</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {[
          { id: "today", label: "Today", icon: LayoutDashboard },
          { id: "projects", label: "Projects", icon: FolderKanban },
          { id: "calendar", label: "Calendar", icon: CalendarDays },
          { id: "ai", label: "AI", icon: Sparkles },
          { id: "record", label: "Record", icon: Mic },
        ].map((t) => (
          <button
            className={tab === t.id ? "active" : ""}
            key={t.id}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={21} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {editor && (
        <Editor
          kind={editor.kind}
          row={editor.row}
          data={data}
          busy={busy}
          close={() => setEditor(null)}
          save={async (row) => {
            if (await mutate(editor.kind, row)) setEditor(null);
          }}
          remove={
            editor.row?.id
              ? async () => {
                  if (
                    confirm(
                      "이 항목을 삭제할까요? 연결된 데이터가 있으면 먼저 연결을 해제해야 합니다.",
                    )
                  )
                    if (await mutate(editor.kind, { id: editor.row!.id }, true))
                      setEditor(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  unit,
  icon,
  foot,
  alert,
}: {
  label: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  foot: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <article className="stat">
      <div>
        {label}
        <span>{icon}</span>
      </div>
      <strong className={alert ? "late" : ""}>
        {value}
        <small>{unit}</small>
      </strong>
      <div className="stat-foot">{foot}</div>
    </article>
  );
}
function taskDefaults() {
  return {
    description: "",
    project_id: null,
    goal_id: null,
    start_date: null,
    due_date: seoulDate(),
    importance: 3,
    urgency: 3,
    estimated_minutes: 30,
    actual_minutes: 0,
    status: "todo",
    manual_priority: null,
    notes: "",
    position: Date.now(),
  };
}
function Editor({
  kind,
  row,
  data,
  busy,
  close,
  save,
  remove,
}: {
  kind: "tasks" | "projects" | "goals" | "schedules";
  row?: Record<string, unknown>;
  data: Data;
  busy: boolean;
  close: () => void;
  save: (row: Record<string, unknown>) => Promise<void>;
  remove?: () => Promise<void>;
}) {
  const base =
    kind === "tasks"
      ? taskDefaults()
      : kind === "goals"
        ? {
            description: "",
            project_id: null,
            parent_id: null,
            period: "long",
            kpi: "",
            target: 100,
            actual: 0,
            owner: "",
            start_date: null,
            due_date: null,
            status: "todo",
          }
        : kind === "projects"
          ? { description: "", due_date: null, status: "doing" }
          : {
              task_id: null,
              starts_at: seoulDate() + "T09:00:00+09:00",
              ends_at: seoulDate() + "T10:00:00+09:00",
            };
  const [form, setForm] = useState<Record<string, unknown>>({
      ...base,
      title: "",
      ...row,
      id: row?.id || crypto.randomUUID(),
      ...(kind === "tasks"
        ? {
            _dependencies: data.task_dependencies
              .filter((d) => d.task_id === row?.id)
              .map((d) => d.depends_on),
          }
        : {}),
    }),
    [validation, setValidation] = useState("");
  const field = (name: string, value: unknown) =>
    setForm((f) => ({ ...f, [name]: value }));
  const input = (
    name: string,
    label: string,
    type = "text",
    required = false,
  ) => (
    <label>
      {label}
      <input
        name={name}
        type={type}
        required={required}
        min={type === "number" ? (name === "target" ? 1 : 0) : undefined}
        value={(form[name] ?? "") as string | number}
        onChange={(e) =>
          field(
            name,
            type === "number" ? Number(e.target.value) : e.target.value || null,
          )
        }
      />
    </label>
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-shade" />
        <Dialog.Content className="modal" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">항목 편집</Dialog.Title>
          <div className="section-heading compact">
            <h2 id="editor-title">
              {
                {
                  tasks: "업무",
                  projects: "프로젝트",
                  goals: "목표",
                  schedules: "일정",
                }[kind]
              }{" "}
              {row?.id ? "수정" : "추가"}
            </h2>
            <button aria-label="닫기" onClick={close}>
              <X size={20} />
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setValidation("");
              if (!String(form.title || "").trim()) {
                setValidation("제목을 입력해 주세요.");
                return;
              }
              if (
                form.start_date &&
                form.due_date &&
                String(form.start_date) > String(form.due_date)
              ) {
                setValidation("마감일이 시작일보다 빠릅니다.");
                return;
              }
              if (kind === "schedules") {
                if (
                  Date.parse(String(form.ends_at)) <=
                  Date.parse(String(form.starts_at))
                ) {
                  setValidation("종료 시간이 시작 시간보다 늦어야 합니다.");
                  return;
                }
                const overlap = data.schedules.some(
                  (s) =>
                    s.id !== form.id &&
                    Date.parse(s.starts_at) <
                      Date.parse(String(form.ends_at)) &&
                    Date.parse(s.ends_at) > Date.parse(String(form.starts_at)),
                );
                if (
                  overlap &&
                  !confirm("다른 일정과 겹칩니다. 그래도 저장할까요?")
                )
                  return;
              }
              if (
                row?.id &&
                (row.due_date !== form.due_date || kind === "schedules") &&
                !confirm("변경된 일정을 저장할까요?")
              )
                return;
              await save({
                ...form,
                id: form.id || crypto.randomUUID(),
                title: String(form.title).trim(),
              });
            }}
          >
            {input("title", "제목", "text", true)}
            {kind !== "schedules" && (
              <label>
                설명
                <textarea
                  value={String(form.description || "")}
                  onChange={(e) => field("description", e.target.value)}
                  rows={3}
                />
              </label>
            )}
            <div className="form-grid">
              {(kind === "tasks" || kind === "goals") && (
                <label>
                  프로젝트
                  <select
                    value={String(form.project_id || "")}
                    onChange={(e) =>
                      field("project_id", e.target.value || null)
                    }
                  >
                    <option value="">연결하지 않음</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind === "tasks" && (
                <label>
                  연결 목표
                  <select
                    value={String(form.goal_id || "")}
                    onChange={(e) => field("goal_id", e.target.value || null)}
                  >
                    <option value="">없음</option>
                    {data.goals.map((g) => (
                      <option value={g.id} key={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {kind !== "schedules" && (
                <label>
                  상태
                  <select
                    value={String(form.status)}
                    onChange={(e) => field("status", e.target.value)}
                  >
                    {Object.entries(statusLabels).map(([s, l]) => (
                      <option key={s} value={s}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {(kind === "tasks" || kind === "goals") &&
                input("start_date", "시작일", "date")}
              {kind !== "schedules" && input("due_date", "마감일", "date")}
              {kind === "tasks" && (
                <>
                  <label>
                    중요도
                    <select
                      value={Number(form.importance)}
                      onChange={(e) =>
                        field("importance", Number(e.target.value))
                      }
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    긴급도
                    <select
                      value={Number(form.urgency)}
                      onChange={(e) => field("urgency", Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  {input("estimated_minutes", "예상 시간 (분)", "number")}
                  {input("actual_minutes", "실제 시간 (분)", "number")}
                  <label>
                    수동 우선순위
                    <select
                      value={
                        form.manual_priority === null
                          ? "auto"
                          : String(form.manual_priority)
                      }
                      onChange={(e) =>
                        field(
                          "manual_priority",
                          e.target.value === "auto"
                            ? null
                            : Number(e.target.value),
                        )
                      }
                    >
                      <option value="auto">추천 따르기</option>
                      {[0, 1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          P{n}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {kind === "goals" && (
                <>
                  <label>
                    목표 단계
                    <select
                      value={String(form.period)}
                      onChange={(e) => field("period", e.target.value)}
                    >
                      <option value="long">장기 목표</option>
                      <option value="month">월간 목표</option>
                      <option value="week">주간 계획</option>
                    </select>
                  </label>
                  <label>
                    상위 목표
                    <select
                      value={String(form.parent_id || "")}
                      onChange={(e) =>
                        field("parent_id", e.target.value || null)
                      }
                    >
                      <option value="">없음</option>
                      {data.goals
                        .filter((g) => g.id !== form.id)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  {input("kpi", "KPI 단위")}
                  {input("target", "목표 수치", "number", true)}
                  {input("actual", "현재 실적", "number")}
                  {input("owner", "담당자")}
                </>
              )}
              {kind === "schedules" && (
                <>
                  <label>
                    시작 (한국 시간)
                    <input
                      type="datetime-local"
                      required
                      value={seoulInput(String(form.starts_at))}
                      onChange={(e) =>
                        field("starts_at", e.target.value + ":00+09:00")
                      }
                    />
                  </label>
                  <label>
                    종료 (한국 시간)
                    <input
                      type="datetime-local"
                      required
                      value={seoulInput(String(form.ends_at))}
                      onChange={(e) =>
                        field("ends_at", e.target.value + ":00+09:00")
                      }
                    />
                  </label>
                  <label>
                    연결 업무
                    <select
                      value={String(form.task_id || "")}
                      onChange={(e) => field("task_id", e.target.value || null)}
                    >
                      <option value="">없음</option>
                      {data.tasks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {kind === "tasks" && (
              <fieldset className="dependencies">
                <legend>선행 업무 (완료 후 추천에 포함)</legend>
                {data.tasks
                  .filter((t) => t.id !== form.id)
                  .map((t) => (
                    <label key={t.id}>
                      <input
                        type="checkbox"
                        checked={(form._dependencies as string[]).includes(
                          t.id,
                        )}
                        onChange={(e) =>
                          field(
                            "_dependencies",
                            e.target.checked
                              ? [...(form._dependencies as string[]), t.id]
                              : (form._dependencies as string[]).filter(
                                  (id) => id !== t.id,
                                ),
                          )
                        }
                      />
                      {t.title}
                    </label>
                  ))}
                {!data.tasks.filter((t) => t.id !== form.id).length && (
                  <small>다른 업무를 등록하면 연결할 수 있습니다.</small>
                )}
              </fieldset>
            )}
            {kind === "tasks" && (
              <label>
                업무 메모
                <textarea
                  value={String(form.notes || "")}
                  onChange={(e) => field("notes", e.target.value)}
                />
              </label>
            )}
            {validation && (
              <p role="alert" className="late">
                {validation}
              </p>
            )}
            <div className="modal-actions">
              {remove && (
                <button
                  type="button"
                  className="danger"
                  onClick={remove}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                  삭제
                </button>
              )}
              <button
                type="button"
                className="outline"
                onClick={close}
                disabled={busy}
              >
                취소
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function CalendarGrid({
  data,
  mode,
  offset,
  onTask,
  onSchedule,
}: {
  data: Data;
  mode: string;
  offset: number;
  onTask: (t: Task) => void;
  onSchedule: (s: Schedule) => void;
}) {
  const date = new Date(seoulDate() + "T12:00:00+09:00");
  if (mode === "month") {
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + offset);
  } else
    date.setUTCDate(date.getUTCDate() + offset * (mode === "week" ? 7 : 1));
  const count =
    mode === "month"
      ? new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate()
      : mode === "week"
        ? 7
        : 1;
  return (
    <div className={"calendar-grid " + mode}>
      {Array.from({ length: count }, (_, i) => {
        const d = new Date(date);
        d.setUTCDate(d.getUTCDate() + i);
        const key = seoulDate(d);
        return (
          <div
            className={
              "calendar-day " + (key === seoulDate() ? "is-today" : "")
            }
            key={key}
          >
            <strong>
              {d.getUTCMonth() + 1}/{d.getUTCDate()}{" "}
              <small>
                {["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()]}
              </small>
            </strong>
            {data.tasks
              .filter((t) => t.due_date === key)
              .map((t) => (
                <button
                  className="calendar-task"
                  key={t.id}
                  onClick={() => onTask(t)}
                >
                  ● {t.title}
                </button>
              ))}
            {data.schedules
              .filter((s) => seoulDate(new Date(s.starts_at)) === key)
              .map((s) => (
                <button
                  className="calendar-event"
                  key={s.id}
                  onClick={() => onSchedule(s)}
                >
                  {new Intl.DateTimeFormat("ko-KR", {
                    timeZone: "Asia/Seoul",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  }).format(new Date(s.starts_at))}{" "}
                  {s.title}
                </button>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function seoulInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 16);
}
