import { describe, expect, it } from "vitest";
import {
  addDays,
  currentStreak,
  dayKey,
  formatDuration,
  lastNDays,
  secondsOn,
  shouldCount,
  topBooks,
  totalSeconds,
  weekdayInitial,
  weekdayName,
  type ReadingRow,
} from "./logic";

const row = (day: string, bookId: string, seconds: number): ReadingRow => ({ key: `${day}|${bookId}`, day, bookId, seconds });

describe("days", () => {
  it("formats the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dayKey(new Date(2026, 10, 11, 0, 1))).toBe("2026-11-11");
  });
  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("names weekdays", () => {
    expect(weekdayName("2026-11-11")).toBe("Wednesday");
    expect(weekdayInitial("2026-11-15")).toBe("S");
  });
});

describe("shouldCount", () => {
  const base = { now: 100_000, lastActivity: 100_000, visible: true };
  it("counts while visible and recently active", () => {
    expect(shouldCount(base)).toBe(true);
    expect(shouldCount({ ...base, now: 100_000 + 90_000 })).toBe(true);
  });
  it("stops when idle or hidden", () => {
    expect(shouldCount({ ...base, now: 100_000 + 90_001 })).toBe(false);
    expect(shouldCount({ ...base, visible: false })).toBe(false);
  });
});

describe("aggregations", () => {
  const rows = [row("2026-11-11", "a", 600), row("2026-11-11", "b", 300), row("2026-11-09", "a", 120)];
  it("totals", () => {
    expect(totalSeconds(rows)).toBe(1020);
    expect(secondsOn(rows, "2026-11-11")).toBe(900);
    expect(secondsOn(rows, "2026-11-10")).toBe(0);
  });
  it("lists the last n days oldest first, including empty days", () => {
    const d = lastNDays(rows, 4, "2026-11-11");
    expect(d.map((x) => x.day)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11"]);
    expect(d.map((x) => x.seconds)).toEqual([0, 120, 0, 900]);
  });
  it("ranks books by time and drops unread ones", () => {
    const top = topBooks(rows, [{ id: "a", title: "A" }, { id: "b", title: "B" }, { id: "c", title: "C" }], 5);
    expect(top).toEqual([{ id: "a", title: "A", seconds: 720 }, { id: "b", title: "B", seconds: 300 }]);
    expect(topBooks(rows, [{ id: "a", title: "A" }, { id: "b", title: "B" }], 1)).toHaveLength(1);
  });
});

describe("currentStreak", () => {
  const day = (d: string, s = 120) => row(d, "a", s);
  it("counts consecutive days ending today", () => {
    expect(currentStreak([day("2026-11-09"), day("2026-11-10"), day("2026-11-11")], "2026-11-11")).toBe(3);
  });
  it("does not break when today has not reached the minimum yet", () => {
    expect(currentStreak([day("2026-11-09"), day("2026-11-10"), day("2026-11-11", 10)], "2026-11-11")).toBe(2);
    expect(currentStreak([day("2026-11-09"), day("2026-11-10")], "2026-11-11")).toBe(2);
  });
  it("breaks on a missed day", () => {
    expect(currentStreak([day("2026-11-08"), day("2026-11-10"), day("2026-11-11")], "2026-11-11")).toBe(2);
    expect(currentStreak([day("2026-11-08")], "2026-11-11")).toBe(0);
  });
  it("sums several books on the same day toward the minimum", () => {
    expect(currentStreak([row("2026-11-11", "a", 30), row("2026-11-11", "b", 40)], "2026-11-11")).toBe(1);
  });
  it("is zero with no data", () => {
    expect(currentStreak([], "2026-11-11")).toBe(0);
  });
});

describe("formatDuration", () => {
  it("formats ranges", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(20)).toBe("<1 min");
    expect(formatDuration(60)).toBe("1 min");
    expect(formatDuration(25 * 60)).toBe("25 min");
    expect(formatDuration(3600)).toBe("1h");
    expect(formatDuration(3600 + 5 * 60)).toBe("1h 05m");
    expect(formatDuration(-5)).toBe("0 min");
  });
});
