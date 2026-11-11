import { makeBook } from "../../vendor/foliate-js/view.js";
import { bookId } from "./logic";
import { lang } from "./meta";
import type { Book, BookRepo } from "./types";

export const SUPPORTED_EXTENSIONS = ["epub", "mobi", "azw3", "fb2", "cbz"] as const;
const COVER_MAX_WIDTH = 360;

export const extensionOf = (name: string): string => name.split(".").pop()?.toLowerCase() ?? "";
export const isSupported = (name: string): boolean => (SUPPORTED_EXTENSIONS as readonly string[]).includes(extensionOf(name));

/** Shrink a cover to a grid-friendly JPEG so the library stays light. Falls back to the original blob. */
const thumbnail = async (blob: Blob): Promise<Blob> => {
  try {
    const bmp = await createImageBitmap(blob);
    const scale = Math.min(1, COVER_MAX_WIDTH / bmp.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return out ?? blob;
  } catch {
    return blob;
  }
};

export type ImportResult =
  | { status: "added"; book: Book }
  | { status: "duplicate"; id: string }
  | { status: "unsupported"; name: string }
  | { status: "failed"; name: string; error: string };

export const importBook = async (file: File, repo: BookRepo, existingIds: Set<string>): Promise<ImportResult> => {
  if (!isSupported(file.name)) return { status: "unsupported", name: file.name };
  try {
    const id = await bookId(await file.arrayBuffer());
    if (existingIds.has(id)) return { status: "duplicate", id };

    const parsed = await makeBook(file);
    const coverRaw = await Promise.resolve(parsed.getCover?.()).catch(() => null);
    const cover = coverRaw ? await thumbnail(coverRaw) : null;

    const book: Book = {
      id,
      title: lang(parsed.metadata?.title) || file.name.replace(/\.[^.]+$/, ""),
      author: lang(parsed.metadata?.author),
      format: extensionOf(file.name),
      size: file.size,
      addedAt: Date.now(),
      lastOpenedAt: null,
      progress: 0,
      cfi: null,
      hasCover: !!cover,
    };
    await repo.add(book, file, cover);
    existingIds.add(id);
    return { status: "added", book };
  } catch (e) {
    return { status: "failed", name: file.name, error: e instanceof Error ? e.message : String(e) };
  }
};
