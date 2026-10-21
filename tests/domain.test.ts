import { test } from "node:test";
import assert from "node:assert/strict";
import { priority, rankedTasks, seoulDate, weeklyReview } from "../lib/domain";
import { emptyData, type Task } from "../lib/types";
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    title: "업무",
    description: "",
    project_id: null,
    goal_id: null,
    start_date: null,
    due_date: null,
    importance: 3,
    urgency: 3,
    estimated_minutes: 30,
    actual_minutes: 0,
    status: "todo",
    manual_priority: null,
    notes: "",
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
test("Seoul date rolls forward at 15:00 UTC", () => {
  assert.equal(seoulDate(new Date("2026-10-20T15:01:00Z")), "2026-10-21");
  assert.equal(seoulDate(new Date("2026-10-20T14:59:00Z")), "2026-10-20");
});
test("overdue urgent KPI task outranks routine work and explains why", () => {
  const routine = task();
  const urgent = task({
    importance: 5,
    urgency: 5,
    due_date: "2026-10-20",
    goal_id: crypto.randomUUID(),
  });
  const r = priority(urgent, "2026-10-21");
  assert.equal(r.level, 0);
  assert.ok(r.score > priority(routine, "2026-10-21").score);
  assert.match(r.reason, /지연/);
  assert.match(r.reason, /KPI/);
});
test("manual P3 persists despite P0 recommendation", () => {
  const r = priority(
    task({
      importance: 5,
      urgency: 5,
      due_date: "2026-10-20",
      manual_priority: 3,
    }),
    "2026-10-21",
  );
  assert.equal(r.level, 3);
  assert.equal(r.suggested, 0);
});
test("ten tasks produce top three without done, hold, or future work", () => {
  const tasks = Array.from({ length: 10 }, (_, i) =>
    task({
      title: `업무 ${i}`,
      importance: (i % 5) + 1,
      urgency: (i % 5) + 1,
      position: i,
    }),
  );
  tasks[0].status = "done";
  tasks[1].status = "hold";
  tasks[2].start_date = "2099-01-01";
  const ranked = rankedTasks({ ...emptyData, tasks });
  assert.equal(ranked.length, 7);
  assert.equal(ranked.slice(0, 3).length, 3);
  assert.ok(ranked.every((r) => r.reason.length > 0));
  assert.ok(!ranked.some((r) => r.task.id === tasks[2].id));
});
test("available time warns on oversized work", () => {
  assert.match(
    priority(task({ estimated_minutes: 180 }), "2026-10-21", [], 120).reason,
    /분할/,
  );
});
test("review distinguishes completed work in the selected period", () => {
  const tasks = [
    task({ status: "done", actual_minutes: 20 }),
    task({
      status: "done",
      updated_at: "2020-01-01T00:00:00Z",
      actual_minutes: 80,
    }),
    task(),
  ];
  const review = weeklyReview({ ...emptyData, tasks });
  assert.match(review, /기간 내 완료: 1건/);
  assert.match(review, /미완료: 1건/);
  assert.match(review, /20분/);
});

test("unfinished prerequisite blocks focus until completed", () => {
  const first = task(),
    second = task();
  const data = {
    ...emptyData,
    tasks: [first, second],
    task_dependencies: [
      {
        id: crypto.randomUUID(),
        task_id: second.id,
        depends_on: first.id,
        created_at: "",
        updated_at: "",
      },
    ],
  };
  assert.equal(rankedTasks(data).length, 1);
  first.status = "done";
  assert.equal(rankedTasks(data)[0].task.id, second.id);
});
