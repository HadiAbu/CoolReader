import { describe, expect, it } from "vitest";
import {
  clampUiScale,
  clampZoom,
  computeLayout,
  deviceClassForWidth,
  pinchZoomTarget,
  stepZoom,
  zoomActionForEvent,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
} from "./zoom";

describe("clampZoom", () => {
  it("clamps to range and rounds", () => {
    expect(clampZoom(10)).toBe(ZOOM_MIN);
    expect(clampZoom(999)).toBe(ZOOM_MAX);
    expect(clampZoom(123.6)).toBe(124);
  });
  it("falls back to default for NaN", () => {
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
  });
});

describe("stepZoom", () => {
  it("steps by 10 on the grid", () => {
    expect(stepZoom(100, 1)).toBe(110);
    expect(stepZoom(100, -1)).toBe(90);
  });
  it("never leaves the range", () => {
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
  it("snaps off-grid values to the next grid point in the direction of travel", () => {
    expect(stepZoom(104, 1)).toBe(110);
    expect(stepZoom(104, -1)).toBe(100);
  });
});

describe("deviceClassForWidth", () => {
  it("classifies widths", () => {
    expect(deviceClassForWidth(390)).toBe("phone");
    expect(deviceClassForWidth(800)).toBe("tablet");
    expect(deviceClassForWidth(1440)).toBe("desktop");
  });
});

describe("zoomActionForEvent", () => {
  it("maps Ctrl/Cmd keys", () => {
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, key: "+" })).toBe("in");
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, key: "=" })).toBe("in");
    expect(zoomActionForEvent({ ctrlKey: false, metaKey: true, key: "-" })).toBe("out");
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, key: "0" })).toBe("reset");
  });
  it("ignores keys without a modifier or unrelated keys", () => {
    expect(zoomActionForEvent({ ctrlKey: false, metaKey: false, key: "+" })).toBeNull();
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, key: "a" })).toBeNull();
  });
  it("maps Ctrl + wheel direction", () => {
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, deltaY: -100 })).toBe("in");
    expect(zoomActionForEvent({ ctrlKey: true, metaKey: false, deltaY: 100 })).toBe("out");
    expect(zoomActionForEvent({ ctrlKey: false, metaKey: false, deltaY: 100 })).toBeNull();
  });
});

describe("pinchZoomTarget", () => {
  it("scales from the starting zoom and snaps to the step", () => {
    expect(pinchZoomTarget(100, 1)).toBe(100);
    expect(pinchZoomTarget(100, 1.5)).toBe(150);
    expect(pinchZoomTarget(100, 2)).toBe(200);
    expect(pinchZoomTarget(100, 0.8)).toBe(80);
    expect(pinchZoomTarget(100, 1.04)).toBe(100);
  });
  it("returns to the start when the fingers return", () => {
    expect(pinchZoomTarget(130, 1)).toBe(130);
  });
  it("clamps to the zoom range", () => {
    expect(pinchZoomTarget(200, 5)).toBe(300);
    expect(pinchZoomTarget(100, 0.1)).toBe(70);
  });
  it("ignores nonsense ratios", () => {
    expect(pinchZoomTarget(120, 0)).toBe(120);
    expect(pinchZoomTarget(120, Number.NaN)).toBe(120);
    expect(pinchZoomTarget(120, -1)).toBe(120);
  });
});

describe("clampUiScale", () => {
  it("clamps", () => {
    expect(clampUiScale(10)).toBe(80);
    expect(clampUiScale(500)).toBe(200);
  });
});

describe("computeLayout", () => {
  const base = { zoom: 100, mode: "auto" as const, charsPerLine: 66 };

  it("keeps line length near the target at default zoom", () => {
    const l = computeLayout({ ...base, viewportWidth: 1920 });
    // 66 chars * 18px * 0.5 = 594px
    expect(l.maxInlineSize).toBe(594);
  });

  it("uses a spread on wide windows and a single page on narrow ones (auto)", () => {
    expect(computeLayout({ ...base, viewportWidth: 1920 }).maxColumnCount).toBe(2);
    expect(computeLayout({ ...base, viewportWidth: 900 }).maxColumnCount).toBe(1);
    expect(computeLayout({ ...base, viewportWidth: 390 }).maxColumnCount).toBe(1);
  });

  it("drops from spread to single page as zoom grows", () => {
    expect(computeLayout({ ...base, viewportWidth: 1366, zoom: 100 }).maxColumnCount).toBe(2);
    expect(computeLayout({ ...base, viewportWidth: 1366, zoom: 200 }).maxColumnCount).toBe(1);
  });

  it("grows the measure with zoom so the character count stays constant", () => {
    const a = computeLayout({ ...base, viewportWidth: 1920, zoom: 100 }).maxInlineSize;
    const b = computeLayout({ ...base, viewportWidth: 1920, zoom: 200 }).maxInlineSize;
    expect(b).toBe(a * 2);
  });

  it("respects an explicit mode", () => {
    expect(computeLayout({ ...base, viewportWidth: 500, mode: "spread" }).maxColumnCount).toBe(2);
    expect(computeLayout({ ...base, viewportWidth: 2400, mode: "single" }).maxColumnCount).toBe(1);
    const s = computeLayout({ ...base, viewportWidth: 2400, mode: "scroll" });
    expect(s.flow).toBe("scrolled");
    expect(s.maxColumnCount).toBe(1);
  });

  it("clamps chars per line to the comfortable 45-75 range", () => {
    expect(computeLayout({ ...base, viewportWidth: 1920, charsPerLine: 10 }).maxInlineSize).toBe(405);
    expect(computeLayout({ ...base, viewportWidth: 1920, charsPerLine: 200 }).maxInlineSize).toBe(675);
  });

  it("keeps the margin within bounds", () => {
    expect(computeLayout({ ...base, viewportWidth: 1920, zoom: 70 }).margin).toBeGreaterThanOrEqual(32);
    expect(computeLayout({ ...base, viewportWidth: 1920, zoom: 300 }).margin).toBeLessThanOrEqual(72);
  });
});
