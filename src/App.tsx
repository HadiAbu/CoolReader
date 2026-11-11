import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReaderView, type BookInfo, type ReaderApi, type RelocateDetail } from "./reader/ReaderView";
import { computeLayout, zoomActionForEvent, type ZoomAction } from "./reader/zoom";
import { useSettings } from "./state/settings";
import { applyTheme, readerCss, themes } from "./themes/themes";
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

export default function App() {
  const settings = useSettings();
  const { themeId, zoom, layoutMode, charsPerLine, lineHeight, justify, hyphenate, uiScale } = settings;
  const theme = themes[themeId];
  const surface = settings.surface ?? theme.defaultSurface;
  const viewportWidth = useViewportWidth();

  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<BookInfo | null>(null);
  const [progress, setProgress] = useState<RelocateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "settings" | "toc">("none");
  const apiRef = useRef<ReaderApi | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const doZoom = useCallback(
    (a: ZoomAction) => {
      const s = useSettings.getState();
      if (a === "in") s.zoomIn();
      else if (a === "out") s.zoomOut();
      else s.resetZoom();
    },
    [],
  );

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

  const openFile = (f: File | undefined | null) => {
    if (!f) return;
    setError(null);
    setInfo(null);
    setProgress(null);
    setPanel("none");
    setFile(f);
  };

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        openFile(e.dataTransfer.files[0]);
      }}
    >
      <header className="bar">
        <button className="btn" onClick={() => inputRef.current?.click()}>
          {file ? "Open another" : "Open book"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".epub,.mobi,.azw3,.fb2,.cbz,application/epub+zip"
          hidden
          onChange={(e) => {
            openFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <div className="title">
          {info ? (
            <>
              <strong>{info.title}</strong>
              {info.author ? <span> · {info.author}</span> : null}
            </>
          ) : (
            <strong>Folio</strong>
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
          <button
            className="btn icon aa"
            aria-label="Text settings"
            aria-pressed={panel === "settings"}
            onClick={() => setPanel(panel === "settings" ? "none" : "settings")}
          >
            Aa
          </button>
        </div>
      </header>

      <main className="stage">
        {file ? (
          <ReaderView
            file={file}
            layout={layout}
            css={css}
            apiRef={apiRef}
            onBook={setInfo}
            onRelocate={setProgress}
            onError={(e) => setError(e instanceof Error ? e.message : String(e))}
            onZoomAction={doZoom}
          />
        ) : (
          <div className="empty">
            <h1>Folio</h1>
            <p>Drop an EPUB here, or open one to start reading.</p>
            <button className="btn primary" onClick={() => inputRef.current?.click()}>Open book</button>
          </div>
        )}
        {error ? <div className="error" role="alert">Could not open this book: {error}</div> : null}

        {panel === "settings" ? <SettingsPanel /> : null}
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

      {file ? (
        <footer className="foot">
          <button className="btn icon" aria-label="Previous page" onClick={() => apiRef.current?.prev()}>‹</button>
          <input
            type="range"
            aria-label="Reading progress"
            min={0}
            max={1}
            step={0.001}
            value={progress?.fraction ?? 0}
            onChange={(e) => apiRef.current?.goToFraction(Number(e.target.value))}
          />
          <span className="pct">{Math.round((progress?.fraction ?? 0) * 100)}%</span>
          <button className="btn icon" aria-label="Next page" onClick={() => apiRef.current?.next()}>›</button>
        </footer>
      ) : null}
    </div>
  );
}
