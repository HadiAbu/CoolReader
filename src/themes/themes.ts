// Three selectable themes. Each is a token set plus a few structural flags.
// Components read CSS variables; the reader iframe gets the same tokens via readerCss().

export type ThemeId = "paper" | "midnight" | "quiet";
export type Surface = "light" | "sepia" | "dark";
export type NavStyle = "sidebar" | "rail" | "topbar";

export interface SurfaceTokens {
  bg: string;
  fg: string;
  muted: string;
  panel: string;
  border: string;
  link: string;
  mark: string;
}

export interface Theme {
  id: ThemeId;
  name: string;
  nav: NavStyle;
  fontUi: string;
  fontReader: string;
  fontDisplay: string;
  accent: string;
  accentFg: string;
  radius: number;
  /** Page-level decoration (e.g. Midnight's glow). Empty string for none. */
  backdrop: string;
  /** Surface used when nothing has been chosen. */
  defaultSurface: Surface;
  surfaces: Record<Surface, SurfaceTokens>;
}

const sepia = (accent: string): SurfaceTokens => ({
  bg: "#F1E6CF",
  fg: "#3B2F20",
  muted: "#7A6A52",
  panel: "#E8DBBF",
  border: "#D6C6A3",
  link: accent,
  mark: "#E9C77A",
});

export const themes: Record<ThemeId, Theme> = {
  paper: {
    id: "paper",
    name: "Paper",
    nav: "sidebar",
    fontUi: "'Inter Variable', system-ui, sans-serif",
    fontReader: "'Newsreader Variable', Georgia, serif",
    fontDisplay: "'Fraunces Variable', Georgia, serif",
    accent: "#B5532E",
    accentFg: "#FFFFFF",
    radius: 14,
    backdrop: "",
    defaultSurface: "light",
    surfaces: {
      light: { bg: "#F4EDE0", fg: "#2B2118", muted: "#6B5A47", panel: "#E8DDC8", border: "#DCCFB8", link: "#B5532E", mark: "#F0C98A" },
      sepia: sepia("#B5532E"),
      dark: { bg: "#1E1A16", fg: "#E8DDC8", muted: "#A39580", panel: "#2A2520", border: "#3A332B", link: "#E58A62", mark: "#7A5A2A" },
    },
  },
  midnight: {
    id: "midnight",
    name: "Midnight",
    nav: "rail",
    fontUi: "'Manrope Variable', system-ui, sans-serif",
    fontReader: "'Literata Variable', Georgia, serif",
    fontDisplay: "'Manrope Variable', system-ui, sans-serif",
    accent: "#8B7CFF",
    accentFg: "#FFFFFF",
    radius: 16,
    backdrop:
      "radial-gradient(circle at 0% 0%, #5B4BFF55, transparent 40%), radial-gradient(circle at 100% 100%, #FF5CA044, transparent 40%)",
    defaultSurface: "dark",
    surfaces: {
      light: { bg: "#F4F3FF", fg: "#15142B", muted: "#5C5A80", panel: "#E6E4FA", border: "#D3D0F0", link: "#5B4BFF", mark: "#CFC9FF" },
      sepia: sepia("#6B4BFF"),
      dark: { bg: "#0B0C16", fg: "#D9D8EE", muted: "#A9A8C8", panel: "#171828", border: "#2A2C44", link: "#9AA9FF", mark: "#5B4BFF66" },
    },
  },
  quiet: {
    id: "quiet",
    name: "Quiet",
    nav: "topbar",
    fontUi: "'Inter Variable', system-ui, sans-serif",
    fontReader: "'Source Serif 4 Variable', Georgia, serif",
    fontDisplay: "'Inter Variable', system-ui, sans-serif",
    accent: "#1D6FF2",
    accentFg: "#FFFFFF",
    radius: 10,
    backdrop: "",
    defaultSurface: "light",
    surfaces: {
      light: { bg: "#FFFFFF", fg: "#1C1C1C", muted: "#777777", panel: "#F0F0EE", border: "#ECECEA", link: "#1D6FF2", mark: "#CFE1FF" },
      sepia: sepia("#1D6FF2"),
      dark: { bg: "#111111", fg: "#E6E6E6", muted: "#9A9A9A", panel: "#1C1C1C", border: "#2C2C2C", link: "#6AA3FF", mark: "#1D4E9A" },
    },
  },
};

export const themeList: Theme[] = [themes.paper, themes.midnight, themes.quiet];
export const surfaceList: Surface[] = ["light", "sepia", "dark"];

/** Write a theme's tokens onto an element as CSS variables. */
export const applyTheme = (el: HTMLElement, theme: Theme, surface: Surface): void => {
  const s = theme.surfaces[surface];
  const vars: Record<string, string> = {
    "--bg": s.bg,
    "--fg": s.fg,
    "--muted": s.muted,
    "--panel": s.panel,
    "--border": s.border,
    "--link": s.link,
    "--mark": s.mark,
    "--accent": theme.accent,
    "--accent-fg": theme.accentFg,
    "--radius": `${theme.radius}px`,
    "--font-ui": theme.fontUi,
    "--font-reader": theme.fontReader,
    "--font-display": theme.fontDisplay,
    "--backdrop": surface === "dark" ? theme.backdrop || "none" : "none",
  };
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.theme = theme.id;
  el.dataset.surface = surface;
};

export interface ReaderCssInput {
  theme: Theme;
  surface: Surface;
  fontPx: number;
  lineHeight: number;
  justify: boolean;
  hyphenate: boolean;
  /** @font-face rules for the theme's reader font (the book iframe cannot see the app's fonts). */
  fontFaces?: string;
}

/**
 * CSS injected into every book section (the foliate-js iframe).
 * Font size is forced with !important because many EPUBs hard-code sizes;
 * without it zoom would only affect some books.
 */
export const readerCss = ({ theme, surface, fontPx, lineHeight, justify, hyphenate, fontFaces = "" }: ReaderCssInput): string => {
  const s = theme.surfaces[surface];
  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    ${fontFaces}
    html {
      color-scheme: ${surface === "dark" ? "dark" : "light"};
      background: ${s.bg} !important;
      color: ${s.fg} !important;
      font-size: ${fontPx}px !important;
      font-family: ${theme.fontReader} !important;
    }
    body { background: transparent !important; color: inherit !important; font-size: 1rem !important; }
    p, li, blockquote, dd {
      line-height: ${lineHeight};
      text-align: ${justify ? "justify" : "start"};
      -webkit-hyphens: ${hyphenate ? "auto" : "manual"};
      hyphens: ${hyphenate ? "auto" : "manual"};
      hanging-punctuation: allow-end last;
      widows: 2;
    }
    a:link, a:visited { color: ${s.link} !important; }
    ::selection { background: ${s.mark}; }
    img, svg, video { max-width: 100%; height: auto; }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }
    pre { white-space: pre-wrap !important; }
    aside[epub|type~="endnote"], aside[epub|type~="footnote"],
    aside[epub|type~="note"], aside[epub|type~="rearnote"] { display: none; }
  `;
};
