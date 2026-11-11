import { beforeEach, describe, expect, it } from "vitest";
import { createSettingsStore, defaultsFor, storageKeyFor } from "./settings";

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
