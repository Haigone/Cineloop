import { describe, expect, it } from "vitest";
import { segmentAngle, segmentAtPointer, targetRotation } from "@/domain/wheel";

describe("spin wheel geometry", () => {
  it("splits the circle evenly", () => {
    expect(segmentAngle(4)).toBe(90);
    expect(segmentAngle(12)).toBe(30);
  });

  it("reads the segment under the pointer, clockwise from 12 o'clock", () => {
    expect(segmentAtPointer(0, 4)).toBe(0);
    // Turning the wheel clockwise by 90° brings the last segment under the pointer.
    expect(segmentAtPointer(90, 4)).toBe(3);
    expect(segmentAtPointer(-90, 4)).toBe(1);
    expect(segmentAtPointer(720 + 1, 4)).toBe(3);
    expect(segmentAtPointer(0, 0)).toBe(-1);
  });

  it.each([
    [0, 0, 5],
    [123.4, 3, 7],
    [-50, 11, 12],
    [3600, 1, 2],
  ])("lands on the requested segment (current %d, index %d of %d)", (current, index, count) => {
    for (const jitter of [-0.5, 0, 0.5]) {
      const end = targetRotation(current, index, count, 6, jitter);
      expect(segmentAtPointer(end, count)).toBe(index);
      // Always spins forward, at least the requested number of turns.
      expect(end - current).toBeGreaterThanOrEqual(6 * 360);
      expect(end - current).toBeLessThan(7 * 360);
    }
  });

  it("keeps the stop away from segment edges", () => {
    const count = 6;
    const end = targetRotation(0, 2, count, 0, 10);
    const within = (((-end % 360) + 360) % 360) / segmentAngle(count) - 2;
    expect(within).toBeGreaterThan(0.1);
    expect(within).toBeLessThan(0.9);
  });
});
