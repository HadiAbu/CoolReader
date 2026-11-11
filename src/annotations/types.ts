export type AnnotationKind = "highlight" | "bookmark";
export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export interface Annotation {
  id: string;
  bookId: string;
  kind: AnnotationKind;
  /** Range CFI for highlights, point CFI for bookmarks. */
  cfi: string;
  color: HighlightColor;
  /** The highlighted text (highlights) or a short description of the place (bookmarks). */
  text: string;
  note: string;
  /** Chapter title at the time of creation. */
  label: string;
  /** Book-wide reading fraction 0..1 at creation, for display. */
  fraction: number;
  createdAt: number;
  updatedAt: number;
}

export interface AnnotationRepo {
  list(bookId: string): Promise<Annotation[]>;
  /** Every annotation across all books (used to check id ownership when restoring a backup). */
  listAll(): Promise<Annotation[]>;
  put(annotation: Annotation): Promise<void>;
  remove(id: string): Promise<void>;
  removeForBook(bookId: string): Promise<void>;
}
