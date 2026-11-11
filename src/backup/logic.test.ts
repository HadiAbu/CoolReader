import { describe, expect, it } from "vitest";
import type { Annotation } from "../annotations/types";
import type { Book } from "../library/types";
import type { ReadingRow } from "../stats/logic";
import { backupFilename, buildBackup, MAX_BACKUP_BYTES, parseBackup, planRestore, restoreSummary, type BackupFile } from "./logic";

const book = (o: Partial<Book> & { id: string }): Book => ({
  title: o.id, author: "A", format: "epub", size: 1, addedAt: 1, lastOpenedAt: null, progress: 0, cfi: null, hasCover: false, ...o,
});
const note = (o: Partial<Annotation> & { id: string; bookId: string }): Annotation => ({
  kind: "highlight", cfi: "epubcfi(/6/4!/4/2/1:0)", color: "yellow", text: "t", note: "", label: "L", fraction: 0.1, createdAt: 1, updatedAt: 1, ...o,
});

describe("buildBackup", () => {
  it("groups annotations by book and skips untouched books", () => {
    const b = buildBackup(
      [book({ id: "read", progress: 0.4, lastOpenedAt: 5, cfi: "c" }), book({ id: "notes" }), book({ id: "untouched" })],
      [note({ id: "n1", bookId: "notes" })],
      99,
    );
    expect(b.books.map((x) => x.id)).toEqual(["read", "notes"]);
    expect(b.books[1].annotations).toHaveLength(1);
    expect(b).toMatchObject({ format: "folio-backup", version: 1, exportedAt: 99 });
  });
});

describe("parseBackup", () => {
  const good = (): BackupFile => buildBackup([book({ id: "b", progress: 0.5, lastOpenedAt: 3, cfi: "c" })], [note({ id: "n", bookId: "b" })], 1);

  it("round-trips a built backup", () => {
    const r = parseBackup(JSON.stringify(good()));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.skipped).toBe(0);
      expect(r.backup.books[0].annotations[0].id).toBe("n");
    }
  });

  it("rejects non-JSON, wrong format and unknown versions with a readable error", () => {
    expect(parseBackup("nope")).toMatchObject({ ok: false, error: expect.stringContaining("not valid JSON") });
    expect(parseBackup(JSON.stringify({ hello: 1 }))).toMatchObject({ ok: false, error: expect.stringContaining("not a Folio backup") });
    expect(parseBackup(JSON.stringify({ ...good(), version: 2 }))).toMatchObject({ ok: false, error: expect.stringContaining("different version") });
    expect(parseBackup(JSON.stringify({ ...good(), books: "x" }))).toMatchObject({ ok: false });
  });

  it("skips malformed annotations and counts them", () => {
    const f = good() as unknown as { books: { annotations: unknown[] }[] };
    f.books[0].annotations.push({ id: "bad" }, "junk", { ...(f.books[0].annotations[0] as object), id: "x", color: "purple" });
    const r = parseBackup(JSON.stringify(f));
    expect(r.ok && r.skipped).toBe(3);
    expect(r.ok && r.backup.books[0].annotations).toHaveLength(1);
  });

  it("forces annotations to belong to their enclosing book", () => {
    const f = good();
    f.books[0].annotations[0] = { ...f.books[0].annotations[0], bookId: "someone-else" };
    const r = parseBackup(JSON.stringify(f));
    expect(r.ok && r.backup.books[0].annotations[0].bookId).toBe("b");
  });

  it("clamps out-of-range numbers and fills defaults", () => {
    const r = parseBackup(JSON.stringify({ format: "folio-backup", version: 1, books: [{ id: "z", progress: 9 }] }));
    expect(r.ok && r.backup.books[0]).toMatchObject({ progress: 1, title: "Untitled", author: "", cfi: null, annotations: [] });
  });
});

