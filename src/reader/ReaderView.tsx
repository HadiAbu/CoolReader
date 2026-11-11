import { useEffect, useRef } from "react";
import "../../vendor/foliate-js/view.js";
import { Overlayer } from "../../vendor/foliate-js/overlayer.js";
import { HIGHLIGHT_COLORS } from "../annotations/logic";
import type { Annotation } from "../annotations/types";
import { lang } from "../library/meta";
import type { SearchEvent } from "../search/logic";
import { zoomActionForEvent, type ReaderLayout, type ZoomAction } from "./zoom";

export interface RelocateDetail {
  fraction: number;
  /** CFI of the visible range. */
  cfi?: string;
  tocItem?: { label?: string; href?: string };
  location?: { current: number; total: number };
}

export interface BookInfo {
  title: string;
  author: string;
  toc: { label: string; href: string; subitems?: BookInfo["toc"] }[];
}

/** A rectangle in app-window (viewport) coordinates. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface SelectionInfo {
  cfi: string;
  text: string;
  rect: ScreenRect;
}

interface FoliateAnnotation {
  value: string;
  color: string;
  id: string;
}

/** The slice of the <foliate-view> element API this app uses. */
interface FoliateView extends HTMLElement {
  open(file: File): Promise<void>;
  init(opts: { lastLocation?: string; showTextStart?: boolean }): Promise<void>;
  close(): void;
  goTo(target: string | number): Promise<void>;
  goToFraction(f: number): Promise<void>;
  goLeft(): Promise<void>;
  goRight(): Promise<void>;
  getCFI(index: number, range?: Range): string;
  resolveCFI(cfi: string): { index: number };
  addAnnotation(a: FoliateAnnotation, remove?: boolean): Promise<unknown>;
  deleteAnnotation(a: FoliateAnnotation): Promise<unknown>;
  search(opts: Record<string, unknown>): AsyncGenerator<SearchEvent>;
  clearSearch(): void;
  lastLocation?: { cfi?: string } | null;
  book: {
    metadata?: { title?: unknown; author?: unknown };
    toc?: BookInfo["toc"];
  };
  renderer: HTMLElement & {
    setStyles?: (css: string) => void;
    getContents: () => { index: number; doc: Document }[];
  };
}

export interface ReaderApi {
  goTo: (target: string) => void;
  goToFraction: (f: number) => void;
  next: () => void;
  prev: () => void;
  clearSelection: () => void;
  /** Streams results and paints matches on the page; start a new search to cancel the old one. */
  search: (opts: { query: string; matchCase?: boolean; matchWholeWords?: boolean }) => AsyncIterable<SearchEvent>;
  clearSearch: () => void;
}

interface Props {
  file: File | null;
  layout: ReaderLayout;
  css: string;
  startCfi?: string | null;
  annotations?: Annotation[];
  onRelocate?: (d: RelocateDetail) => void;
  onBook?: (info: BookInfo) => void;
  onError?: (e: unknown) => void;
  onZoomAction?: (a: ZoomAction) => void;
  onSelection?: (s: SelectionInfo | null) => void;
  /** Ctrl/Cmd+F pressed while the book has focus. */
  onFind?: () => void;
  /** Any input inside the book (keys, taps, wheel) or a page change; used to time reading. */
  onActivity?: () => void;
  /** Two-finger pinch on the book text. ratio = currentDistance / startDistance. */
  onPinch?: (p: { phase: "start" | "move" | "end"; ratio: number }) => void;
  onAnnotationClick?: (info: { id: string; rect: ScreenRect }) => void;
  apiRef?: { current: ReaderApi | null };
}

const applyLayout = (view: FoliateView, l: ReaderLayout) => {
  const r = view.renderer;
  r.setAttribute("flow", l.flow);
  r.setAttribute("gap", `${l.gap}%`);
  r.setAttribute("margin", `${l.margin}px`);
  r.setAttribute("max-inline-size", `${l.maxInlineSize}px`);
  r.setAttribute("max-column-count", String(l.maxColumnCount));
};

/** Convert a Range inside a book iframe to app-window coordinates. */
const toScreenRect = (range: Range): ScreenRect => {
  const doc = range.startContainer.ownerDocument;
  const frame = doc?.defaultView?.frameElement as HTMLElement | null | undefined;
  const f = frame?.getBoundingClientRect();
  const r = range.getBoundingClientRect();
  return { left: (f?.left ?? 0) + r.left, top: (f?.top ?? 0) + r.top, width: r.width, height: r.height };
};

