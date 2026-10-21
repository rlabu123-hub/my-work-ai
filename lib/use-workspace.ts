"use client";
import { useCallback, useEffect, useState } from "react";
import { browserDb, cloudConfigured } from "./supabase";
import { emptyData, type Data } from "./types";
const KEY = "my-work-ai-local-v1";
type Table = keyof Data;
export function useWorkspace() {
  const [data, setData] = useState<Data>(emptyData),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [user, setUser] = useState<string | null>(null),
    [synced, setSynced] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!cloudConfigured) return;
    const db = browserDb();
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (authError || !user) {
      setUser(null);
      setData(emptyData);
      setReady(true);
      return;
    }
    setUser(user.id);
    const tables = Object.keys(emptyData) as Table[];
    const rows = await Promise.all(
      tables.map((t) =>
        db.from(t).select("*").order("created_at", { ascending: true }),
      ),
    );
    const failure = rows.find((r) => r.error);
    if (failure?.error) {
      setError("데이터 조회 실패: " + failure.error.message);
      setReady(true);
      return;
    }
    setData(
      Object.fromEntries(tables.map((t, i) => [t, rows[i].data])) as Data,
    );
    setSynced(new Date().toISOString());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!cloudConfigured) {
      try {
        const saved = localStorage.getItem(KEY);
        if (saved) setData({ ...emptyData, ...JSON.parse(saved) });
      } catch {
        setError(
          "로컬 데이터를 읽지 못했습니다. 브라우저 저장 공간을 확인하세요.",
        );
      }
      setReady(true);
      const sync = (e: StorageEvent) => {
        if (e.key === KEY && e.newValue)
          try {
            setData({ ...emptyData, ...JSON.parse(e.newValue) });
          } catch {
            setError("로컬 데이터 형식이 올바르지 않습니다.");
          }
      };
      window.addEventListener("storage", sync);
      return () => window.removeEventListener("storage", sync);
    }
    const db = browserDb();
    void refresh();
    const {
      data: { subscription },
    } = db.auth.onAuthStateChange(() => {
      setTimeout(() => void refresh(), 0);
    });
    const channel = db
      .channel("workspace")
      .on(
        "postgres_changes",
        { event: "*", schema: "public" },
        () => void refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
          setError(
            "실시간 연결이 중단되었습니다. 새로고침하여 최신 데이터를 확인하세요.",
          );
      });
    return () => {
      subscription.unsubscribe();
      void db.removeChannel(channel);
    };
  }, [refresh]);
  async function mutate(
    table: Table,
    row: Record<string, unknown>,
    remove = false,
  ) {
    setBusy(true);
    setError("");
    try {
      if (cloudConfigured) {
        if (!user) throw new Error("먼저 로그인해 주세요.");
        const db = browserDb();
        const { _dependencies, ...cleanRow } = row;
        const result = remove
          ? await db.from(table).delete().eq("id", row.id).eq("user_id", user)
          : table === "tasks" && Array.isArray(_dependencies)
            ? await db.rpc("save_task_with_dependencies", {
                task_data: cleanRow,
                dependency_ids: _dependencies,
              })
            : await db.from(table).upsert({ ...cleanRow, user_id: user });
        if (result.error) throw result.error;
        await refresh();
      } else {
        const now = new Date().toISOString();
        const current = JSON.parse(
          localStorage.getItem(KEY) || JSON.stringify(emptyData),
        ) as Data;
        const { _dependencies, ...cleanRow } = row;
        row = cleanRow;
        current.task_dependencies ??= [];
        const rows = current[table] as unknown as Record<string, unknown>[];
        const exists = rows.some((r) => r.id === row.id);
        const nextRows = remove
          ? rows.filter((r) => r.id !== row.id)
          : exists
            ? rows.map((r) =>
                r.id === row.id ? { ...r, ...row, updated_at: now } : r,
              )
            : [...rows, { ...row, created_at: now, updated_at: now }];
        const next = { ...current, [table]: nextRows };
        if (table === "tasks") {
          if (remove)
            next.task_dependencies = current.task_dependencies.filter(
              (d) => d.task_id !== row.id && d.depends_on !== row.id,
            );
          else if (Array.isArray(_dependencies)) {
            const dependencies = [
              ...current.task_dependencies.filter((d) => d.task_id !== row.id),
              ..._dependencies.map((dep) => ({
                id: crypto.randomUUID(),
                task_id: row.id as string,
                depends_on: dep as string,
                created_at: now,
                updated_at: now,
              })),
            ];
            const visited = new Set<string>();
            const reaches = (id: string): boolean => {
              if (id === row.id) return true;
              if (visited.has(id)) return false;
              visited.add(id);
              return dependencies
                .filter((d) => d.task_id === id)
                .some((d) => reaches(d.depends_on));
            };
            if ((_dependencies as string[]).some(reaches))
              throw new Error("선행 업무가 순환합니다.");
            next.task_dependencies = dependencies;
          }
        }
        if (table === "tasks")
          next.activity_logs = [
            ...current.activity_logs,
            {
              id: crypto.randomUUID(),
              action: remove
                ? "task.delete"
                : exists
                  ? "task.update"
                  : "task.insert",
              entity_id: row.id as string,
              created_at: now,
              updated_at: now,
            },
          ];
        localStorage.setItem(KEY, JSON.stringify(next));
        setData(next);
        setSynced(now);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { data, ready, error, setError, user, synced, busy, mutate, refresh };
}
