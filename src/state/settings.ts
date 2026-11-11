import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { themeList, type SurfacePref, type ThemeId } from "../themes/themes";
import {
  clampUiScale,
  clampZoom,
  deviceClassForWidth,
  stepZoom,
  ZOOM_DEFAULT,
  type DeviceClass,
  type LayoutMode,
} from "../reader/zoom";

export interface SettingsState {
  themeId: ThemeId;
  /** null means "use the theme's default surface". */
  surface: SurfacePref;
  /** Reader text zoom, percent. */
  zoom: number;
  /** App chrome scale, percent. */
  uiScale: number;
  layoutMode: LayoutMode;
  charsPerLine: number;
  lineHeight: number;
  justify: boolean;
  hyphenate: boolean;

  setTheme: (id: ThemeId) => void;
  setSurface: (s: SurfacePref) => void;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setUiScale: (s: number) => void;
  setLayoutMode: (m: LayoutMode) => void;
  setCharsPerLine: (n: number) => void;
  setLineHeight: (n: number) => void;
  setJustify: (b: boolean) => void;
  setHyphenate: (b: boolean) => void;
}

/** Sensible per-device starting points; users can override and the override is saved per device class. */
export const defaultsFor = (device: DeviceClass) => ({
  themeId: "paper" as ThemeId,
  surface: null as SurfacePref,
  zoom: device === "phone" ? 110 : ZOOM_DEFAULT,
  uiScale: 100,
  layoutMode: "auto" as LayoutMode,
  charsPerLine: device === "phone" ? 50 : 66,
  lineHeight: 1.6,
  justify: false,
  hyphenate: true,
});

const SURFACES = new Set(["light", "sepia", "dark", "system"]);
const LAYOUTS = new Set<LayoutMode>(["auto", "single", "spread", "scroll"]);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

type Persisted = Pick<SettingsState, "themeId" | "surface" | "zoom" | "uiScale" | "layoutMode" | "charsPerLine" | "lineHeight" | "justify" | "hyphenate">;

/**
 * Repair whatever was read from localStorage. Anything unknown or out of range falls back to the
 * default, so a corrupt or hand-edited value can never crash the app on startup or reach the CSS
 * injected into book frames.
 */
export const sanitizePersistedSettings = (raw: unknown, base: Persisted): Persisted => {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    themeId: themeList.some((t) => t.id === p.themeId) ? (p.themeId as ThemeId) : base.themeId,
    surface: p.surface === null || (typeof p.surface === "string" && SURFACES.has(p.surface)) ? (p.surface as SurfacePref) : base.surface,
    zoom: clampZoom(num(p.zoom, base.zoom, 0, 10_000)),
    uiScale: clampUiScale(num(p.uiScale, base.uiScale, 0, 10_000)),
    layoutMode: typeof p.layoutMode === "string" && LAYOUTS.has(p.layoutMode as LayoutMode) ? (p.layoutMode as LayoutMode) : base.layoutMode,
    charsPerLine: Math.round(num(p.charsPerLine, base.charsPerLine, 45, 75)),
    lineHeight: num(p.lineHeight, base.lineHeight, 1.2, 2.4),
    justify: typeof p.justify === "boolean" ? p.justify : base.justify,
    hyphenate: typeof p.hyphenate === "boolean" ? p.hyphenate : base.hyphenate,
  };
};

export const storageKeyFor = (device: DeviceClass) => `folio.settings.${device}`;

/**
 * One store per device class. Settings are saved separately for phone, tablet and
 * desktop so a phone never inherits desktop zoom (and vice versa).
 */
export const createSettingsStore = (device: DeviceClass) =>
  create<SettingsState>()(
    persist(
      (set, get) => ({
        ...defaultsFor(device),
        setTheme: (themeId) => set({ themeId }),
        setSurface: (surface) => set({ surface }),
        setZoom: (z) => set({ zoom: clampZoom(z) }),
        zoomIn: () => set({ zoom: stepZoom(get().zoom, 1) }),
        zoomOut: () => set({ zoom: stepZoom(get().zoom, -1) }),
        resetZoom: () => set({ zoom: defaultsFor(device).zoom }),
        setUiScale: (s) => set({ uiScale: clampUiScale(s) }),
        setLayoutMode: (layoutMode) => set({ layoutMode }),
        setCharsPerLine: (n) => set({ charsPerLine: Math.min(75, Math.max(45, Math.round(n))) }),
        setLineHeight: (n) => set({ lineHeight: Math.min(2.4, Math.max(1.2, n)) }),
        setJustify: (justify) => set({ justify }),
        setHyphenate: (hyphenate) => set({ hyphenate }),
      }),
      {
        name: storageKeyFor(device),
        storage: createJSONStorage(() => localStorage),
        version: 1,
        merge: (persisted, current) => ({ ...current, ...sanitizePersistedSettings(persisted, current) }),
        partialize: (s) => ({
          themeId: s.themeId,
          surface: s.surface,
          zoom: s.zoom,
          uiScale: s.uiScale,
          layoutMode: s.layoutMode,
          charsPerLine: s.charsPerLine,
          lineHeight: s.lineHeight,
          justify: s.justify,
          hyphenate: s.hyphenate,
        }),
      },
    ),
  );

export const detectDeviceClass = (): DeviceClass =>
  deviceClassForWidth(typeof window === "undefined" ? 1280 : window.innerWidth);

export const useSettings = createSettingsStore(detectDeviceClass());
