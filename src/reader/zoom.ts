// Pure zoom + layout rules. No DOM, no React, so it is cheap to test.

export const ZOOM_MIN = 70;
export const ZOOM_MAX = 300;
export const ZOOM_STEP = 10;
export const ZOOM_DEFAULT = 100;
export const BASE_FONT_PX = 18;

/** Average glyph width as a fraction of the font size, used to estimate line length. */
const AVG_CHAR_EM = 0.5;

export const UI_SCALE_MIN = 80;
export const UI_SCALE_MAX = 200;

export type DeviceClass = "phone" | "tablet" | "desktop";
export type LayoutMode = "auto" | "single" | "spread" | "scroll";

export const clampZoom = (z: number): number => {
  if (!Number.isFinite(z)) return ZOOM_DEFAULT;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));
};

/** Move to the next/previous step on the ZOOM_STEP grid, then clamp. */
export const stepZoom = (z: number, direction: 1 | -1): number =>
  clampZoom(
    direction === 1
      ? (Math.floor(z / ZOOM_STEP) + 1) * ZOOM_STEP
      : (Math.ceil(z / ZOOM_STEP) - 1) * ZOOM_STEP,
  );

export type ZoomAction = "in" | "out" | "reset";

/** Map a keydown or wheel event to a zoom action (Ctrl/Cmd +, -, 0 and Ctrl/Cmd + wheel). */
export const zoomActionForEvent = (
  e: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "key"> | Pick<WheelEvent, "ctrlKey" | "metaKey" | "deltaY">,
): ZoomAction | null => {
  if (!e.ctrlKey && !e.metaKey) return null;
  if ("deltaY" in e) return e.deltaY < 0 ? "in" : e.deltaY > 0 ? "out" : null;
  if (e.key === "+" || e.key === "=") return "in";
  if (e.key === "-" || e.key === "_") return "out";
  if (e.key === "0") return "reset";
  return null;
};

export const clampUiScale =(s: number): number =>
  Number.isFinite(s) ? Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, Math.round(s))) : 100;

export const deviceClassForWidth = (width: number): DeviceClass =>
  width < 600 ? "phone" : width < 1024 ? "tablet" : "desktop";

export interface LayoutInput {
  viewportWidth: number;
  zoom: number;
  mode: LayoutMode;
  /** Target line length in characters. 45-75 reads comfortably. */
  charsPerLine: number;
}

export interface ReaderLayout {
  flow: "paginated" | "scrolled";
  maxColumnCount: 1 | 2;
  /** Max width of one text column, in px. */
  maxInlineSize: number;
  /** Top/bottom margin, in px. */
  margin: number;
  /** Column gap and outer padding, as a percentage. */
  gap: number;
  fontPx: number;
}

export const computeLayout = ({ viewportWidth, zoom, mode, charsPerLine }: LayoutInput): ReaderLayout => {
  const z = clampZoom(zoom);
  const fontPx = (BASE_FONT_PX * z) / 100;
  const chars = Math.min(75, Math.max(45, charsPerLine));
  const maxInlineSize = Math.round(chars * fontPx * AVG_CHAR_EM);
  const margin = Math.min(72, Math.max(32, Math.round(fontPx * 2.2)));
  const gap = viewportWidth < 600 ? 6 : 7;

  let maxColumnCount: 1 | 2;
  if (mode === "spread") maxColumnCount = 2;
  else if (mode === "single" || mode === "scroll") maxColumnCount = 1;
  else {
    // auto: two pages only when both columns fit at the comfortable measure.
    const usable = viewportWidth * (1 - gap / 100);
    maxColumnCount = usable >= maxInlineSize * 2 ? 2 : 1;
  }

  return {
    flow: mode === "scroll" ? "scrolled" : "paginated",
    maxColumnCount,
    maxInlineSize,
    margin,
    gap,
    fontPx,
  };
};
