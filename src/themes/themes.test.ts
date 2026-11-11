import { describe, expect, it } from "vitest";
import { applyTheme, readerCss, resolveSurface, themeList, themes } from "./themes";

describe("resolveSurface", () => {
  it("uses the theme default when nothing is chosen", () => {
    expect(resolveSurface(null, themes.paper, true)).toBe("light");
    expect(resolveSurface(null, themes.midnight, false)).toBe("dark");
  });
  it("honours a fixed choice regardless of the system", () => {
    expect(resolveSurface("sepia", themes.quiet, true)).toBe("sepia");
    expect(resolveSurface("dark", themes.paper, false)).toBe("dark");
  });
  it("follows the system: dark OS gives dark", () => {
    for (const t of themeList) expect(resolveSurface("system", t, true)).toBe("dark");
  });
  it("follows the system: light OS gives the theme's light default, never dark", () => {
    expect(resolveSurface("system", themes.paper, false)).toBe("light");
    expect(resolveSurface("system", themes.quiet, false)).toBe("light");
    // Midnight defaults to dark, so a light OS must not leave it dark
    expect(resolveSurface("system", themes.midnight, false)).toBe("light");
  });
});

describe("theme data", () => {
  it("every theme defines all three surfaces with full tokens", () => {
    for (const t of themeList) {
      for (const s of ["light", "sepia", "dark"] as const) {
        const tokens = t.surfaces[s];
        for (const k of ["bg", "fg", "muted", "panel", "border", "link", "mark"] as const) {
          expect(tokens[k], `${t.id}.${s}.${k}`).toMatch(/^#[0-9a-fA-F]{6,8}$/);
        }
      }
    }
  });

  it("applyTheme writes CSS variables and data attributes", () => {
    const el = document.createElement("div");
    applyTheme(el, themes.midnight, "dark");
    expect(el.style.getPropertyValue("--bg")).toBe(themes.midnight.surfaces.dark.bg);
    expect(el.dataset.theme).toBe("midnight");
    expect(el.dataset.surface).toBe("dark");
    // The decorative backdrop only applies on the dark surface
    applyTheme(el, themes.midnight, "light");
    expect(el.style.getPropertyValue("--backdrop")).toBe("none");
  });
});

describe("readerCss", () => {
  const base = { theme: themes.paper, surface: "light" as const, fontPx: 20, lineHeight: 1.6, justify: false, hyphenate: true };
  it("forces the zoomed font size and the surface colours into the book", () => {
    const css = readerCss(base);
    expect(css).toContain("font-size: 20px !important");
    expect(css).toContain(themes.paper.surfaces.light.bg);
    expect(css).toContain(themes.paper.surfaces.light.fg);
  });
  it("includes the provided font-face rules and the justify and hyphen settings", () => {
    const css = readerCss({ ...base, justify: true, hyphenate: false, fontFaces: "@font-face{font-family:'X';}" });
    expect(css).toContain("@font-face{font-family:'X';}");
    expect(css).toContain("text-align: justify");
    expect(css).toContain("hyphens: manual");
  });
  it("switches the colour scheme for dark surfaces", () => {
    expect(readerCss({ ...base, surface: "dark" })).toContain("color-scheme: dark");
  });
});
