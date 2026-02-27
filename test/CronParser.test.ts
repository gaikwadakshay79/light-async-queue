import { describe, it, expect } from "vitest";
import { CronParser } from "../src/utils/CronParser.js";

describe("CronParser", () => {
  it("should calculate next run time for a valid cron pattern", () => {
    const parser = new CronParser("*/5 * * * *");
    const from = new Date("2026-01-01T10:02:00.000Z").getTime();

    const nextRun = parser.getNextRunTime(from);

    expect(nextRun).toBe(new Date("2026-01-01T10:05:00.000Z").getTime());
  });

  it("should throw for an invalid cron pattern", () => {
    const parser = new CronParser("not-a-cron");

    expect(() => parser.getNextRunTime()).toThrow(/Invalid cron pattern/);
  });
});
