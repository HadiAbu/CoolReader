import type { Annotation, AnnotationRepo } from "../annotations/types";
import type { ReadingRow, StatsRepo } from "../stats/logic";
import type { Book, BookRepo } from "./types";

// Browser / dev implementation of the repos, backed by IndexedDB.
// The Tauri build uses SQLite + files instead (see tauriRepo.ts).

const DB_NAME = "folio";
const DB_VERSION = 3;
const STORES = ["books", "files", "covers"] as const;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Each step is guarded so upgrading from any earlier version works.
      if (!db.objectStoreNames.contains("books")) db.createObjectStore("books", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      if (!db.objectStoreNames.contains("covers")) db.createObjectStore("covers");
      if (!db.objectStoreNames.contains("annotations")) {
        db.createObjectStore("annotations", { keyPath: "id" }).createIndex("bookId", "bookId");
      }
      if (!db.objectStoreNames.contains("reading")) db.createObjectStore("reading", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab or window upgrades the schema, step aside instead of blocking it forever.
      db.onversionchange = () => {
        db.close();
        sharedDb = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Another window still holds an older schema open and has not stepped aside: fail visibly instead of hanging.
    req.onblocked = () => reject(new Error("The library is open in another Folio window. Close it and try again."));
  });

let sharedDb: Promise<IDBDatabase> | null = null;
const getDb = () => {
  // Never cache a failed open, so a retry (after closing the other window) can succeed.
  sharedDb ??= openDb().catch((e) => {
    sharedDb = null;
    throw e;
  });
  return sharedDb;
};

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

export const createIdbStatsRepo = (): StatsRepo => ({
  async add(day, bookId, seconds) {
    const d = await getDb();
    const tx = d.transaction("reading", "readwrite");
    const store = tx.objectStore("reading");
    const key = `${day}|${bookId}`;
    // Read-modify-write inside one transaction so concurrent flushes cannot lose time.
    const cur = await wrap<ReadingRow | undefined>(store.get(key));
    store.put({ key, day, bookId, seconds: (cur?.seconds ?? 0) + seconds } satisfies ReadingRow);
    await done(tx);
  },
  async put(row) {
    const d = await getDb();
    const tx = d.transaction("reading", "readwrite");
    tx.objectStore("reading").put(row);
    await done(tx);
  },
  async list() {
    const d = await getDb();
    return wrap<ReadingRow[]>(d.transaction("reading").objectStore("reading").getAll());
  },
});

export const createIdbAnnotationRepo = (): AnnotationRepo => ({
  async list(bookId) {
    const d = await getDb();
    return wrap<Annotation[]>(d.transaction("annotations").objectStore("annotations").index("bookId").getAll(bookId));
  },
  async listAll() {
    const d = await getDb();
    return wrap<Annotation[]>(d.transaction("annotations").objectStore("annotations").getAll());
  },
  async put(annotation) {
    const d = await getDb();
    const tx = d.transaction("annotations", "readwrite");
    tx.objectStore("annotations").put(annotation);
    await done(tx);
  },
  async remove(id) {
    const d = await getDb();
    const tx = d.transaction("annotations", "readwrite");
    tx.objectStore("annotations").delete(id);
    await done(tx);
  },
  async removeForBook(bookId) {
    const d = await getDb();
    const tx = d.transaction("annotations", "readwrite");
    const store = tx.objectStore("annotations");
    const keys = await wrap<IDBValidKey[]>(store.index("bookId").getAllKeys(bookId));
    for (const k of keys) store.delete(k);
    await done(tx);
  },
});

export const createIdbRepo = (): BookRepo => {
  const db = getDb;

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
