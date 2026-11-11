// Reading statistics: time spent reading per day per book. Pure helpers only.

export const TICK_MS = 5_000;
export const TICK_SECONDS = TICK_MS / 1000;
/** Pending seconds are written to storage once they reach this many. */
export const FLUSH_SECONDS = 30;
/** No input for this long and the reader is considered away (time stops counting). */
export const IDLE_MS = 90_000;
/** A day counts toward the streak once at least this much was read. */
export const STREAK_MIN_SECONDS = 60;

export interface ReadingRow {
  /** `${day}|${bookId}` */
  key: string;
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  bookId: string;
  seconds: number;
}

export interface StatsRepo {
  add(day: string, bookId: string, seconds: number): Promise<void>;
  /** Write an absolute value (used by restore). */
  put(row: ReadingRow): Promise<void>;
  list(): Promise<ReadingRow[]>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar day, so "today" matches the user's wall clock rather than UTC. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseDay = (day: string): Date => {
  const [y, m, d] = day.split("-").map(Number);
  // Noon avoids daylight-saving edge cases when adding days.
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12);
};

export const addDays = (day: string, delta: number): string => {
  const d = parseDay(day);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
};

export const shouldCount = (s: { now: number; lastActivity: number; visible: boolean; idleMs?: number }): boolean =>
  s.visible && s.now - s.lastActivity <= (s.idleMs ?? IDLE_MS);

export const totalSeconds = (rows: ReadingRow[]): number => rows.reduce((n, r) => n + r.seconds, 0);

export const secondsOn = (rows: ReadingRow[], day: string): number =>
  rows.reduce((n, r) => (r.day === day ? n + r.seconds : n), 0);

/** The last n days ending at `today`, oldest first, including days with no reading. */
export const lastNDays = (rows: ReadingRow[], n: number, today: string): { day: string; seconds: number }[] => {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.seconds);
  return Array.from({ length: n }, (_, i) => {
    const day = addDays(today, i - (n - 1));
    return { day, seconds: byDay.get(day) ?? 0 };
  });
};

/**
 * Consecutive days with enough reading, ending today. Today not having reached the
 * minimum yet does not break a streak that ran up to yesterday.
 */
export const currentStreak = (rows: ReadingRow[], today: string): number => {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.seconds);
  const met = (day: string) => (byDay.get(day) ?? 0) >= STREAK_MIN_SECONDS;
  let day = met(today) ? today : addDays(today, -1);
  let n = 0;
  while (met(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
};

export const topBooks = (
  rows: ReadingRow[],
  books: { id: string; title: string }[],
  limit = 5,
): { id: string; title: string; seconds: number }[] => {
  const bySeconds = new Map<string, number>();
  for (const r of rows) bySeconds.set(r.bookId, (bySeconds.get(r.bookId) ?? 0) + r.seconds);
  return books
    .map((b) => ({ id: b.id, title: b.title, seconds: bySeconds.get(b.id) ?? 0 }))
    .filter((b) => b.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, limit);
};

export const formatDuration = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return s === 0 ? "0 min" : "<1 min";
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekdayName = (day: string): string => WEEKDAYS[parseDay(day).getDay()];
export const weekdayInitial = (day: string): string => weekdayName(day).slice(0, 1);