const toFoliate = (a: Annotation): FoliateAnnotation => ({
  value: a.cfi,
  color: HIGHLIGHT_COLORS[a.color].hex,
  id: a.id,
});

const highlightsOf = (list: Annotation[] | undefined) => (list ?? []).filter((a) => a.kind === "highlight");

export function ReaderView({
  file,
  layout,
  css,
  startCfi,
  annotations,
  onRelocate,
  onBook,
  onError,
  onZoomAction,
  onSelection,
  onFind,
  onActivity,
  onPinch,
  onAnnotationClick,
  apiRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const drawnRef = useRef(new Map<string, Annotation>());

  // Latest props, readable from long-lived listeners without re-running the open effect.
  const latest = useRef({ layout, css, startCfi, annotations, onRelocate, onBook, onError, onZoomAction, onSelection, onFind, onActivity, onPinch, onAnnotationClick });
  latest.current = { layout, css, startCfi, annotations, onRelocate, onBook, onError, onZoomAction, onSelection, onFind, onActivity, onPinch, onAnnotationClick };

  // Open a book.
  useEffect(() => {
    const host = hostRef.current;
    if (!file || !host) return;
    let cancelled = false;
    const drawn = drawnRef.current;
    drawn.clear();

    const view = document.createElement("foliate-view") as FoliateView;
    view.style.cssText = "display:block;width:100%;height:100%";
    host.append(view);
    viewRef.current = view;

    const handleDocEvent = (e: Event) => {
      const ev = e as KeyboardEvent & WheelEvent;
      const action = zoomActionForEvent(ev);
      if (action) {
        e.preventDefault();
        latest.current.onZoomAction?.(action);
        return;
      }
      if (e.type !== "keydown") return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "f") {
        e.preventDefault();
        latest.current.onFind?.();
        return;
      }
      if (ev.key === "ArrowLeft" || ev.key === "PageUp") view.goLeft();
      else if (ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ") view.goRight();
    };

    // Book content lives in an iframe, so events never reach the app window: attach to each section doc.
    const onLoad = (e: Event) => {
      const { doc, index } = (e as CustomEvent<{ doc?: Document; index: number }>).detail ?? {};
      if (!doc) return;
      doc.addEventListener("keydown", handleDocEvent);
      doc.addEventListener("wheel", handleDocEvent, { passive: false });
      for (const type of ["keydown", "pointerdown", "touchstart", "wheel"]) {
        doc.addEventListener(type, () => latest.current.onActivity?.(), { passive: true });
      }

      const checkSelection = () => {
        const sel = doc.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) {
          latest.current.onSelection?.(null);
          return;
        }
        const range = sel.getRangeAt(0);
        try {
          latest.current.onSelection?.({ cfi: view.getCFI(index, range), text: sel.toString(), rect: toScreenRect(range) });
        } catch {
          latest.current.onSelection?.(null);
        }
      };
      // Pinch to zoom: report the finger-distance ratio; the app maps it to a zoom level.
      let startDist = 0;
      const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
      doc.addEventListener("touchstart", (ev) => {
        if (ev.touches.length === 2) {
          startDist = dist(ev.touches);
          if (startDist > 0) latest.current.onPinch?.({ phase: "start", ratio: 1 });
        }
      }, { passive: true });
      doc.addEventListener("touchmove", (ev) => {
        if (ev.touches.length === 2 && startDist > 0) {
          ev.preventDefault();
          latest.current.onPinch?.({ phase: "move", ratio: dist(ev.touches) / startDist });
        }
      }, { passive: false });
      doc.addEventListener("touchend", (ev) => {
        if (startDist > 0 && ev.touches.length < 2) {
          startDist = 0;
          latest.current.onPinch?.({ phase: "end", ratio: 1 });
        }
      });
      doc.addEventListener("pointerup", () => setTimeout(checkSelection, 10));
      doc.addEventListener("keyup", (ev) => {
        if (ev.shiftKey && ev.key.startsWith("Arrow")) checkSelection();
      });
    };

    const onRel = (e: Event) => {
      latest.current.onActivity?.();
      latest.current.onRelocate?.((e as CustomEvent<RelocateDetail>).detail);
    };

    // Draw saved highlights whenever a section's overlay is (re)created.
    const onCreateOverlay = (e: Event) => {
      const { index } = (e as CustomEvent<{ index: number }>).detail;
      for (const a of highlightsOf(latest.current.annotations)) {
        try {
          if (view.resolveCFI(a.cfi).index === index) {
            void view.addAnnotation(toFoliate(a));
            // Record it so a later delete or recolour knows this highlight is on the page.
            drawn.set(a.id, a);
          }
        } catch {
          /* a CFI that no longer resolves is skipped rather than breaking the page */
        }
      }
    };
    const onDraw = (e: Event) => {
      const { draw, annotation } = (e as CustomEvent<{ draw: (fn: unknown, o: Record<string, unknown>) => void; annotation: FoliateAnnotation }>).detail;
      draw(Overlayer.highlight, { color: annotation.color });
    };
    const onShow = (e: Event) => {
      const { value, range } = (e as CustomEvent<{ value: string; range: Range }>).detail;
      const hit = highlightsOf(latest.current.annotations).find((a) => a.cfi === value);
      if (hit) latest.current.onAnnotationClick?.({ id: hit.id, rect: toScreenRect(range) });
    };

    view.addEventListener("load", onLoad);
    view.addEventListener("relocate", onRel);
    view.addEventListener("create-overlay", onCreateOverlay);
    view.addEventListener("draw-annotation", onDraw);
    view.addEventListener("show-annotation", onShow);

    (async () => {
      try {
        await view.open(file);
        if (cancelled) return;
        applyLayout(view, latest.current.layout);
        view.renderer.setStyles?.(latest.current.css);
        const { title, author } = view.book.metadata ?? {};
        latest.current.onBook?.({ title: lang(title) || file.name, author: lang(author), toc: view.book.toc ?? [] });
        await view.init({ lastLocation: latest.current.startCfi ?? undefined, showTextStart: false });
      } catch (err) {
        if (!cancelled) latest.current.onError?.(err);
      }
    })();

    if (apiRef) {
      apiRef.current = {
        goTo: (t) => void view.goTo(t).catch(() => {}),
        goToFraction: (f) => void view.goToFraction(f).catch(() => {}),
        next: () => void view.goRight().catch(() => {}),
        prev: () => void view.goLeft().catch(() => {}),
        search: (o) => view.search({ ...o, draw: Overlayer.outline, drawOptions: { color: "#e8590c" } }),
        clearSearch: () => {
          try {
            view.clearSearch();
          } catch {
            /* nothing to clear */
          }
        },
        clearSelection: () => {
          try {
            for (const { doc } of view.renderer.getContents()) doc.getSelection()?.removeAllRanges();
          } catch {
            /* renderer not ready */
          }
        },
      };
    }

    return () => {
      cancelled = true;
      view.removeEventListener("load", onLoad);
      view.removeEventListener("relocate", onRel);
      view.removeEventListener("create-overlay", onCreateOverlay);
      view.removeEventListener("draw-annotation", onDraw);
      view.removeEventListener("show-annotation", onShow);
      try {
        view.close();
      } catch {
        /* renderer may not exist yet if open() had not finished */
      }
      view.remove();
      viewRef.current = null;
      drawn.clear();
      if (apiRef) apiRef.current = null;
    };
  }, [file, apiRef]);

  // Keep the on-page highlights in step with the annotation list (add, recolour, delete).
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    const drawn = drawnRef.current;
    const want = new Map(highlightsOf(annotations).map((a) => [a.id, a]));
    for (const [id, prev] of drawn) {
      if (!want.has(id)) void view.deleteAnnotation(toFoliate(prev)).catch(() => {});
    }
    for (const [id, a] of want) {
      const prev = drawn.get(id);
      if (!prev || prev.color !== a.color || prev.cfi !== a.cfi) void view.addAnnotation(toFoliate(a)).catch(() => {});
    }
    // Mutate in place: the open effect holds a reference to this same Map for cleanup.
    drawn.clear();
    for (const [id, a] of want) drawn.set(id, a);
  }, [annotations]);

  // Re-apply layout and styles when zoom, theme or window size change, keeping the reading position.
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer) return;
    const cfi = view.lastLocation?.cfi;
    applyLayout(view, layout);
    view.renderer.setStyles?.(css);
    if (cfi) void view.goTo(cfi).catch(() => {});
  }, [layout, css]);

  return <div ref={hostRef} className="reader-host" />;
}
