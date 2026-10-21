import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seoulDate, weeklyReview } from "./domain";
import { emptyData, type Data } from "./types";
export function createMcpServer(
  db: SupabaseClient,
  userId: string,
  clientId: string,
  canWrite: boolean,
) {
  const server = new McpServer({ name: "my-work-ai", version: "0.1.0" });
  const read = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const write = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  const result = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });
  async function rows(table: string) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .eq("user_id", userId)
      .limit(500);
    if (error) throw error;
    return data;
  }
  server.registerTool(
    "get_today_dashboard",
    {
      description:
        "오늘의 업무, 지연 업무, 진행 프로젝트를 조회합니다. 최대 500개 기준.",
      inputSchema: {},
      annotations: read,
    },
    async () => {
      const tasks = await rows("tasks");
      return result({
        date: seoulDate(),
        timezone: "Asia/Seoul",
        today: tasks.filter((t) => t.due_date === seoulDate()),
        overdue: tasks.filter(
          (t) => t.due_date && t.due_date < seoulDate() && t.status !== "done",
        ),
        projects: await rows("projects"),
      });
    },
  );
  for (const [tool, table] of [
    ["list_goals", "goals"],
    ["list_projects", "projects"],
    ["list_tasks", "tasks"],
  ] as const)
    server.registerTool(
      tool,
      {
        description: `내 ${table} 조회. 최대 500개. 사용자 소유 데이터만 반환합니다.`,
        inputSchema: {},
        annotations: read,
      },
      async () => result(await rows(table)),
    );
  server.registerTool(
    "get_meeting_summary",
    {
      description: "특정 회의록과 실행 과제를 조회합니다.",
      inputSchema: { meeting_id: z.uuid() },
      annotations: read,
    },
    async ({ meeting_id }) => {
      const { data, error } = await db
        .from("meeting_notes")
        .select("id,title,summary,action_items,created_at")
        .eq("id", meeting_id)
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      return result(data);
    },
  );
  server.registerTool(
    "get_weekly_review",
    {
      description: "저장된 데이터를 집계한 규칙 기반 주간 리뷰.",
      inputSchema: {},
      annotations: read,
    },
    async () =>
      result(
        weeklyReview({
          ...emptyData,
          tasks: await rows("tasks"),
          projects: await rows("projects"),
          goals: await rows("goals"),
        } as Data),
      ),
  );
  const pending = async (operation: string, id: string, payload: unknown) => {
    if (!canWrite)
      return {
        ...result({
          error: "쓰기 권한이 없습니다. 앱에서 연결 권한을 변경하세요.",
        }),
        isError: true,
      };
    const { data: existing, error: lookupError } = await db
      .from("pending_actions")
      .select("id,client_id,status,payload,operation")
      .eq("id", id)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      if (
        existing.client_id !== clientId ||
        existing.operation !== operation ||
        JSON.stringify(existing.payload) !== JSON.stringify(payload)
      ) {
        // jsonb key order differs; compare canonical form
        const canonical = (v: unknown): string =>
          JSON.stringify(v, Object.keys(v as object).sort());
        if (
          existing.client_id !== clientId ||
          existing.operation !== operation ||
          canonical(existing.payload) !== canonical(payload)
        )
          return {
            ...result({
              error: "request_id가 다른 요청에 이미 사용되었습니다.",
            }),
            isError: true,
          };
      }
      return result({ request_id: id, status: existing.status });
    }
    const { error } = await db
      .from("pending_actions")
      .insert({ id, user_id: userId, client_id: clientId, operation, payload });
    if (error) throw error;
    return result({
      request_id: id,
      status: "pending",
      message:
        "아직 변경되지 않았습니다. MY WORK AI의 연결 및 설정에서 내용을 확인하고 승인하세요.",
    });
  };
  server.registerTool(
    "create_task",
    {
      description:
        "업무 생성 제안. 앱 승인 후 저장됩니다. request_id는 재시도 시 같은 UUID를 사용하세요. 날짜/프로젝트가 모호하면 먼저 사용자에게 질문하세요.",
      inputSchema: {
        request_id: z.uuid(),
        title: z.string().min(1).max(300),
        description: z.string().max(5000).default(""),
        project_id: z.uuid().nullable().default(null),
        due_date: z.iso.date().nullable().default(null),
      },
      annotations: write,
    },
    async ({ request_id, ...payload }) =>
      pending("create_task", request_id, payload),
  );
  server.registerTool(
    "update_task",
    {
      description: "업무 수정 제안. 앱에서 사용자 확인 후 적용됩니다.",
      inputSchema: {
        request_id: z.uuid(),
        task_id: z.uuid(),
        title: z.string().min(1).max(300).optional(),
        description: z.string().max(5000).optional(),
        due_date: z.iso.date().nullable().optional(),
      },
      annotations: write,
    },
    async ({ request_id, ...payload }) =>
      pending("update_task", request_id, payload),
  );
  server.registerTool(
    "complete_task",
    {
      description: "업무 완료 제안. 앱에서 승인 후 적용됩니다.",
      inputSchema: { request_id: z.uuid(), task_id: z.uuid() },
      annotations: write,
    },
    async ({ request_id, ...payload }) =>
      pending("complete_task", request_id, payload),
  );
  server.registerTool(
    "create_goal",
    {
      description: "목표 생성 제안. 앱에서 검토하고 승인해야 저장됩니다.",
      inputSchema: {
        request_id: z.uuid(),
        title: z.string().min(1).max(300),
        description: z.string().max(5000).default(""),
        project_id: z.uuid().nullable().default(null),
        kpi: z.string().max(300).default(""),
        target: z.number().positive().default(100),
      },
      annotations: write,
    },
    async ({ request_id, ...payload }) =>
      pending("create_goal", request_id, payload),
  );
  return server;
}
