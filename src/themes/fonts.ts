// Fonts are bundled (latin subset, variable weight) so the app works offline.
// The book is rendered in an iframe that cannot see the app's @font-face rules,
// so the same rules are also injected into the book via readerCss().

import frauncesItalic from "@fontsource-variable/fraunces/files/fraunces-latin-wght-italic.woff2?url";
import frauncesNormal from "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url";
import interItalic from "@fontsource-variable/inter/files/inter-latin-wght-italic.woff2?url";
import interNormal from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import literataItalic from "@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url";
import literataNormal from "@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url";
import manropeNormal from "@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2?url";
import newsreaderItalic from "@fontsource-variable/newsreader/files/newsreader-latin-wght-italic.woff2?url";
import newsreaderNormal from "@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url";
import sourceSerifItalic from "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-italic.woff2?url";
import sourceSerifNormal from "@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url";

export type FontFamily =
  | "Inter Variable"
  | "Manrope Variable"
  | "Fraunces Variable"
  | "Newsreader Variable"
  | "Literata Variable"
  | "Source Serif 4 Variable";

interface FontFiles {
  normal: string;
  italic?: string;
}

const FILES: Record<FontFamily, FontFiles> = {
  "Inter Variable": { normal: interNormal, italic: interItalic },
  "Manrope Variable": { normal: manropeNormal },
  "Fraunces Variable": { normal: frauncesNormal, italic: frauncesItalic },
  "Newsreader Variable": { normal: newsreaderNormal, italic: newsreaderItalic },
  "Literata Variable": { normal: literataNormal, italic: literataItalic },
  "Source Serif 4 Variable": { normal: sourceSerifNormal, italic: sourceSerifItalic },
};

export const ALL_FONT_FAMILIES = Object.keys(FILES) as FontFamily[];

/** Absolute URL, because the book iframe is a blob: document and cannot resolve relative paths. */
const absolute = (url: string): string => {
  try {
    return new URL(url, globalThis.location?.href ?? "http://localhost/").href;
  } catch {
    return url;
  }
};

const face = (family: string, style: "normal" | "italic", url: string) =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:100 900;font-display:swap;` +
  `src:url('${absolute(url)}') format('woff2');}`;

export const fontFaceCss = (families: FontFamily[]): string =>
  families
    .flatMap((f) => {
      const files = FILES[f];
      return [face(f, "normal", files.normal), ...(files.italic ? [face(f, "italic", files.italic)] : [])];
    })
    .join("\n");

/** Make every bundled font available to the app UI. Call once at startup. */
export const installAppFonts = (): void => {
  if (typeof document === "undefined" || document.getElementById("folio-fonts")) return;
  const style = document.createElement("style");
  style.id = "folio-fonts";
  style.textContent = fontFaceCss(ALL_FONT_FAMILIES);
  document.head.append(style);
};

/** Which bundled family each theme uses for book text. */
export const READER_FONT: Record<"paper" | "midnight" | "quiet", FontFamily> = {
  paper: "Newsreader Variable",
  midnight: "Literata Variable",
  quiet: "Source Serif 4 Variable",
};
