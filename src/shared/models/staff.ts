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

/** Every staff role as a runtime list. Routes that offer roles to the model
 *  (demand, emergency) and validate an incoming role (tasks) share this one
 *  source so a new role can't silently drift across files. */
export const STAFF_ROLES = [
  "catering",
  "concessions",
  "stewarding",
  "security",
  "medical",
  "facilities",
  "traffic",
  "logistics",
] as const satisfies readonly StaffRole[];

/** Clamp any (possibly bad) number into the 1..3 priority band used by tasks,
 *  recommended actions, and evacuation orders. Non-finite input falls back to 2. */
export function clampPriority(n: number): 1 | 2 | 3 {
  if (!Number.isFinite(n)) return 2;
  return Math.min(3, Math.max(1, Math.round(n))) as 1 | 2 | 3;
}

export type TaskStatus = "pending" | "acked" | "in-progress" | "done";

/** What generated the task — lets the staff board group by cause. */
export type TaskOrigin =
  | "incident"
  | "demand"
  | "weather"
  | "traffic"
  | "match"
  | "copilot"
  | "emergency";

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
