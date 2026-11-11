import { useEffect, useRef } from "react";
import "../../vendor/foliate-js/view.js";
import { lang } from "../library/meta";
import { zoomActionForEvent, type ReaderLayout, type ZoomAction } from "./zoom";

export interface RelocateDetail {
  fraction: number;
  cfi?: string;
  tocItem?: { label?: string; href?: string };
  location?: { current: number; total: number };
}

export interface BookInfo {
  title: string;
  author: string;
  toc: { label: string; href: string; subitems?: BookInfo["toc"] }[];
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
  lastLocation?: { cfi?: string } | null;
  book: {
    metadata?: { title?: unknown; author?: unknown };
    toc?: BookInfo["toc"];
  };
  renderer: HTMLElement & { setStyles?: (css: string) => void };
}

export interface ReaderApi {
  goTo: (target: string) => void;
  goToFraction: (f: number) => void;
  next: () => void;
  prev: () => void;
}

interface Props {
  file: File | null;
  layout: ReaderLayout;
  css: string;
  startCfi?: string | null;
  onRelocate?: (d: RelocateDetail) => void;
  onBook?: (info: BookInfo) => void;
  onError?: (e: unknown) => void;
  onZoomAction?: (a: ZoomAction) => void;
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

export function ReaderView({ file, layout, css, startCfi, onRelocate, onBook, onError, onZoomAction, apiRef }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);

  // Latest props, readable from long-lived listeners without re-running the open effect.
  const latest = useRef({ layout, css, startCfi, onRelocate, onBook, onError, onZoomAction });
  latest.current = { layout, css, startCfi, onRelocate, onBook, onError, onZoomAction };

  // Open a book.
  useEffect(() => {
    const host = hostRef.current;
    if (!file || !host) return;
    let cancelled = false;

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
      if (ev.key === "ArrowLeft" || ev.key === "PageUp") view.goLeft();
      else if (ev.key === "ArrowRight" || ev.key === "PageDown" || ev.key === " ") view.goRight();
    };
    // Book content lives in an iframe, so events never reach the app window: attach to each section doc.
    const onLoad = (e: Event) => {
      const doc = (e as CustomEvent<{ doc?: Document }>).detail?.doc;
      if (!doc) return;
      doc.addEventListener("keydown", handleDocEvent);
      doc.addEventListener("wheel", handleDocEvent, { passive: false });
    };
    const onRel = (e: Event) => latest.current.onRelocate?.((e as CustomEvent<RelocateDetail>).detail);
    view.addEventListener("load", onLoad);
    view.addEventListener("relocate", onRel);

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
      };
    }

    return () => {
      cancelled = true;
      view.removeEventListener("load", onLoad);
      view.removeEventListener("relocate", onRel);
      try {
        view.close();
      } catch {
        /* renderer may not exist yet if open() had not finished */
      }
      view.remove();
      viewRef.current = null;
      if (apiRef) apiRef.current = null;
    };
  }, [file, apiRef]);

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
