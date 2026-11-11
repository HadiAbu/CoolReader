import type { AnnotationRepo } from "../annotations/types";
import { createIdbAnnotationRepo, createIdbRepo } from "./idbRepo";
import type { BookRepo } from "./types";

/**
 * Picks the storage backend. Browser/dev uses IndexedDB; the Tauri build will use SQLite + files
 * (added in a follow-up commit) behind the same BookRepo interface.
 */
export const repo: BookRepo = createIdbRepo();

export const annotationRepo: AnnotationRepo = createIdbAnnotationRepo();
