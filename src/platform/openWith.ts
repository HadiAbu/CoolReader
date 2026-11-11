// "Open with Folio": the OS passes book paths on launch (double-click in Explorer) or to an
// already-running instance. Rust validates and remembers those paths; we fetch the bytes here.

const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const baseName = (path: string): string => path.split(/[\\/]/).pop() || path;

const MIME: Record<string, string> = {
  epub: "application/epub+zip",
  cbz: "application/vnd.comicbook+zip",
  fb2: "application/x-fictionbook+xml",
  mobi: "application/x-mobipocket-ebook",
  azw3: "application/vnd.amazon.ebook",
};
export const mimeFor = (name: string): string => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

/**
 * Deliver files the OS asked us to open, now and whenever another launch forwards more.
 * Returns an unsubscribe function. Does nothing in a plain browser.
 */
export const initOpenWith = async (onFiles: (files: File[]) => void): Promise<() => void> => {
  if (!inTauri()) return () => {};
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");

  const load = async () => {
    try {
      const paths = await invoke<string[]>("take_pending_opens");
      const files: File[] = [];
      for (const path of paths) {
        const bytes = await invoke<ArrayBuffer>("read_opened_file", { path });
        const name = baseName(path);
        files.push(new File([bytes], name, { type: mimeFor(name) }));
      }
      if (files.length) onFiles(files);
    } catch {
      /* a file that vanished or was refused is not worth interrupting the user for */
    }
  };

  await load();
  return listen("open-files", () => void load());
};
