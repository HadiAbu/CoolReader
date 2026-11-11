const inTauri = (): boolean => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Toggle fullscreen: the native window in the desktop app, the Fullscreen API in a browser. */
export const toggleFullscreen = async (): Promise<void> => {
  try {
    if (inTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      await win.setFullscreen(!(await win.isFullscreen()));
      return;
    }
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    /* fullscreen can be refused (no user gesture, permission); nothing useful to do */
  }
};
