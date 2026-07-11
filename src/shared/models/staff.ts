/** Tasking layer: the system doesn't just observe, it dispatches work to staff. */

export type StaffRole =
  | "catering"
  | "concessions"
  | "stewarding"
  | "security"
  | "medical"
  | "facilities"
  | "traffic"
  | "logistics";

export type TaskStatus = "pending" | "acked" | "in-progress" | "done";

/** What generated the task — lets the staff board group by cause. */
export type TaskOrigin = "incident" | "demand" | "weather" | "traffic" | "match" | "copilot";

export interface StaffTask {
  id: string;
  createdAtMinute: number;
  role: StaffRole;
  title: string;
  detail: string;
  /** 1 = do now, 2 = soon, 3 = when able. */
  priority: 1 | 2 | 3;
  origin: TaskOrigin;
  status: TaskStatus;
  /** Free-text deadline, e.g. "before kickoff", "by halftime". */
  dueBy?: string;
}
