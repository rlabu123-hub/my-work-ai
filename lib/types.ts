export type Status = "todo" | "doing" | "done" | "hold";
export type Task = {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  project_id: string | null;
  goal_id: string | null;
  start_date: string | null;
  due_date: string | null;
  importance: number;
  urgency: number;
  estimated_minutes: number;
  actual_minutes: number;
  status: Status;
  manual_priority: number | null;
  notes: string;
  position: number;
  created_at: string;
  updated_at: string;
};
export type Project = {
  id: string;
  user_id?: string;
  title: string;
  description: string;
  due_date: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
};
export type Goal = {
  id: string;
  user_id?: string;
  project_id: string | null;
  parent_id: string | null;
  period: "long" | "month" | "week";
  title: string;
  description: string;
  kpi: string;
  target: number;
  actual: number;
  owner: string;
  start_date: string | null;
  due_date: string | null;
  status: Status;
  created_at: string;
  updated_at: string;
};
export type Schedule = {
  id: string;
  user_id?: string;
  title: string;
  task_id: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  updated_at: string;
};
export type Meeting = {
  id: string;
  user_id?: string;
  project_id: string | null;
  title: string;
  transcript: string;
  summary: string;
  action_items: {
    title: string;
    owner: string | null;
    due_date: string | null;
  }[];
  created_at: string;
  updated_at: string;
};
export type Activity = {
  id: string;
  user_id?: string;
  action: string;
  entity_id: string | null;
  created_at: string;
  updated_at: string;
};
export type Dependency = {
  id: string;
  user_id?: string;
  task_id: string;
  depends_on: string;
  created_at: string;
  updated_at: string;
};
export type Data = {
  task_dependencies: Dependency[];
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  schedules: Schedule[];
  meeting_notes: Meeting[];
  activity_logs: Activity[];
};
export const emptyData: Data = {
  task_dependencies: [],
  tasks: [],
  projects: [],
  goals: [],
  schedules: [],
  meeting_notes: [],
  activity_logs: [],
};
export const statusLabels: Record<Status, string> = {
  todo: "예정",
  doing: "진행 중",
  done: "완료",
  hold: "보류",
};