describe("reading history in backups", () => {
  const rr = (day: string, bookId: string, seconds: number): ReadingRow => ({ key: `${day}|${bookId}`, day, bookId, seconds });
  const base = (reading?: unknown): BackupFile =>
    ({ format: "folio-backup", version: 1, exportedAt: 1, books: [], ...(reading ? { reading } : {}) }) as BackupFile;

  it("is included only when there is some, and round-trips", () => {
    expect(buildBackup([], [], 1, []).reading).toBeUndefined();
    const b = buildBackup([], [], 1, [rr("2026-11-10", "a", 120)]);
    expect(b.reading).toEqual([{ day: "2026-11-10", bookId: "a", seconds: 120 }]);
    const r = parseBackup(JSON.stringify(b));
    expect(r.ok && r.backup.reading).toEqual([{ day: "2026-11-10", bookId: "a", seconds: 120 }]);
  });

  it("old backups without it still load", () => {
    const r = parseBackup(JSON.stringify(base()));
    expect(r.ok && r.backup.reading).toEqual([]);
  });

  it("skips malformed rows and counts them", () => {
    const r = parseBackup(JSON.stringify(base([
      { day: "2026-11-10", bookId: "a", seconds: 60 },
      { day: "yesterday", bookId: "a", seconds: 60 },
      { day: "2026-11-10", bookId: "", seconds: 60 },
      { day: "2026-11-10", bookId: "a", seconds: -5 },
      "junk",
    ])));
    expect(r.ok && r.backup.reading).toHaveLength(1);
    expect(r.ok && r.skipped).toBe(4);
  });

  it("restores only the days where the backup has more time (never adds, so repeats are safe)", () => {
    const backup = base([
      { day: "2026-11-10", bookId: "a", seconds: 600 },
      { day: "2026-11-09", bookId: "a", seconds: 100 },
      { day: "2026-11-08", bookId: "b", seconds: 50 },
    ]);
    const have = [rr("2026-11-10", "a", 300), rr("2026-11-09", "a", 900)];
    const p = planRestore(backup, [], new Map(), have);
    expect(p.readingToPut.map((r) => [r.key, r.seconds])).toEqual([["2026-11-10|a", 600], ["2026-11-08|b", 50]]);
    expect(p.summary.readingDays).toBe(2);
    // Applying the plan and restoring again changes nothing
    const after = [...have.filter((h) => !p.readingToPut.some((r) => r.key === h.key)), ...p.readingToPut];
    expect(planRestore(backup, [], new Map(), after).readingToPut).toEqual([]);
  });
});

describe("planRestore", () => {
  const backup = (over: Partial<BackupFile["books"][number]> = {}): BackupFile => ({
    format: "folio-backup", version: 1, exportedAt: 1,
    books: [{ id: "b", title: "Book B", author: "", progress: 0.7, cfi: "c2", lastOpenedAt: 100, annotations: [note({ id: "n1", bookId: "b", updatedAt: 10 })], ...over }],
  });

  it("adds new annotations and restores a more recent position", () => {
    const p = planRestore(backup(), [book({ id: "b", lastOpenedAt: 50, progress: 0.2, cfi: "c1" })], new Map());
    expect(p.annotationsToPut.map((a) => a.id)).toEqual(["n1"]);
    expect(p.progressUpdates).toEqual([{ id: "b", progress: 0.7, cfi: "c2", lastOpenedAt: 100 }]);
    expect(p.summary).toMatchObject({ annotationsAdded: 1, annotationsUpdated: 0, progressRestored: 1, missingBooks: [] });
  });

  it("keeps the local position when it is more recent", () => {
    const p = planRestore(backup(), [book({ id: "b", lastOpenedAt: 500, progress: 0.9, cfi: "c9" })], new Map());
    expect(p.progressUpdates).toEqual([]);
  });

  it("only replaces an existing annotation when the backup copy is newer", () => {
    const lib = [book({ id: "b" })];
    const older = new Map([["b", [note({ id: "n1", bookId: "b", updatedAt: 20 })]]]);
    expect(planRestore(backup(), lib, older).annotationsToPut).toEqual([]);
    const stale = new Map([["b", [note({ id: "n1", bookId: "b", updatedAt: 5 })]]]);
    const p = planRestore(backup(), lib, stale);
    expect(p.annotationsToPut).toHaveLength(1);
    expect(p.summary.annotationsUpdated).toBe(1);
  });

  it("keeps notes for books not in the library yet and reports them", () => {
    const p = planRestore(backup(), [], new Map());
    expect(p.annotationsToPut).toHaveLength(1);
    expect(p.progressUpdates).toEqual([]);
    expect(p.summary.missingBooks).toEqual(["Book B"]);
  });

  it("does not restore a position without a cfi", () => {
    const p = planRestore(backup({ cfi: null }), [book({ id: "b" })], new Map());
    expect(p.progressUpdates).toEqual([]);
  });
});

