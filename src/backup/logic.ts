// Backup of reading progress and annotations (not the book files).
// Annotations are keyed by the book's content hash, so a restore for a book that is not in the
// library yet is kept and attaches itself as soon as the same file is imported.

import { COLOR_NAMES } from "../annotations/logic";
import type { Annotation, AnnotationKind } from "../annotations/types";
import type { Book } from "../library/types";

export const BACKUP_FORMAT = "folio-backup";
export const BACKUP_VERSION = 1;

export interface BackupBook {
  id: string;
  title: string;
  author: string;
  progress: number;
  cfi: string | null;
  lastOpenedAt: number | null;
  annotations: Annotation[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  books: BackupBook[];
}

export const buildBackup = (books: Book[], annotations: Annotation[], now = Date.now()): BackupFile => {
  const byBook = new Map<string, Annotation[]>();
  for (const a of annotations) byBook.set(a.bookId, [...(byBook.get(a.bookId) ?? []), a]);
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    books: books
      // Skip books with nothing worth keeping, so the file stays small and meaningful.
      .filter((b) => b.progress > 0 || b.lastOpenedAt != null || byBook.has(b.id))
      .map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        progress: b.progress,
        cfi: b.cfi,
        lastOpenedAt: b.lastOpenedAt,
        annotations: byBook.get(b.id) ?? [],
      })),
  };
};

const KINDS: AnnotationKind[] = ["highlight", "bookmark"];
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const asAnnotation = (v: unknown, bookId: string): Annotation | null => {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;
  if (!isStr(a.id) || !a.id || !isStr(a.cfi) || !a.cfi) return null;
  if (!KINDS.includes(a.kind as AnnotationKind)) return null;
  if (!COLOR_NAMES.includes(a.color as Annotation["color"])) return null;
  if (!isStr(a.text) || !isStr(a.note) || !isStr(a.label)) return null;
  if (!isNum(a.fraction) || !isNum(a.createdAt) || !isNum(a.updatedAt)) return null;
  return {
    id: a.id,
    bookId, // always the enclosing book, so a hand-edited file cannot attach notes to another book
    kind: a.kind as AnnotationKind,
    cfi: a.cfi,
    color: a.color as Annotation["color"],
    text: a.text,
    note: a.note,
    label: a.label,
    fraction: Math.min(1, Math.max(0, a.fraction)),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
};

export type ParseResult = { ok: true; backup: BackupFile; skipped: number } | { ok: false; error: string };

export const parseBackup = (text: string): ParseResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file is not valid JSON." };
  }
  if (!raw || typeof raw !== "object" || (raw as { format?: unknown }).format !== BACKUP_FORMAT) {
    return { ok: false, error: "This is not a Folio backup file." };
  }
  const obj = raw as { version?: unknown; exportedAt?: unknown; books?: unknown };
  if (obj.version !== BACKUP_VERSION) {
    return { ok: false, error: "This backup was made by a different version of Folio and cannot be read." };
  }
  if (!Array.isArray(obj.books)) return { ok: false, error: "This backup file is missing its book list." };

  let skipped = 0;
  const books: BackupBook[] = [];
  for (const item of obj.books as unknown[]) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }
    const b = item as Record<string, unknown>;
    if (!isStr(b.id) || !b.id) {
      skipped++;
      continue;
    }
    const annotations: Annotation[] = [];
    for (const a of Array.isArray(b.annotations) ? b.annotations : []) {
      const ok = asAnnotation(a, b.id);
      if (ok) annotations.push(ok);
      else skipped++;
    }
    books.push({
      id: b.id,
      title: isStr(b.title) ? b.title : "Untitled",
      author: isStr(b.author) ? b.author : "",
      progress: isNum(b.progress) ? Math.min(1, Math.max(0, b.progress)) : 0,
      cfi: isStr(b.cfi) ? b.cfi : null,
      lastOpenedAt: isNum(b.lastOpenedAt) ? b.lastOpenedAt : null,
      annotations,
    });
  }
  return {
    ok: true,
    skipped,
    backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: isNum(obj.exportedAt) ? obj.exportedAt : 0, books },
  };
};

export interface RestorePlan {
  annotationsToPut: Annotation[];
  progressUpdates: { id: string; progress: number; cfi: string | null; lastOpenedAt: number | null }[];
  summary: {
    books: number;
    /** Books in the backup that are not in the library; their notes are kept for when they are imported. */
    missingBooks: string[];
    annotationsAdded: number;
    annotationsUpdated: number;
    progressRestored: number;
  };
}

/**
 * Merge a backup into what the app already has. Never deletes anything.
 * - An annotation is added if its id is new, and replaced only if the backup copy is newer.
 * - Reading position is restored only for books in the library, and only if the backup was read more recently.
 */
export const planRestore = (
  backup: BackupFile,
  library: Book[],
  existing: Map<string, Annotation[]>,
): RestorePlan => {
  const libById = new Map(library.map((b) => [b.id, b]));
  const plan: RestorePlan = {
    annotationsToPut: [],
    progressUpdates: [],
    summary: { books: backup.books.length, missingBooks: [], annotationsAdded: 0, annotationsUpdated: 0, progressRestored: 0 },
  };

  for (const b of backup.books) {
    const have = new Map((existing.get(b.id) ?? []).map((a) => [a.id, a]));
    for (const a of b.annotations) {
      const cur = have.get(a.id);
      if (!cur) {
        plan.annotationsToPut.push(a);
        plan.summary.annotationsAdded++;
      } else if (a.updatedAt > cur.updatedAt) {
        plan.annotationsToPut.push(a);
        plan.summary.annotationsUpdated++;
      }
    }

    const lib = libById.get(b.id);
    if (!lib) {
      plan.summary.missingBooks.push(b.title);
      continue;
    }
    if ((b.lastOpenedAt ?? 0) > (lib.lastOpenedAt ?? 0) && b.cfi) {
      plan.progressUpdates.push({ id: b.id, progress: b.progress, cfi: b.cfi, lastOpenedAt: b.lastOpenedAt });
      plan.summary.progressRestored++;
    }
  }
  return plan;
};

export const restoreSummary = (s: RestorePlan["summary"], skipped: number): string => {
  const parts: string[] = [];
  const notes = s.annotationsAdded + s.annotationsUpdated;
  parts.push(notes ? `Restored ${notes} ${notes === 1 ? "note" : "notes"}` : "No new notes to restore");
  if (s.progressRestored) parts.push(`${s.progressRestored} reading ${s.progressRestored === 1 ? "position" : "positions"}`);
  if (s.missingBooks.length) {
    parts.push(`${s.missingBooks.length} ${s.missingBooks.length === 1 ? "book is" : "books are"} not in your library yet (their notes will appear when you add them)`);
  }
  if (skipped) parts.push(`${skipped} unreadable ${skipped === 1 ? "entry" : "entries"} skipped`);
  return parts.join(" · ");
};

export const backupFilename = (now = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `folio-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};
