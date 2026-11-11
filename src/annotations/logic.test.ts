import { describe, expect, it } from "vitest";
import { bookmarksOnPage, excerpt, groupByChapter, isOnPage, sortByPosition, toMarkdown } from "./logic";
import type { Annotation } from "./types";

const mk = (o: Partial<Annotation> & { id: string; cfi: string }): Annotation => ({
  bookId: "b",
  kind: "highlight",
  color: "yellow",
  text: "text",
  note: "",
  label: "Chapter 1",
  fraction: 0,
  createdAt: 1,
  updatedAt: 1,
  ...o,
});

// Real-shaped CFIs: spine item, then a path inside the document.
const A = "epubcfi(/6/4!/4/2/1:0)";
const B = "epubcfi(/6/4!/4/8/1:10)";
const C = "epubcfi(/6/8!/4/2/1:0)";
const RANGE_AB = "epubcfi(/6/4!/4,/2/1:0,/8/1:50)"; // page covering A .. past B

describe("sortByPosition", () => {
  it("orders by position in the book, not by creation time", () => {
    const list = [mk({ id: "c", cfi: C, createdAt: 1 }), mk({ id: "a", cfi: A, createdAt: 3 }), mk({ id: "b", cfi: B, createdAt: 2 })];
    expect(sortByPosition(list).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("does not mutate its input", () => {
    const list = [mk({ id: "b", cfi: B }), mk({ id: "a", cfi: A })];
    sortByPosition(list);
    expect(list.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("isOnPage", () => {
  it("is true for a position inside the visible range", () => {
    expect(isOnPage(A, RANGE_AB)).toBe(true);
    expect(isOnPage(B, RANGE_AB)).toBe(true);
  });
  it("is false for a position in a later section", () => {
    expect(isOnPage(C, RANGE_AB)).toBe(false);
  });
  it("is false when there is no page yet or the CFI is unusable", () => {
    expect(isOnPage(A, undefined)).toBe(false);
    expect(isOnPage("not a cfi", RANGE_AB)).toBe(false);
  });
});

describe("bookmarksOnPage", () => {
  it("returns only bookmarks on the page", () => {
    const list = [
      mk({ id: "bm1", kind: "bookmark", cfi: B }),
      mk({ id: "bm2", kind: "bookmark", cfi: C }),
      mk({ id: "hl", kind: "highlight", cfi: A }),
    ];
    expect(bookmarksOnPage(list, RANGE_AB).map((x) => x.id)).toEqual(["bm1"]);
  });
});

describe("groupByChapter", () => {
  it("groups consecutive items by chapter in reading order", () => {
    const list = [
      mk({ id: "c", cfi: C, label: "Two" }),
      mk({ id: "a", cfi: A, label: "One" }),
      mk({ id: "b", cfi: B, label: "One" }),
    ];
    const g = groupByChapter(list);
    expect(g.map((x) => x.label)).toEqual(["One", "Two"]);
    expect(g[0].items.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("labels blank chapters", () => {
    expect(groupByChapter([mk({ id: "a", cfi: A, label: "  " })])[0].label).toBe("Untitled");
  });
});

describe("toMarkdown", () => {
  it("renders title, chapters, quotes, notes and bookmarks", () => {
    const md = toMarkdown({ title: "Dracula", author: "Bram Stoker" }, [
      mk({ id: "a", cfi: A, label: "Chapter I", text: "Line one\nLine two", note: "Spooky" }),
      mk({ id: "b", cfi: C, label: "Chapter II", kind: "bookmark", fraction: 0.42, text: "" }),
    ]);
    expect(md).toContain("# Dracula");
    expect(md).toContain("*Bram Stoker*");
    expect(md).toContain("## Chapter I");
    expect(md).toContain("> Line one\n> Line two");
    expect(md).toContain("**Note:** Spooky");
    expect(md).toContain("## Chapter II");
    expect(md).toContain("- Bookmark at 42%");
  });
  it("handles an empty list", () => {
    expect(toMarkdown({ title: "T", author: "" }, [])).toBe("# T\n");
  });
});

describe("excerpt", () => {
  it("collapses whitespace and truncates", () => {
    expect(excerpt("a   b\n c")).toBe("a b c");
    expect(excerpt("x".repeat(600), 10)).toBe("xxxxxxxxx…");
  });
});
