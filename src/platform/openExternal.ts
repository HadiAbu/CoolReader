const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/** Links inside books are untrusted: only plain web and mail links may leave the app. */
export const isSafeExternalUrl = (href: string): boolean => {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
};

/** Open a link from a book in the system browser (never inside the app window). */
export const openExternal = async (href: string): Promise<void> => {
  if (!isSafeExternalUrl(href)) return;
  try {
    if (inTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  } catch {
    /* nothing useful to do if the OS refuses */
  }
};
