import { useCallback, useEffect, useRef, useState } from "react";
import { importBook } from "./importBook";
import type { Book, BookRepo } from "./types";

export interface ImportSummary {
  added: number;
  duplicates: number;
  unsupported: string[];
  failed: { name: string; error: string }[];
}

export const summarize = (s: ImportSummary): string => {
  const parts: string[] = [];
  if (s.added) parts.push(`Added ${s.added} ${s.added === 1 ? "book" : "books"}`);
  if (s.duplicates) parts.push(`${s.duplicates} already in your library`);
  if (s.unsupported.length) parts.push(`${s.unsupported.length} unsupported file${s.unsupported.length === 1 ? "" : "s"}`);
  if (s.failed.length) parts.push(`${s.failed.length} could not be read`);
  return parts.join(" · ");
};

export function useLibrary(repo: BookRepo) {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const idsRef = useRef(new Set<string>());
  const booksRef = useRef<Book[]>([]);
  booksRef.current = books;

  useEffect(() => {
    let cancelled = false;
    repo
      .list()
      .then((list) => {
        if (cancelled) return;
        idsRef.current = new Set(list.map((b) => b.id));
        setBooks(list);
      })
      .catch((e) => !cancelled && setNotice(`Could not load your library: ${e instanceof Error ? e.message : e}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const importFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setImporting(true);
      const summary: ImportSummary = { added: 0, duplicates: 0, unsupported: [], failed: [] };
      const added: Book[] = [];
      /** Every book the user handed us that is now in the library: new ones and ones we already had. */
      const opened: Book[] = [];
      for (const f of files) {
        const r = await importBook(f, repo, idsRef.current);
        if (r.status === "added") {
          summary.added++;
          added.push(r.book);
          opened.push(r.book);
        } else if (r.status === "duplicate") {
          summary.duplicates++;
          const existing = booksRef.current.find((b) => b.id === r.id);
          if (existing) opened.push(existing);
        }
        else if (r.status === "unsupported") summary.unsupported.push(r.name);
        else summary.failed.push({ name: r.name, error: r.error });
      }
      if (added.length) setBooks((prev) => [...prev, ...added]);
      setNotice(summarize(summary) || null);
      setImporting(false);
      return { summary, opened };
    },
    [repo],
  );

  const patch = useCallback(
    async (id: string, p: Parameters<BookRepo["update"]>[1]) => {
      setBooks((prev) => prev.map((b) => (b.id === id ? { ...b, ...p } : b)));
      await repo.update(id, p);
    },
    [repo],
  );

  const remove = useCallback(
    async (id: string) => {
      await repo.remove(id);
      idsRef.current.delete(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    },
    [repo],
  );

  return { books, loading, notice, importing, clearNotice: () => setNotice(null), importFiles, patch, remove };
}
