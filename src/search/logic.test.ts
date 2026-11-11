import { describe, expect, it } from "vitest";
import {
  applySearchEvent,
  hitCount,
  idleSearch,
  isSearchable,
  MAX_HITS,
  normalizeQuery,
  searchSummary,
  startSearch,
  type SearchHit,
} from "./logic";

const hit = (n: number): SearchHit => ({ cfi: `epubcfi(/6/${n})`, excerpt: { pre: "a ", match: "x", post: " b" } });
const hits = (n: number, from = 0) => Array.from({ length: n }, (_, i) => hit(from + i));

describe("query handling", () => {
  it("normalises whitespace", () => {
    expect(normalizeQuery("  hello \n  world ")).toBe("hello world");
  });
  it("requires at least two characters", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" a ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
  });
});

describe("applySearchEvent", () => {
  it("starts empty and searching", () => {
    const s = startSearch("  moon ");
    expect(s).toMatchObject({ query: "moon", status: "searching", progress: 0, groups: [], truncated: false });
  });

  it("tracks progress, clamped to 0..1", () => {
    let s = startSearch("moon");
    s = applySearchEvent(s, { progress: 0.4 });
    expect(s.progress).toBe(0.4);
    expect(applySearchEvent(s, { progress: 7 }).progress).toBe(1);
    expect(applySearchEvent(s, { progress: -1 }).progress).toBe(0);
  });

  it("collects hits per chapter in order", () => {
    let s = startSearch("moon");
    s = applySearchEvent(s, { label: "One", subitems: hits(2) });
    s = applySearchEvent(s, { label: "Two", subitems: hits(1, 10) });
    expect(s.groups.map((g) => [g.label, g.hits.length])).toEqual([["One", 2], ["Two", 1]]);
    expect(hitCount(s)).toBe(3);
  });

  it("merges consecutive events for the same chapter", () => {
    let s = startSearch("moon");
    s = applySearchEvent(s, { label: "One", subitems: hits(1) });
    s = applySearchEvent(s, { label: "One", subitems: hits(2, 5) });
    expect(s.groups).toHaveLength(1);
    expect(s.groups[0].hits).toHaveLength(3);
  });

  it("labels untitled chapters", () => {
    const s = applySearchEvent(startSearch("moon"), { label: "  ", subitems: hits(1) });
    expect(s.groups[0].label).toBe("Untitled");
  });

  it("ignores events with no hits", () => {
    const s = startSearch("moon");
    expect(applySearchEvent(s, { label: "One", subitems: [] })).toBe(s);
  });

  it("caps results and flags truncation", () => {
    let s = startSearch("e");
    s = applySearchEvent(s, { label: "One", subitems: hits(MAX_HITS - 1) });
    s = applySearchEvent(s, { label: "Two", subitems: hits(5, 1000) });
    expect(hitCount(s)).toBe(MAX_HITS);
    expect(s.truncated).toBe(true);
    // Further events add nothing.
    expect(hitCount(applySearchEvent(s, { label: "Three", subitems: hits(3, 2000) }))).toBe(MAX_HITS);
  });

  it("finishes", () => {
    const s = applySearchEvent(startSearch("moon"), "done");
    expect(s).toMatchObject({ status: "done", progress: 1 });
  });

  it("does not mutate the previous state", () => {
    const a = startSearch("moon");
    const b = applySearchEvent(a, { label: "One", subitems: hits(1) });
    expect(a.groups).toHaveLength(0);
    expect(b.groups).toHaveLength(1);
  });
});

describe("searchSummary", () => {
  it("describes each stage", () => {
    expect(searchSummary(idleSearch)).toBe("");
    expect(searchSummary(startSearch("moon"))).toBe("Searching…");
    let s = applySearchEvent(startSearch("moon"), { label: "One", subitems: hits(2) });
    expect(searchSummary(s)).toBe("2 found so far…");
    s = applySearchEvent(s, "done");
    expect(searchSummary(s)).toBe("2 matches");
    expect(searchSummary(applySearchEvent(startSearch("x"), "done"))).toBe("No matches");
    expect(searchSummary(applySearchEvent(applySearchEvent(startSearch("x"), { subitems: hits(1) }), "done"))).toBe("1 match");
  });
});
