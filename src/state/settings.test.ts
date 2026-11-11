import { beforeEach, describe, expect, it } from "vitest";
import { createSettingsStore, defaultsFor, sanitizePersistedSettings, storageKeyFor } from "./settings";

describe("settings store", () => {
  beforeEach(() => localStorage.clear());

  it("zoom actions stay in range", () => {
    const s = createSettingsStore("desktop");
    for (let i = 0; i < 50; i++) s.getState().zoomIn();
    expect(s.getState().zoom).toBe(300);
    for (let i = 0; i < 50; i++) s.getState().zoomOut();
    expect(s.getState().zoom).toBe(70);
    s.getState().resetZoom();
    expect(s.getState().zoom).toBe(100);
  });

  it("starts phones slightly larger with shorter lines", () => {
    expect(defaultsFor("phone").zoom).toBeGreaterThan(defaultsFor("desktop").zoom);
    expect(defaultsFor("phone").charsPerLine).toBeLessThan(defaultsFor("desktop").charsPerLine);
  });

  it("persists per device class without leaking across classes", () => {
    const desktop = createSettingsStore("desktop");
    desktop.getState().setZoom(180);
    const raw = localStorage.getItem(storageKeyFor("desktop"));
    expect(raw).toContain("180");
    expect(localStorage.getItem(storageKeyFor("phone"))).toBeNull();

    const phone = createSettingsStore("phone");
    expect(phone.getState().zoom).toBe(defaultsFor("phone").zoom);
  });

  it("clamps chars per line and line height", () => {
    const s = createSettingsStore("desktop");
    s.getState().setCharsPerLine(10);
    expect(s.getState().charsPerLine).toBe(45);
    s.getState().setLineHeight(9);
    expect(s.getState().lineHeight).toBe(2.4);
  });
});

describe("sanitizePersistedSettings", () => {
  const base = defaultsFor("desktop");

  it("keeps valid saved values", () => {
    const saved = { themeId: "midnight", surface: "sepia", zoom: 140, uiScale: 120, layoutMode: "scroll", charsPerLine: 60, lineHeight: 1.8, justify: true, hyphenate: false };
    expect(sanitizePersistedSettings(saved, base)).toEqual(saved);
    expect(sanitizePersistedSettings({ surface: null }, base).surface).toBeNull();
    expect(sanitizePersistedSettings({ surface: "system" }, base).surface).toBe("system");
  });

  it("repairs unknown ids and wrong types instead of letting them through", () => {
    const out = sanitizePersistedSettings({ themeId: "nope", surface: "neon", layoutMode: "fold", justify: "yes", hyphenate: 1 }, base);
    expect(out.themeId).toBe(base.themeId);
    expect(out.surface).toBe(base.surface);
    expect(out.layoutMode).toBe(base.layoutMode);
    expect(out.justify).toBe(base.justify);
    expect(out.hyphenate).toBe(base.hyphenate);
  });

  it("clamps numbers and rejects non-numbers, including CSS-injection strings", () => {
    const out = sanitizePersistedSettings({ zoom: 99999, uiScale: -5, charsPerLine: 3, lineHeight: "1.6;}body{display:none" }, base);
    expect(out.zoom).toBe(300);
    expect(out.uiScale).toBe(80);
    expect(out.charsPerLine).toBe(45);
    expect(out.lineHeight).toBe(base.lineHeight);
    expect(sanitizePersistedSettings({ zoom: Number.NaN }, base).zoom).toBe(base.zoom);
  });

  it("copes with garbage input", () => {
    for (const bad of [null, undefined, 5, "x", [], true]) expect(sanitizePersistedSettings(bad, base)).toEqual(base);
  });

  it("a corrupt stored value no longer breaks the store on load", () => {
    localStorage.setItem(storageKeyFor("desktop"), JSON.stringify({ state: { themeId: "bogus", zoom: "huge", lineHeight: "evil;" }, version: 1 }));
    const s = createSettingsStore("desktop");
    expect(s.getState().themeId).toBe(base.themeId);
    expect(s.getState().zoom).toBe(base.zoom);
    expect(s.getState().lineHeight).toBe(base.lineHeight);
  });
});
