import { describe, expect, it } from "vitest";
import { clampPriority, STAFF_ROLES } from "./index";

describe("clampPriority", () => {
  it("passes in-range integers through", () => {
    expect(clampPriority(1)).toBe(1);
    expect(clampPriority(2)).toBe(2);
    expect(clampPriority(3)).toBe(3);
  });

  it("clamps out-of-range numbers into the 1..3 band", () => {
    expect(clampPriority(0)).toBe(1);
    expect(clampPriority(-4)).toBe(1);
    expect(clampPriority(5)).toBe(3);
  });

  it("rounds fractional values", () => {
    expect(clampPriority(2.4)).toBe(2);
    expect(clampPriority(2.6)).toBe(3);
  });

  it("falls back to 2 on non-finite input", () => {
    expect(clampPriority(NaN)).toBe(2);
    expect(clampPriority(Infinity)).toBe(2);
    expect(clampPriority(-Infinity)).toBe(2);
  });
});

describe("STAFF_ROLES", () => {
  it("lists all eight roles with no duplicates", () => {
    expect(STAFF_ROLES).toHaveLength(8);
    expect(new Set(STAFF_ROLES).size).toBe(8);
    expect(STAFF_ROLES).toContain("stewarding");
    expect(STAFF_ROLES).toContain("logistics");
  });
});
