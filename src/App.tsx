import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { repo } from "./library/repo";
import type { Book } from "./library/types";
import { useLibrary } from "./library/useLibrary";
import { ReaderView, type BookInfo, type ReaderApi, type RelocateDetail } from "./reader/ReaderView";
import { computeLayout, zoomActionForEvent, type ZoomAction } from "./reader/zoom";
import { useSettings } from "./state/settings";
import { applyTheme, readerCss, themes } from "./themes/themes";
import { Library } from "./ui/Library";
import { SettingsPanel } from "./ui/SettingsPanel";
import { Toc } from "./ui/Toc";
import "./App.css";

const useViewportWidth = () => {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
};

type View = { kind: "library" } | { kind: "reader"; book: Book; file: File; startCfi: string | null };
type PendingSave = { id: string; progress: number; cfi: string | null };

export default function App() {
  const settings = useSettings();
  const { themeId, zoom, layoutMode, charsPerLine, lineHeight, justify, hyphenate, uiScale } = settings;
  const theme = themes[themeId];
  const surface = settings.surface ?? theme.defaultSurface;
  const viewportWidth = useViewportWidth();
  const lib = useLibrary(repo);

  const [view, setView] = useState<View>({ kind: "library" });
  const [info, setInfo] = useState<BookInfo | null>(null);
  const [progress, setProgress] = useState<RelocateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "settings" | "toc">("none");
  const apiRef = useRef<ReaderApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pending = useRef<PendingSave | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  // Theme tokens and interface scale.
  useEffect(() => {
    applyTheme(document.documentElement, theme, surface);
    document.documentElement.style.fontSize = `${uiScale}%`;
  }, [theme, surface, uiScale]);

  const layout = useMemo(
    () => computeLayout({ viewportWidth, zoom, mode: layoutMode, charsPerLine }),
    [viewportWidth, zoom, layoutMode, charsPerLine],
  );
  const css = useMemo(
    () => readerCss({ theme, surface, fontPx: layout.fontPx, lineHeight, justify, hyphenate }),
    [theme, surface, layout.fontPx, lineHeight, justify, hyphenate],
  );

  const doZoom = useCallback((a: ZoomAction) => {
    const s = useSettings.getState();
    if (a === "in") s.zoomIn();
    else if (a === "out") s.zoomOut();
    else s.resetZoom();
  }, []);

  // Zoom hotkeys on the app window (the book iframe forwards its own via ReaderView).
  useEffect(() => {
    const on = (e: KeyboardEvent | WheelEvent) => {
      const a = zoomActionForEvent(e);
      if (a) {
        e.preventDefault();
        doZoom(a);
      }
    };
    window.addEventListener("keydown", on);
    window.addEventListener("wheel", on, { passive: false });
    return () => {
      window.removeEventListener("keydown", on);
      window.removeEventListener("wheel", on);
    };
  }, [doZoom]);

  const { patch } = lib;
  const flushSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) void patch(p.id, { progress: p.progress, cfi: p.cfi });
  }, [patch]);

  const onRelocate = useCallback(
    (d: RelocateDetail) => {
      setProgress(d);
      if (view.kind !== "reader") return;
      pending.current = { id: view.book.id, progress: d.fraction ?? 0, cfi: d.cfi ?? null };
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(flushSave, 600);
    },
    [view, flushSave],
  );

  // Save on tab close / app exit too.
  useEffect(() => {
    const on = () => flushSave();
    window.addEventListener("pagehide", on);
    return () => window.removeEventListener("pagehide", on);
  }, [flushSave]);

  const openBook = async (book: Book) => {
    const file = await repo.getFile(book.id);
    if (!file) {
      setError(`The file for "${book.title}" is missing from storage.`);
      return;
    }
    setError(null);
    lib.clearNotice();
    setInfo(null);
    setProgress(null);
    setPanel("none");
    setView({ kind: "reader", book, file, startCfi: book.cfi });
    void patch(book.id, { lastOpenedAt: Date.now() });
  };

  const backToLibrary = () => {
    flushSave();
    setPanel("none");
    setError(null);
    setView({ kind: "library" });
  };

  const pickFiles = () => inputRef.current?.click();
  const importFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length) void lib.importFiles(list);
  };

  // The panel is anchored to its own toggle so it never covers the button, whatever the theme layout.
  const settingsToggle = (
    <div className="popover-anchor">
      <button
        className="btn icon aa"
        aria-label="Text settings"
        aria-pressed={panel === "settings"}
        onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
      >
        Aa
      </button>
      {panel === "settings" ? <SettingsPanel /> : null}
    </div>
  );

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (view.kind !== "library") return;
        importFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".epub,.mobi,.azw3,.fb2,.cbz,application/epub+zip"
        hidden
        onChange={(e) => {
          importFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {view.kind === "library" ? (
        <main className="stage lib-stage">
          <Library
            repo={repo}
            theme={theme}
            books={lib.books}
            loading={lib.loading}
            importing={lib.importing}
            notice={error ?? lib.notice}
            onDismissNotice={() => {
              setError(null);
              lib.clearNotice();
            }}
            onOpen={openBook}
            onRemove={(id) => void lib.remove(id)}
            onPickFiles={pickFiles}
            headerExtra={settingsToggle}
          />
        </main>
      ) : (
        <>
          <header className="bar">
            <button className="btn" onClick={backToLibrary} aria-label="Back to library">‹ Library</button>
            <div className="title">
              {info ? (
                <>
                  <strong>{info.title}</strong>
                  {info.author ? <span> · {info.author}</span> : null}
                </>
              ) : (
                <strong>{view.book.title}</strong>
              )}
            </div>
            <div className="actions">
              <button
                className="btn icon"
                aria-label="Contents"
                aria-pressed={panel === "toc"}
                disabled={!info}
                onClick={() => setPanel(panel === "toc" ? "none" : "toc")}
              >
                ☰
              </button>
              {settingsToggle}
            </div>
          </header>

          <main className="stage">
            <ReaderView
              key={view.book.id}
              file={view.file}
              startCfi={view.startCfi}
              layout={layout}
              css={css}
              apiRef={apiRef}
              onBook={setInfo}
              onRelocate={onRelocate}
              onError={(e) => setError(e instanceof Error ? e.message : String(e))}
              onZoomAction={doZoom}
            />
            {error ? <div className="error" role="alert">Could not open this book: {error}</div> : null}

            {panel === "toc" && info ? (
              <aside className="drawer" aria-label="Contents">
                <h3>Contents</h3>
                <Toc
                  items={info.toc}
                  activeHref={progress?.tocItem?.href}
                  onPick={(href) => {
                    apiRef.current?.goTo(href);
                    setPanel("none");
                  }}
                />
              </aside>
            ) : null}
          </main>

          <footer className="foot">
            <button className="btn icon" aria-label="Previous page" onClick={() => apiRef.current?.prev()}>‹</button>
            <input
              type="range"
              aria-label="Reading progress"
              min={0}
              max={1}
              step={0.001}
              value={progress?.fraction ?? view.book.progress}
              onChange={(e) => apiRef.current?.goToFraction(Number(e.target.value))}
            />
            <span className="pct">{Math.round((progress?.fraction ?? view.book.progress) * 100)}%</span>
            <button className="btn icon" aria-label="Next page" onClick={() => apiRef.current?.next()}>›</button>
          </footer>
        </>
      )}
    </div>
  );
}
