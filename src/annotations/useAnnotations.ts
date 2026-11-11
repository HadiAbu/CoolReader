import { useCallback, useEffect, useRef, useState } from "react";
import type { Annotation, AnnotationRepo } from "./types";

type Patch = Partial<Pick<Annotation, "color" | "note" | "text">>;

export function useAnnotations(bookId: string | null, repo: AnnotationRepo) {
  const [items, setItems] = useState<Annotation[]>([]);
  // Mirror of state so handlers can read the latest list without waiting for a render.
  const ref = useRef<Annotation[]>([]);
  ref.current = items;

  // Bumping this re-reads from storage (used after restoring a backup).
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!bookId) {
      setItems([]);
      return;
    }
    let cancelled = false;
    repo
      .list(bookId)
      .then((list) => !cancelled && setItems(list))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [bookId, repo, version]);

  const add = useCallback(
    async (a: Annotation) => {
      setItems((prev) => [...prev, a]);
      await repo.put(a);
    },
    [repo],
  );

  const update = useCallback(
    async (id: string, patch: Patch) => {
      const cur = ref.current.find((x) => x.id === id);
      if (!cur) return;
      const next: Annotation = { ...cur, ...patch, updatedAt: Date.now() };
      setItems((prev) => prev.map((x) => (x.id === id ? next : x)));
      await repo.put(next);
    },
    [repo],
  );

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((x) => x.id !== id));
      await repo.remove(id);
    },
    [repo],
  );

  return { items, add, update, remove, reload };
}
