// Keyboard navigation shared by the app window and the book iframes (they receive key events separately).

export type KeyAction = "left" | "right" | "prev" | "next" | "first" | "last" | "escape" | "fullscreen";

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Map a keydown to an action. Arrows are visual (left/right) so right-to-left books can flip them;
 * Page keys and Space are logical (previous/next page).
 */
export const keyAction = (e: KeyLike): KeyAction | null => {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  switch (e.key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "PageUp":
      return "prev";
    case "PageDown":
      return "next";
    case " ":
    case "Spacebar":
      return e.shiftKey ? "prev" : "next";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Escape":
      return "escape";
    case "F11":
      return "fullscreen";
    default:
      return null;
  }
};

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Elements where typing (including Space and arrows) belongs to the control, not to page turning. */
export const isTypingTarget = (t: TargetLike | null | undefined): boolean => {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = (t.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
};

/** Space activates focused buttons and links, so it must not also turn the page. */
export const isActivatable = (t: TargetLike | null | undefined): boolean => {
  const tag = (t?.tagName ?? "").toUpperCase();
  return tag === "BUTTON" || tag === "A" || tag === "SUMMARY";
};

/**
 * Whether the app-window handler should act on this key for the focused element.
 * Typing fields keep all their keys; Space on a button or link activates it instead of turning the page.
 * Page keys and arrows still work with a button focused (clicking "next" leaves focus there).
 */
export const shouldHandleKey = (e: KeyLike, target: TargetLike | null | undefined): boolean => {
  if (isTypingTarget(target)) return false;
  if ((e.key === " " || e.key === "Spacebar") && isActivatable(target)) return false;
  return true;
};
