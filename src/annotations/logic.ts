import { collapse, compare } from "../../vendor/foliate-js/epubcfi.js";
import type { Annotation, HighlightColor } from "./types";

export const HIGHLIGHT_COLORS: Record<HighlightColor, { hex: string; label: string }> = {
  yellow: { hex: "#f6c445", label: "Yellow" },
  green: { hex: "#58c27d", label: "Green" },
  blue: { hex: "#5aa9f0", label: "Blue" },
  pink: { hex: "#f06fa5", label: "Pink" },
};
export const COLOR_NAMES = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Safe comparison: malformed CFIs sort last instead of throwing. */
export const compareCfi = (a: string, b: string): number => {
  try {
    return compare(a, b);
  } catch {
    return a < b ? -1 : a > b ? 1 : 0;
  }
};

/** Reading order. Ties fall back to creation time. */
export const sortByPosition = (list: Annotation[]): Annotation[] =>
  [...list].sort((a, b) => compareCfi(a.cfi, b.cfi) || a.createdAt - b.createdAt);

/**
 * Is the annotation's position on the page currently shown?
 * pageCfi is the visible range's CFI (what foliate reports on relocate).
 */
export const isOnPage = (annotationCfi: string, pageCfi: string | undefined): boolean => {
  if (!pageCfi) return false;
  try {
    const start = collapse(pageCfi, false);
    const end = collapse(pageCfi, true);
    const point = collapse(annotationCfi, false);
    return compare(start, point) <= 0 && compare(point, end) < 0;
  } catch {
    return false;
  }
};

/** A point CFI at the start of a (possibly range) CFI. */
export const startOf = (cfi: string): string => {
  try {
    return collapse(cfi, false);
  } catch {
    return cfi;
  }
};

export const bookmarksOnPage = (list: Annotation[], pageCfi: string | undefined): Annotation[] =>
  list.filter((a) => a.kind === "bookmark" && isOnPage(a.cfi, pageCfi));

export interface ChapterGroup {
  label: string;
  items: Annotation[];
}

/** Group in reading order; chapters appear in the order their first annotation occurs. */
export const groupByChapter = (list: Annotation[]): ChapterGroup[] => {
  const groups: ChapterGroup[] = [];
  for (const a of sortByPosition(list)) {
    const label = a.label.trim() || "Untitled";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(a);
    else groups.push({ label, items: [a] });
  }
  return groups;
};

const quote = (text: string) =>
  text
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join("\n");

export const toMarkdown = (book: { title: string; author: string }, list: Annotation[]): string => {
  const out: string[] = [`# ${book.title}`];
  if (book.author) out.push(`*${book.author}*`);
  if (!list.length) return out.join("\n\n") + "\n";
  for (const g of groupByChapter(list)) {
    out.push(`## ${g.label}`);
    for (const a of g.items) {
      if (a.kind === "bookmark") {
        out.push(`- Bookmark at ${Math.round(a.fraction * 100)}%${a.note ? `: ${a.note}` : ""}`);
      } else {
        const lines = [quote(a.text)];
        if (a.note.trim()) lines.push(`**Note:** ${a.note.trim()}`);
        out.push(lines.join("\n\n"));
      }
    }
  }
  return out.join("\n\n") + "\n";
};

export const excerpt = (text: string, max = 500): string => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
