import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Surface, ThemeId } from "../themes/themes";
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
  surface: Surface | null;
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
  setSurface: (s: Surface | null) => void;
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
  surface: null as Surface | null,
  zoom: device === "phone" ? 110 : ZOOM_DEFAULT,
  uiScale: 100,
  layoutMode: "auto" as LayoutMode,
  charsPerLine: device === "phone" ? 50 : 66,
  lineHeight: 1.6,
  justify: false,
  hyphenate: true,
});

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
