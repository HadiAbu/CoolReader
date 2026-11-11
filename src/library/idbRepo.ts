import type { Book, BookRepo } from "./types";

// Browser / dev implementation of BookRepo, backed by IndexedDB.
// The Tauri build uses SQLite + files instead (see tauriRepo.ts).

const DB_NAME = "folio";
const STORES = ["books", "files", "covers"] as const;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("books", { keyPath: "id" });
      db.createObjectStore("files");
      db.createObjectStore("covers");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const wrap = <T,>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

export const createIdbRepo = (): BookRepo => {
  let dbp: Promise<IDBDatabase> | null = null;
  const db = () => (dbp ??= openDb());

  return {
    async list() {
      const d = await db();
      return wrap<Book[]>(d.transaction("books").objectStore("books").getAll());
    },
    async add(book, file, cover) {
      const d = await db();
      const tx = d.transaction([...STORES], "readwrite");
      tx.objectStore("books").put(book);
      tx.objectStore("files").put(file, book.id);
      if (cover) tx.objectStore("covers").put(cover, book.id);
      await done(tx);
    },
    async getFile(id) {
      const d = await db();
      const [book, blob] = await Promise.all([
        wrap<Book | undefined>(d.transaction("books").objectStore("books").get(id)),
        wrap<Blob | undefined>(d.transaction("files").objectStore("files").get(id)),
      ]);
      if (!book || !blob) return null;
      return new File([blob], `${book.title}.${book.format}`, { type: blob.type });
    },
    async getCover(id) {
      const d = await db();
      return (await wrap<Blob | undefined>(d.transaction("covers").objectStore("covers").get(id))) ?? null;
    },
    async update(id, patch) {
      const d = await db();
      const tx = d.transaction("books", "readwrite");
      const store = tx.objectStore("books");
      const cur = await wrap<Book | undefined>(store.get(id));
      if (cur) store.put({ ...cur, ...patch });
      await done(tx);
    },
    async remove(id) {
      const d = await db();
      const tx = d.transaction([...STORES], "readwrite");
      for (const s of STORES) tx.objectStore(s).delete(id);
      await done(tx);
    },
  };
};
