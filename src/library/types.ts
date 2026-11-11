export interface Book {
  /** First 16 hex chars of the file's SHA-256, so importing the same file twice is a no-op. */
  id: string;
  title: string;
  author: string;
  format: string;
  size: number;
  addedAt: number;
  lastOpenedAt: number | null;
  /** 0..1 */
  progress: number;
  /** Last reading position as an EPUB CFI, or null if never opened. */
  cfi: string | null;
  hasCover: boolean;
}

export type SortKey = "recent" | "title" | "author" | "added";
export type BookStatus = "new" | "reading" | "finished";

/** Persistence boundary. Tauri (SQLite + files) and browser (IndexedDB) both implement this. */
export interface BookRepo {
  list(): Promise<Book[]>;
  add(book: Book, file: Blob, cover: Blob | null): Promise<void>;
  getFile(id: string): Promise<File | null>;
  getCover(id: string): Promise<Blob | null>;
  update(id: string, patch: Partial<Pick<Book, "progress" | "cfi" | "lastOpenedAt" | "title" | "author">>): Promise<void>;
  remove(id: string): Promise<void>;
}
