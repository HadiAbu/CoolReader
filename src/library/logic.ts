import type { Book, BookStatus, SortKey } from "./types";

export const FINISHED_AT = 0.98;

export const statusOf = (b: Pick<Book, "progress" | "lastOpenedAt">): BookStatus =>
  b.progress >= FINISHED_AT ? "finished" : b.lastOpenedAt && b.progress > 0 ? "reading" : "new";

export const filterBooks = (books: Book[], query: string): Book[] => {
  const q = query.trim().toLowerCase();
  if (!q) return books;
  return books.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q));
};

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

export const sortBooks = (books: Book[], key: SortKey): Book[] => {
  const copy = [...books];
  switch (key) {
    case "title":
      return copy.sort((a, b) => byText(a.title, b.title));
    case "author":
      return copy.sort((a, b) => byText(a.author, b.author) || byText(a.title, b.title));
    case "added":
      return copy.sort((a, b) => b.addedAt - a.addedAt);
    case "recent":
    default:
      // Opened books first (most recent first), then never-opened by date added.
      return copy.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.addedAt - a.addedAt);
  }
};

export const continueReading = (books: Book[], limit = 2): Book[] =>
  books
    .filter((b) => statusOf(b) === "reading")
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0))
    .slice(0, limit);

export const countByStatus = (books: Book[]): Record<BookStatus | "all", number> => {
  const c = { all: books.length, new: 0, reading: 0, finished: 0 };
  for (const b of books) c[statusOf(b)]++;
  return c;
};

/** Small deterministic string hash (FNV-1a). */
const hash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Stable fallback cover colours for books without cover art. */
export const coverColors = (title: string): { bg: string; fg: string } => {
  const h = hash(title) % 360;
  return { bg: `hsl(${h} 38% 32%)`, fg: "#fff8ea" };
};

export const bookId = async (data: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
