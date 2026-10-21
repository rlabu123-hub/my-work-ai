"use client";
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { browserNotifications } from "@/lib/notifications";
import { browserDb, cloudConfigured } from "@/lib/supabase";
import type { Data } from "@/lib/types";
export default function Reminders({
  data,
  onError,
  visible,
}: {
  data: Data;
  onError: (s: string) => void;
  visible: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    [permission, setPermission] = useState<string>("확인 중");
  const sent = useRef(new Set<string>());
  useEffect(() => {
    setPermission(browserNotifications.permission());
    if (cloudConfigured) {
      void browserDb()
        .from("notification_preferences")
        .select("enabled")
        .maybeSingle()
        .then(({ data }) => {
          if (data) setEnabled(data.enabled);
        });
    } else setEnabled(localStorage.getItem("my-work-notifications") === "true");
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (browserNotifications.permission() !== "granted") return;
      const now = Date.now();
      for (const s of data.schedules) {
        const remaining = Date.parse(s.starts_at) - now;
        const tag = s.id + s.starts_at;
        if (
          remaining >= 0 &&
          remaining <= 15 * 60000 &&
          !sent.current.has(tag)
        ) {
          sent.current.add(tag);
          browserNotifications.show(
            "곧 시작할 일정",
            s.title + " · 15분 이내 시작",
            tag,
          );
        }
      }
      for (const t of data.tasks) {
        const deadline = t.due_date
          ? Date.parse(t.due_date + "T23:59:59+09:00")
          : 0;
        const tag = t.id + t.due_date;
        if (
          t.status !== "done" &&
          deadline >= now &&
          deadline - now <= 15 * 60000 &&
          !sent.current.has(tag)
        ) {
          sent.current.add(tag);
          browserNotifications.show("오늘 마감할 업무", t.title, tag);
        }
      }
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, [enabled, data]);
  async function toggle() {
    try {
      if (!enabled) {
        const p = await browserNotifications.request();
        setPermission(p);
        if (p !== "granted") {
          onError(
            p === "unsupported"
              ? "이 브라우저에서는 알림을 지원하지 않습니다."
              : "브라우저 설정에서 알림 권한을 허용하세요.",
          );
          return;
        }
      }
      const next = !enabled;
      if (cloudConfigured) {
        const db = browserDb();
        const {
          data: { user },
        } = await db.auth.getUser();
        if (!user) throw new Error("로그인 후 설정해 주세요.");
        const { error } = await db
          .from("notification_preferences")
          .upsert(
            { user_id: user.id, enabled: next, minutes_before: 15 },
            { onConflict: "user_id" },
          );
        if (error) throw error;
      } else localStorage.setItem("my-work-notifications", String(next));
      setEnabled(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "알림 설정 실패");
    }
  }
  return visible ? (
    <section className="panel settings-card reminder-settings">
      <h2>업무 알림</h2>
      <p>
        앱을 열어 둔 동안 일정 시작 15분 전, 마감일 종료(23:59 한국 시간) 15분
        전에 알립니다. 백그라운드·화면 잠금·앱 종료 상태의 푸시 알림은 제공하지
        않습니다.
      </p>
      <button className="outline" onClick={toggle}>
        <Bell size={15} />
        {enabled ? "알림 끄기" : "브라우저 알림 켜기"}
      </button>
      <small className="muted">
        권한: {permission} · {enabled ? "사용" : "사용 안 함"}
      </small>
    </section>
  ) : null;
}
