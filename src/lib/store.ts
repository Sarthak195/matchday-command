import type { StaffTask } from "@/shared/models";

/**
 * In-memory dispatch queue: tasks pushed from the ops side (copilot, demand
 * plan) that the staff console polls. Single-instance by design — Cloud Run
 * runs with --max-instances 1 and a restart simply clears the shift's queue.
 */

const tasks: StaffTask[] = [];
let seq = 0;

export function listTasks(): StaffTask[] {
  return tasks;
}

export function addTask(
  input: Omit<StaffTask, "id" | "status"> & { status?: StaffTask["status"] },
): StaffTask {
  const task: StaffTask = { status: "pending", ...input, id: `task-srv-${seq++}` };
  tasks.push(task);
  if (tasks.length > 200) tasks.shift();
  return task;
}
