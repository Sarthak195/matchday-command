import { describe, expect, it } from "vitest";
import { addTask, listTasks } from "./store";
import type { StaffTask } from "@/shared/models";

const draft = (over: Partial<StaffTask> = {}) => ({
  createdAtMinute: 40,
  role: "stewarding" as const,
  title: "Reinforce North Concourse",
  detail: "Move two stewards to Gate A overflow.",
  priority: 2 as const,
  origin: "copilot" as const,
  ...over,
});

describe("dispatch store", () => {
  it("assigns an id and defaults new tasks to pending", () => {
    const task = addTask(draft());
    expect(task.id).toMatch(/^task-srv-\d+$/);
    expect(task.status).toBe("pending");
  });

  it("issues distinct ids to successive tasks and exposes them via listTasks", () => {
    const a = addTask(draft({ title: "A" }));
    const b = addTask(draft({ title: "B" }));
    expect(a.id).not.toBe(b.id);
    const ids = listTasks().map((t) => t.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it("respects an explicit status override", () => {
    const task = addTask(draft({ status: "in-progress" }));
    expect(task.status).toBe("in-progress");
  });

  it("caps the queue so a long shift cannot grow unbounded", () => {
    for (let i = 0; i < 250; i++) addTask(draft({ title: `bulk-${i}` }));
    expect(listTasks().length).toBeLessThanOrEqual(200);
  });
});