describe("restore cannot touch another book's notes (audit H4)", () => {
  const mkBackup = (books: BackupFile["books"]): BackupFile => ({ format: "folio-backup", version: 1, exportedAt: 1, books });
  const bk = (id: string, annotations: Annotation[]): BackupFile["books"][number] => ({ id, title: id, author: "", progress: 0, cfi: null, lastOpenedAt: null, annotations });

  it("skips an annotation whose id already belongs to a different book", () => {
    const victim = note({ id: "shared-uuid", bookId: "X", text: "my private note", updatedAt: 5 });
    // A crafted backup lists the victim's id under book Y with newer-looking content.
    const crafted = mkBackup([bk("Y", [note({ id: "shared-uuid", bookId: "Y", text: "overwritten", updatedAt: 999 })])]);
    const existing = new Map([["X", [victim]]]);
    const plan = planRestore(crafted, [book({ id: "X" }), book({ id: "Y" })], existing);
    expect(plan.annotationsToPut).toEqual([]);
    expect(plan.summary.annotationsSkipped).toBe(1);
  });

  it("still restores an id under its own book, and de-duplicates ids inside one file", () => {
    const mine = note({ id: "n1", bookId: "X", updatedAt: 1 });
    const newer = note({ id: "n1", bookId: "X", updatedAt: 9, text: "edited elsewhere" });
    const plan = planRestore(mkBackup([bk("X", [newer, newer])]), [book({ id: "X" })], new Map([["X", [mine]]]));
    expect(plan.annotationsToPut).toHaveLength(1);
    expect(plan.summary.annotationsUpdated).toBe(1);
    expect(plan.summary.annotationsSkipped).toBe(1); // the repeated copy
  });

  it("skips the same id appearing under two different books in the file", () => {
    const plan = planRestore(mkBackup([bk("A", [note({ id: "dup", bookId: "A" })]), bk("B", [note({ id: "dup", bookId: "B" })])]), [], new Map());
    expect(plan.annotationsToPut).toHaveLength(1);
    expect(plan.summary.annotationsSkipped).toBe(1);
  });
});

describe("backup bounds (audit H4/H5)", () => {
  const wrap = (reading: unknown[], books: unknown[] = []) => JSON.stringify({ format: "folio-backup", version: 1, books, reading });

  it("rejects impossible calendar days and implausible seconds", () => {
    const r = parseBackup(wrap([
      { day: "2026-11-10", bookId: "a", seconds: 100 },
      { day: "9999-99-99", bookId: "a", seconds: 100 },
      { day: "2026-02-31", bookId: "a", seconds: 100 },
      { day: "2026-11-10", bookId: "b", seconds: 86_401 },
    ]));
    expect(r.ok && r.backup.reading).toHaveLength(1);
    expect(r.ok && r.skipped).toBe(3);
  });

  it("truncates over-long text, notes and labels instead of storing them whole", () => {
    const a = { id: "n", kind: "highlight", cfi: "epubcfi(/6/4)", color: "yellow", text: "x".repeat(10_000), note: "y".repeat(50_000), label: "z".repeat(2_000), fraction: 0.1, createdAt: 1, updatedAt: 1 };
    const r = parseBackup(wrap([], [{ id: "b", title: "t".repeat(5_000), annotations: [a] }]));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const out = r.backup.books[0];
      expect(out.title.length).toBe(500);
      expect(out.annotations[0].text.length).toBe(5_000);
      expect(out.annotations[0].note.length).toBe(20_000);
      expect(out.annotations[0].label.length).toBe(500);
    }
  });

  it("exposes a file-size ceiling", () => {
    expect(MAX_BACKUP_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("messages", () => {
  it("summarises a restore", () => {
    const s = { books: 2, missingBooks: ["X"], annotationsAdded: 2, annotationsUpdated: 1, annotationsSkipped: 1, progressRestored: 1, readingDays: 3 };
    const m = restoreSummary(s, 2);
    expect(m).toContain("Restored 3 notes");
    expect(m).toContain("3 days of reading history");
    expect(m).toContain("1 note was skipped");
    expect(m).toContain("1 reading position");
    expect(m).toContain("1 book is not in your library yet");
    expect(m).toContain("2 unreadable entries skipped");
    expect(restoreSummary({ ...s, annotationsAdded: 0, annotationsUpdated: 0, annotationsSkipped: 0, progressRestored: 0, readingDays: 0, missingBooks: [] }, 0)).toBe("No new notes to restore");
  });
  it("names the file by date", () => {
    expect(backupFilename(new Date(2026, 10, 3))).toBe("folio-backup-2026-11-03.json");
  });
});
