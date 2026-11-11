import { describe, expect, it } from "vitest";
import { bookId, continueReading, coverColors, countByStatus, filterBooks, sortBooks, statusOf } from "./logic";
import type { Book } from "./types";

const mk = (o: Partial<Book> & { id: string }): Book => ({
  title: o.id,
  author: "",
  format: "epub",
  size: 1,
  addedAt: 0,
  lastOpenedAt: null,
  progress: 0,
  cfi: null,
  hasCover: false,
  ...o,
});

describe("statusOf", () => {
  it("classifies", () => {
    expect(statusOf(mk({ id: "a" }))).toBe("new");
    expect(statusOf(mk({ id: "a", progress: 0.4, lastOpenedAt: 5 }))).toBe("reading");
    expect(statusOf(mk({ id: "a", progress: 0.99, lastOpenedAt: 5 }))).toBe("finished");
  });
  it("treats opened-but-at-0% as new", () => {
    expect(statusOf(mk({ id: "a", progress: 0, lastOpenedAt: 5 }))).toBe("new");
  });
});

describe("filterBooks", () => {
  const books = [mk({ id: "1", title: "Dracula", author: "Bram Stoker" }), mk({ id: "2", title: "Emma", author: "Jane Austen" })];
  it("matches title or author, case-insensitively", () => {
    expect(filterBooks(books, "drac").map((b) => b.id)).toEqual(["1"]);
    expect(filterBooks(books, "AUSTEN").map((b) => b.id)).toEqual(["2"]);
  });
  it("returns everything for a blank query", () => {
    expect(filterBooks(books, "  ")).toHaveLength(2);
  });
});

describe("sortBooks", () => {
  const books = [
    mk({ id: "b", title: "Beta", author: "Zed", addedAt: 1, lastOpenedAt: null }),
    mk({ id: "a", title: "alpha", author: "Amy", addedAt: 3, lastOpenedAt: 10 }),
    mk({ id: "c", title: "Chapter 10", author: "Amy", addedAt: 2, lastOpenedAt: 20 }),
  ];
  it("sorts by title ignoring case", () => {
    expect(sortBooks(books, "title").map((b) => b.id)).toEqual(["a", "b", "c"]);
  });
  it("sorts by author then title", () => {
    expect(sortBooks(books, "author").map((b) => b.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts by added, newest first", () => {
    expect(sortBooks(books, "added").map((b) => b.id)).toEqual(["a", "c", "b"]);
  });
  it("sorts by recent: opened first, newest first, then unopened", () => {
    expect(sortBooks(books, "recent").map((b) => b.id)).toEqual(["c", "a", "b"]);
  });
  it("does not mutate the input", () => {
    const copy = [...books];
    sortBooks(books, "title");
    expect(books).toEqual(copy);
  });
});

describe("continueReading", () => {
  it("returns in-progress books, most recently opened first, limited", () => {
    const books = [
      mk({ id: "1", progress: 0.2, lastOpenedAt: 1 }),
      mk({ id: "2", progress: 0.5, lastOpenedAt: 3 }),
      mk({ id: "3", progress: 1, lastOpenedAt: 9 }),
      mk({ id: "4", progress: 0.1, lastOpenedAt: 2 }),
      mk({ id: "5" }),
    ];
    expect(continueReading(books, 2).map((b) => b.id)).toEqual(["2", "4"]);
  });
});

describe("countByStatus", () => {
  it("counts", () => {
    const c = countByStatus([mk({ id: "1" }), mk({ id: "2", progress: 0.5, lastOpenedAt: 1 }), mk({ id: "3", progress: 1, lastOpenedAt: 1 })]);
    expect(c).toEqual({ all: 3, new: 1, reading: 1, finished: 1 });
  });
});

describe("coverColors", () => {
  it("is deterministic and differs between titles", () => {
    expect(coverColors("Dracula")).toEqual(coverColors("Dracula"));
    expect(coverColors("Dracula").bg).not.toBe(coverColors("Emma").bg);
  });
});

describe("bookId", () => {
  it("is stable for equal content and 16 hex chars", async () => {
    const a = new TextEncoder().encode("hello").buffer as ArrayBuffer;
    const b = new TextEncoder().encode("hello").buffer as ArrayBuffer;
    const c = new TextEncoder().encode("hellp").buffer as ArrayBuffer;
    expect(await bookId(a)).toBe(await bookId(b));
    expect(await bookId(a)).not.toBe(await bookId(c));
    expect(await bookId(a)).toMatch(/^[0-9a-f]{16}$/);
  });
});
