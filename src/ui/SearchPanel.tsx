import { useEffect, useRef, useState } from "react";
import { hitCount, isSearchable, searchSummary, type SearchHit, type SearchState } from "../search/logic";
import { Section } from "./Section";
import "./Search.css";

interface Props {
  state: SearchState;
  onSearch: (query: string, opts: { matchCase: boolean; matchWholeWords: boolean }) => void;
  onGo: (hit: SearchHit) => void;
  onClear: () => void;
}

/** Drawer for searching inside the open book. Searches on Enter, not on every keystroke. */
export function SearchPanel({ state, onSearch, onGo, onClear }: Props) {
  const [query, setQuery] = useState(state.query);
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWords, setMatchWholeWords] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSearchable(query)) onSearch(query, { matchCase, matchWholeWords });
  };

  const count = hitCount(state);

  return (
    <aside className="drawer find" aria-label="Search in book">
      <h2 className="sr">Search in book</h2>
      <form className="search-form" onSubmit={submit} role="search">
        <input
          ref={inputRef}
          type="search"
          aria-label="Search in this book"
          placeholder="Search in this book"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="btn primary search-go" type="submit" disabled={!isSearchable(query)}>Search</button>
      </form>
      <div className="search-opts">
        <label className="check"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
        <label className="check"><input type="checkbox" checked={matchWholeWords} onChange={(e) => setMatchWholeWords(e.target.checked)} /> Whole words</label>
      </div>

      {state.status !== "idle" ? (
        <div className="search-status" role="status" aria-live="polite">
          <span>{searchSummary(state)}</span>
          <button className="ann-btn" onClick={() => { setQuery(""); onClear(); }}>Clear</button>
        </div>
      ) : (
        <p className="hint">Press Enter to search. Matches are outlined on the page.</p>
      )}
      {state.status === "searching" ? (
        <div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{ width: `${Math.round(state.progress * 100)}%` }} /></div>
      ) : null}

      {count > 0
        ? state.groups.map((g) => (
            <Section key={g.label} title={g.label} level={3} className="notes-group">
              <ul>
                {g.hits.map((h, i) => (
                  <li key={`${h.cfi}-${i}`}>
                    <button className="notes-go search-hit" onClick={() => onGo(h)}>
                      <span>
                        {h.excerpt.pre}
                        <mark>{h.excerpt.match}</mark>
                        {h.excerpt.post}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ))
        : null}
    </aside>
  );
}
