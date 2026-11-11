import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookmarksOnPage, excerpt, newId, startOf } from "./annotations/logic";
import { downloadText } from "./backup/download";
import { backupFilename, buildBackup, parseBackup, planRestore, restoreSummary } from "./backup/logic";
import type { Annotation, HighlightColor } from "./annotations/types";
import { useAnnotations } from "./annotations/useAnnotations";
import { annotationRepo, repo, statsRepo } from "./library/repo";
import type { Book } from "./library/types";
import { useLibrary } from "./library/useLibrary";
import {
  ReaderView,
  type BookInfo,
  type ReaderApi,
  type RelocateDetail,
  type ScreenRect,
  type SelectionInfo,
} from "./reader/ReaderView";
import { keyAction, shouldHandleKey, type KeyAction } from "./reader/keys";
import { computeLayout, pinchZoomTarget, zoomActionForEvent, type ZoomAction } from "./reader/zoom";
import { applySearchEvent, idleSearch, startSearch, type SearchHit, type SearchState } from "./search/logic";
import type { ReadingRow } from "./stats/logic";
import { useReadingTimer } from "./stats/useReadingTimer";
import { toggleFullscreen } from "./platform/fullscreen";
import { useSettings } from "./state/settings";
import { fontFaceCss, READER_FONT } from "./themes/fonts";
import { applyTheme, readerCss, resolveSurface, themes } from "./themes/themes";
import { AnnotationPopover } from "./ui/AnnotationPopover";
import { Library } from "./ui/Library";
import { NotesPanel } from "./ui/NotesPanel";
import { SearchPanel } from "./ui/SearchPanel";
import { SettingsPanel } from "./ui/SettingsPanel";
import { StatsPanel } from "./ui/StatsPanel";
import { Toc } from "./ui/Toc";
import "./App.css";

