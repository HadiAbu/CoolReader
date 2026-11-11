import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { continueReading, countByStatus, coverColors, filterBooks, sortBooks, statusOf } from "../library/logic";
import type { Book, BookRepo, SortKey } from "../library/types";
import type { Theme } from "../themes/themes";
import "./Library.css";

type Filter = "all" | "reading" | "new" | "finished";

const ICONS: Record<string, string> = {
  all: "M4 4h4v16H4zM10 4h4v16h-4zM16 6l4 1-3 13-4-1z",
  reading: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2zM8 7h6",
  new: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
  finished: "m5 13 4 4L19 7",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-3.5-3.5",
};

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Library" },
  { id: "reading", label: "Reading" },
  { id: "new", label: "Unread" },
  { id: "finished", label: "Finished" },
];

function useCoverUrl(repo: BookRepo, book: Book): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!book.hasCover) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    repo
      .getCover(book.id)
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [repo, book.id, book.hasCover]);
  return url;
}

function Cover({ repo, book, size }: { repo: BookRepo; book: Book; size: "lg" | "md" }) {
  const url = useCoverUrl(repo, book);
  const { bg, fg } = coverColors(book.title);
  return (
    <div className={`cover cover-${size}`} style={url ? undefined : { background: bg, color: fg }}>
      {url ? (
        <img src={url} alt={`Cover of ${book.title}`} draggable={false} />
      ) : (
        <div className="cover-fallback" aria-hidden="true">
          <span className="cover-title">{book.title}</span>
          <span className="cover-author">{book.author}</span>
        </div>
      )}
    </div>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? "Still up?" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

interface Props {
  repo: BookRepo;
  theme: Theme;
  books: Book[];
  loading: boolean;
  importing: boolean;
  notice: string | null;
  onDismissNotice: () => void;
  onOpen: (book: Book) => void;
  onRemove: (id: string) => void;
  onPickFiles: () => void;
  /** Rendered at the end of the header (e.g. the appearance button). */
  headerExtra?: ReactNode;
}

export function Library({ repo, theme, books, loading, importing, notice, onDismissNotice, onOpen, onRemove, onPickFiles, headerExtra }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => countByStatus(books), [books]);
  const shown = useMemo(() => {
    const byFilter = filter === "all" ? books : books.filter((b) => statusOf(b) === filter);
    return sortBooks(filterBooks(byFilter, query), sort);
  }, [books, filter, query, sort]);
  const resume = useMemo(() => continueReading(books, 2), [books]);
  const showResume = filter === "all" && !query.trim() && resume.length > 0;

  // "/" focuses search, like most reading and file apps.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const heading = theme.id === "paper" ? `${greeting()}, reader` : FILTERS.find((f) => f.id === filter)?.label ?? "Library";

  return (
    <div className={`library nav-${theme.nav}`}>
      <aside className="lib-nav" aria-label="Library menu">
        <div className="brand">Folio</div>
        <nav aria-label="Library sections">
          {FILTERS.map((f) => (
            <button key={f.id} className="nav-item" aria-current={filter === f.id ? "page" : undefined} onClick={() => setFilter(f.id)}>
              <Icon name={f.id} />
              <span className="nav-label">{f.label}</span>
              <span className="nav-count">{counts[f.id]}</span>
            </button>
          ))}
        </nav>
        <button className="btn add" onClick={onPickFiles} disabled={importing}>
          <Icon name="plus" />
          <span className="nav-label">{importing ? "Adding…" : "Add books"}</span>
        </button>
      </aside>

      <div className="lib-main">
        <header className="lib-head">
          <h1>{heading}</h1>
          <label className="search">
            <Icon name="search" />
            <input ref={searchRef} aria-label="Search library" placeholder="Search your library" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <label className="sort">
            <span className="sr">Sort by</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="recent">Recently read</option>
              <option value="added">Recently added</option>
              <option value="title">Title</option>
              <option value="author">Author</option>
            </select>
          </label>
          {headerExtra}
        </header>

        {notice ? (
          <div className="notice" role="status">
            <span>{notice}</span>
            <button className="notice-x" aria-label="Dismiss" onClick={onDismissNotice}>×</button>
          </div>
        ) : null}

        {showResume ? (
          <section className="resume" aria-label="Continue reading">
            <h2 className="eyebrow">Continue reading</h2>
            <div className="resume-row">
              {resume.map((b) => (
                <button key={b.id} className="resume-card" onClick={() => onOpen(b)}>
                  <Cover repo={repo} book={b} size="md" />
                  <div className="resume-info">
                    <strong>{b.title}</strong>
                    <span>{b.author}</span>
                    <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>
                    <span className="pct-text">{Math.round(b.progress * 100)}% read</span>
                  </div>
                  <span className="resume-cta">Resume</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {loading ? (
          <p className="muted">Loading your library…</p>
        ) : books.length === 0 ? (
          <div className="lib-empty">
            <h2>Your shelf is empty</h2>
            <p>Add EPUB, MOBI, AZW3, FB2 or CBZ files, or drop them anywhere in this window.</p>
            <button className="btn primary" onClick={onPickFiles}>Add books</button>
          </div>
        ) : shown.length === 0 ? (
          <p className="muted">No books match.</p>
        ) : (
          <section aria-label="Books">
            <ul className="grid">
              {shown.map((b) => (
                <li key={b.id} className="card">
                  <button className="card-open" onClick={() => onOpen(b)} aria-label={`Open ${b.title}${b.author ? ` by ${b.author}` : ""}`}>
                    <Cover repo={repo} book={b} size="lg" />
                    <span className="card-title">{b.title}</span>
                    <span className="card-author">{b.author}</span>
                    {b.progress > 0 ? (
                      <span className="bar-track thin" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.round(b.progress * 100)}%` }} /></span>
                    ) : null}
                  </button>
                  {confirming === b.id ? (
                    <div className="confirm" role="group" aria-label={`Remove ${b.title}?`}>
                      <button className="btn danger" onClick={() => { setConfirming(null); onRemove(b.id); }}>Remove</button>
                      <button className="btn" onClick={() => setConfirming(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="card-menu" aria-label={`Remove ${b.title} from library`} onClick={() => setConfirming(b.id)}>×</button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
