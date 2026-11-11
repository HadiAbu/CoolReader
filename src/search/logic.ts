// Pure state handling for in-book search. foliate-js streams results as an async generator;
// the UI folds each event into a SearchState with applySearchEvent.

export interface SearchHit {
  cfi: string;
  excerpt: { pre: string; match: string; post: string };
}

export interface SearchGroup {
  label: string;
  hits: SearchHit[];
}

export type SearchEvent =
  | "done"
  | { progress: number }
  | { label?: string; subitems: SearchHit[] };

export interface SearchState {
  query: string;
  status: "idle" | "searching" | "done";
  /** 0..1 across the sections of the book. */
  progress: number;
  groups: SearchGroup[];
  /** True when MAX_HITS was reached and further results were dropped. */
  truncated: boolean;
}

/** Keeps the result list (and the number of overlays foliate paints) bounded. */
export const MAX_HITS = 500;
export const MIN_QUERY_LENGTH = 2;

export const idleSearch: SearchState = { query: "", status: "idle", progress: 0, groups: [], truncated: false };

export const normalizeQuery = (q: string): string => q.replace(/\s+/g, " ").trim();
export const isSearchable = (q: string): boolean => normalizeQuery(q).length >= MIN_QUERY_LENGTH;

export const startSearch = (query: string): SearchState => ({
  query: normalizeQuery(query),
  status: "searching",
  progress: 0,
  groups: [],
  truncated: false,
});

export const hitCount = (s: SearchState): number => s.groups.reduce((n, g) => n + g.hits.length, 0);

export const applySearchEvent = (state: SearchState, ev: SearchEvent): SearchState => {
  if (ev === "done") return { ...state, status: "done", progress: 1 };
  if ("progress" in ev) return { ...state, progress: Math.min(1, Math.max(0, ev.progress)) };

  const room = MAX_HITS - hitCount(state);
  if (room <= 0) return { ...state, truncated: true };
  const hits = ev.subitems.slice(0, room);
  if (!hits.length) return state;

  const label = (ev.label ?? "").trim() || "Untitled";
  const last = state.groups[state.groups.length - 1];
  const groups =
    last && last.label === label
      ? [...state.groups.slice(0, -1), { label, hits: [...last.hits, ...hits] }]
      : [...state.groups, { label, hits }];
  return { ...state, groups, truncated: state.truncated || hits.length < ev.subitems.length };
};

export const searchSummary = (s: SearchState): string => {
  const n = hitCount(s);
  if (s.status === "idle") return "";
  if (s.status === "searching") return n ? `${n} found so far…` : "Searching…";
  if (!n) return "No matches";
  return `${n}${s.truncated ? "+" : ""} ${n === 1 ? "match" : "matches"}${s.truncated ? " (showing the first " + MAX_HITS + ")" : ""}`;
};