/** Tracks the OS light/dark preference so "System" can follow it live. */
const useSystemDark = () => {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
};

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
  const systemDark = useSystemDark();
  const surface = resolveSurface(settings.surface, theme, systemDark);
  const viewportWidth = useViewportWidth();
  const lib = useLibrary(repo);

  const [view, setView] = useState<View>({ kind: "library" });
  const [info, setInfo] = useState<BookInfo | null>(null);
  const [progress, setProgress] = useState<RelocateDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "settings" | "toc" | "notes" | "search" | "stats">("none");
  const [statsRows, setStatsRows] = useState<ReadingRow[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [active, setActive] = useState<{ id: string; rect: ScreenRect } | null>(null);
  const [search, setSearch] = useState<SearchState>(idleSearch);
  const [dataMessage, setDataMessage] = useState<string | null>(null);
  const searchToken = useRef(0);
  const ann = useAnnotations(view.kind === "reader" ? view.book.id : null, annotationRepo);
  const timer = useReadingTimer(view.kind === "reader" ? view.book.id : null, statsRepo);
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
  const fontFaces = useMemo(() => fontFaceCss([READER_FONT[themeId]]), [themeId]);
  const css = useMemo(
    () => readerCss({ theme, surface, fontPx: layout.fontPx, lineHeight, justify, hyphenate, fontFaces }),
    [theme, surface, layout.fontPx, lineHeight, justify, hyphenate, fontFaces],
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

  // Pinch maps absolutely from the zoom at the start of the gesture, so it never drifts.
  const pinchStart = useRef(zoom);
  const onPinch = useCallback((p: { phase: "start" | "move" | "end"; ratio: number }) => {
    const s = useSettings.getState();
    if (p.phase === "start") pinchStart.current = s.zoom;
    else if (p.phase === "move") s.setZoom(pinchZoomTarget(pinchStart.current, p.ratio));
  }, []);

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
    setSelection(null);
    setActive(null);
    setSearch(idleSearch);
    setView({ kind: "reader", book, file, startCfi: book.cfi });
    void patch(book.id, { lastOpenedAt: Date.now() });
  };

  const backToLibrary = () => {
    flushSave();
    setPanel("none");
    setError(null);
    setSelection(null);
    setActive(null);
    setSearch(idleSearch);
    setView({ kind: "library" });
  };

  // ---- highlights, notes and bookmarks ----
  const dismissPopover = useCallback(() => {
    setSelection(null);
    setActive(null);
    apiRef.current?.clearSelection();
  }, []);

  const baseAnnotation = (kind: Annotation["kind"], cfi: string, text: string, color: HighlightColor): Annotation => {
    const now = Date.now();
    return {
      id: newId(),
      bookId: view.kind === "reader" ? view.book.id : "",
      kind,
      cfi,
      color,
      text,
      note: "",
      label: progress?.tocItem?.label?.trim() ?? "",
      fraction: progress?.fraction ?? 0,
      createdAt: now,
      updatedAt: now,
    };
  };

  const createHighlight = async (color: HighlightColor) => {
    if (!selection) return;
    const a = baseAnnotation("highlight", selection.cfi, excerpt(selection.text), color);
    const rect = selection.rect;
    await ann.add(a);
    apiRef.current?.clearSelection();
    setSelection(null);
    setActive({ id: a.id, rect });
  };

  const bookmarksHere = useMemo(() => bookmarksOnPage(ann.items, progress?.cfi), [ann.items, progress?.cfi]);
  const toggleBookmark = async () => {
    if (bookmarksHere.length) {
      for (const b of bookmarksHere) await ann.remove(b.id);
      return;
    }
    if (!progress?.cfi) return;
    const label = progress.tocItem?.label?.trim() ?? "";
    await ann.add(baseAnnotation("bookmark", startOf(progress.cfi), label || `Page at ${Math.round(progress.fraction * 100)}%`, "yellow"));
  };

  const editing = active ? ann.items.find((a) => a.id === active.id) : undefined;

  // Opening any side panel closes the floating toolbar so the two never overlap.
  useEffect(() => {
    if (panel !== "none") {
      setSelection(null);
      setActive(null);
    }
  }, [panel]);

  // ---- in-book search ----
  const runSearch = async (query: string, opts: { matchCase: boolean; matchWholeWords: boolean }) => {
    const api = apiRef.current;
    if (!api) return;
    const token = ++searchToken.current;
    let st = startSearch(query);
    setSearch(st);
    try {
      for await (const ev of api.search({ query: st.query, ...opts })) {
        if (token !== searchToken.current) return; // a newer search replaced this one
        st = applySearchEvent(st, ev);
        setSearch(st);
        if (st.truncated) {
          setSearch({ ...st, status: "done" });
          return;
        }
      }
    } catch {
      if (token === searchToken.current) setSearch({ ...st, status: "done" });
    }
  };

  const clearSearch = useCallback(() => {
    searchToken.current++;
    apiRef.current?.clearSearch();
    setSearch(idleSearch);
  }, []);

  const goToHit = (hit: SearchHit) => {
    apiRef.current?.goTo(hit.cfi);
    // On narrow screens the panel would hide the match, so close it (matches stay outlined).
    if (window.innerWidth < 760) setPanel("none");
  };

  // Ctrl/Cmd+F opens in-book search while reading (the book iframe forwards its own via ReaderView).
  useEffect(() => {
    if (view.kind !== "reader") return;
    const on = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setPanel("search");
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view.kind]);

  // ---- backup / restore of notes and reading positions ----
  const exportData = async () => {
    try {
      const lists = await Promise.all(lib.books.map((b) => annotationRepo.list(b.id)));
      const backup = buildBackup(lib.books, lists.flat());
      downloadText(backupFilename(), JSON.stringify(backup, null, 2));
      const notes = lists.flat().length;
      setDataMessage(`Exported ${notes} ${notes === 1 ? "note" : "notes"} and positions for ${backup.books.length} ${backup.books.length === 1 ? "book" : "books"}. Look for ${backupFilename()} in your Downloads folder.`);
    } catch (e) {
      setDataMessage(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restoreData = async (file: File) => {
    try {
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        setDataMessage(parsed.error);
        return;
      }
      const existing = new Map(
        await Promise.all(parsed.backup.books.map(async (b) => [b.id, await annotationRepo.list(b.id)] as const)),
      );
      const plan = planRestore(parsed.backup, lib.books, existing);
      for (const a of plan.annotationsToPut) await annotationRepo.put(a);
      for (const u of plan.progressUpdates) {
        await lib.patch(u.id, { progress: u.progress, cfi: u.cfi, lastOpenedAt: u.lastOpenedAt });
      }
      ann.reload();
      setDataMessage(restoreSummary(plan.summary, parsed.skipped));
    } catch (e) {
      setDataMessage(`Restore failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ---- keyboard: the window and the book frames feed the same handler ----
  const handleKeyAction = useCallback(
    (a: KeyAction) => {
      const api = apiRef.current;
      switch (a) {
        case "left": api?.left(); break;
        case "right": api?.right(); break;
        case "prev": api?.prev(); break;
        case "next": api?.next(); break;
        case "first": api?.goToFraction(0); break;
        case "last": api?.goToFraction(1); break;
        case "fullscreen": void toggleFullscreen(); break;
        case "escape":
          // Close the innermost thing first: the floating toolbar, then a side panel.
          if (selection || active) dismissPopover();
          else if (panel !== "none") setPanel("none");
          break;
      }
    },
    [selection, active, panel, dismissPopover],
  );

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const a = keyAction(e);
      if (!a) return;
      const global = a === "escape" || a === "fullscreen";
      // Page keys only turn pages while reading, and never steal keys from text fields.
      if (!global && (view.kind !== "reader" || !shouldHandleKey(e, e.target as HTMLElement | null))) return;
      e.preventDefault();
      handleKeyAction(a);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view.kind, handleKeyAction]);

  const pickFiles = () => inputRef.current?.click();
  const importFiles = (files: FileList | File[] | null | undefined) => {
    const list = Array.from(files ?? []);
    if (list.length) void lib.importFiles(list);
  };

  // Re-read reading time each time the stats panel opens.
  useEffect(() => {
    if (panel !== "stats") return;
    let cancelled = false;
    statsRepo.list().then((rows) => !cancelled && setStatsRows(rows)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [panel]);

  const statsToggle = (
    <div className="popover-anchor">
      <button
        className="btn icon"
        aria-label="Reading statistics"
        aria-pressed={panel === "stats"}
        onClick={() => setPanel(panel === "stats" ? "none" : "stats")}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M5 20V11M12 20V5M19 20v-6" />
        </svg>
      </button>
      {panel === "stats" ? <StatsPanel rows={statsRows} books={lib.books} /> : null}
    </div>
  );

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
      {panel === "settings" ? <SettingsPanel data={{ onExport: () => void exportData(), onRestore: (f) => void restoreData(f), message: dataMessage }} /> : null}
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
            onRemove={(id) => {
              void annotationRepo.removeForBook(id);
              void lib.remove(id);
            }}
            onPickFiles={pickFiles}
            headerExtra={
              <>
                {statsToggle}
                {settingsToggle}
              </>
            }
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
              <button
                className="btn icon"
                aria-label="Search in book"
                aria-pressed={panel === "search"}
                disabled={!info}
                onClick={() => setPanel(panel === "search" ? "none" : "search")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </button>
              <button
                className="btn icon bm"
                aria-label={bookmarksHere.length ? "Remove bookmark" : "Add bookmark"}
                aria-pressed={bookmarksHere.length > 0}
                disabled={!progress?.cfi}
                onClick={() => void toggleBookmark()}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill={bookmarksHere.length ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 3h12v18l-6-4-6 4z" />
                </svg>
              </button>
              <button
                className="btn icon"
                aria-label="Highlights and bookmarks"
                aria-pressed={panel === "notes"}
                onClick={() => setPanel(panel === "notes" ? "none" : "notes")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m4 20 4-1 11-11-3-3L5 16zM14 6l3 3" />
                </svg>
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
              annotations={ann.items}
              onBook={setInfo}
              onRelocate={onRelocate}
              onError={(e) => setError(e instanceof Error ? e.message : String(e))}
              onZoomAction={doZoom}
              onPinch={onPinch}
              onFind={() => setPanel("search")}
              onKeyAction={handleKeyAction}
              onActivity={timer.touch}
              onSelection={(s) => {
                setSelection(s);
                setActive(null);
              }}
              onAnnotationClick={({ id, rect }) => {
                setSelection(null);
                setActive({ id, rect });
              }}
            />
            {error ? <div className="error" role="alert">Could not open this book: {error}</div> : null}

            {selection ? (
              <AnnotationPopover
                rect={selection.rect}
                mode="create"
                onPickColor={(c) => void createHighlight(c)}
                onSaveNote={() => {}}
                onCopy={() => {
                  void navigator.clipboard?.writeText(selection.text).catch(() => {});
                  dismissPopover();
                }}
                onClose={dismissPopover}
              />
            ) : null}
            {active && editing ? (
              <AnnotationPopover
                rect={active.rect}
                mode="edit"
                color={editing.color}
                note={editing.note}
                onPickColor={(c) => void ann.update(editing.id, { color: c })}
                onSaveNote={(note) => void ann.update(editing.id, { note })}
                onDelete={() => {
                  void ann.remove(editing.id);
                  setActive(null);
                }}
                onClose={dismissPopover}
              />
            ) : null}

            {panel === "search" ? (
              <SearchPanel state={search} onSearch={(q, o) => void runSearch(q, o)} onGo={goToHit} onClear={clearSearch} />
            ) : null}

            {panel === "notes" ? (
              <NotesPanel
                book={{ title: info?.title ?? view.book.title, author: info?.author ?? view.book.author }}
                items={ann.items}
                onGo={(a) => {
                  apiRef.current?.goTo(a.cfi);
                  setPanel("none");
                }}
                onDelete={(a) => void ann.remove(a.id)}
              />
            ) : null}

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
