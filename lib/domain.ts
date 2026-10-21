import type { Task, Data } from "./types";
export function seoulDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function priority(
  task: Task,
  today = seoulDate(),
  tasks: Task[] = [],
  availableMinutes = 480,
) {
  const reasons: string[] = [];
  let score = task.importance * 8 + task.urgency * 6;
  if (task.due_date) {
    const days = Math.round(
      (Date.parse(task.due_date) - Date.parse(today)) / 86400000,
    );
    if (days < 0) {
      score += 50;
      reasons.push("마감이 지나 지연 위험이 있습니다");
    } else if (days === 0) {
      score += 40;
      reasons.push("오늘 마감입니다");
    } else if (days <= 3) {
      score += 25;
      reasons.push("3일 이내에 마감됩니다");
    }
  }
  if (task.goal_id) {
    score += 12;
    reasons.push("목표·KPI와 연결되어 있습니다");
  }
  if (task.importance >= 4) reasons.push("직접 설정한 중요도가 높습니다");
  if (task.estimated_minutes <= 60) {
    score += 5;
    reasons.push("1시간 안에 마칠 수 있습니다");
  }
  if (task.estimated_minutes > availableMinutes) {
    score -= 10;
    reasons.push("가용 시간을 초과하므로 분할이 필요합니다");
  }
  const level = score >= 95 ? 0 : score >= 65 ? 1 : score >= 40 ? 2 : 3;
  return {
    level: task.manual_priority ?? level,
    suggested: level,
    score,
    reason: reasons.join(" · ") || "중요도와 긴급도를 기준으로 추천합니다",
    source: "rule" as const,
  };
}
export function rankedTasks(data: Data, availableMinutes = 480) {
  return data.tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "hold" &&
        (!t.start_date || t.start_date <= seoulDate()) &&
        !data.task_dependencies.some(
          (d) =>
            d.task_id === t.id &&
            data.tasks.find((p) => p.id === d.depends_on)?.status !== "done",
        ),
    )
    .map((task) => ({
      task,
      ...priority(task, seoulDate(), data.tasks, availableMinutes),
    }))
    .sort(
      (a, b) =>
        a.level - b.level ||
        b.score - a.score ||
        a.task.position - b.task.position,
    );
}
export function weeklyReview(data: Data, days = 7) {
  const since = Date.now() - days * 86400000;
  const done = data.tasks.filter(
    (t) => t.status === "done" && Date.parse(t.updated_at) >= since,
  );
  const overdue = data.tasks.filter(
    (t) => t.status !== "done" && t.due_date && t.due_date < seoulDate(),
  );
  return `# ${days === 7 ? "주간" : "월간"} 업무 리뷰\n\n기준: ${seoulDate()} (Asia/Seoul) · 최근 ${days}일\n\n- 기간 내 완료: ${done.length}건\n- 미완료: ${data.tasks.filter((t) => t.status !== "done").length}건\n- 지연: ${overdue.length}건\n- 완료 업무 실제 소요 시간: ${done.reduce((s, t) => s + t.actual_minutes, 0)}분\n\n## 프로젝트 진척\n${data.projects
    .map((p) => {
      const ts = data.tasks.filter((t) => t.project_id === p.id);
      return `- ${p.title}: ${ts.filter((t) => t.status === "done").length}/${ts.length} 완료`;
    })
    .join(
      "\n",
    )}\n\n## 목표 실적\n${data.goals.map((g) => `- ${g.title}: ${g.actual}/${g.target} ${g.kpi}`).join("\n")}\n\n## 다음 실행 제안 (규칙 기반)\n${overdue.length ? "지연 업무의 범위를 줄이거나 일정을 재협의하세요." : "예상 시간과 실제 시간을 기록해 다음 계획의 정확도를 높이세요."}\n${rankedTasks(
    data,
  )
    .slice(0, 3)
    .map((r) => `- ${r.task.title}: ${r.reason}`)
    .join("\n")}`;
}
