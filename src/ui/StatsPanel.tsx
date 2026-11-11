import { useMemo } from "react";
import {
  currentStreak,
  dayKey,
  formatDuration,
  lastNDays,
  secondsOn,
  topBooks,
  totalSeconds,
  weekdayInitial,
  weekdayName,
  type ReadingRow,
} from "../stats/logic";
import { Section } from "./Section";
import "./Stats.css";

interface Props {
  rows: ReadingRow[];
  books: { id: string; title: string; progress: number }[];
}

const CHART_H = 96;

/** Reading time dashboard: headline numbers, a 7-day bar chart and the most-read books. */
export function StatsPanel({ rows, books }: Props) {
  const today = dayKey(new Date());
  const week = useMemo(() => lastNDays(rows, 7, today), [rows, today]);
  const top = useMemo(() => topBooks(rows, books, 5), [rows, books]);
  const streak = currentStreak(rows, today);
  const finished = books.filter((b) => b.progress >= 0.98).length;
  const weekTotal = week.reduce((n, d) => n + d.seconds, 0);
  const max = Math.max(60, ...week.map((d) => d.seconds));
  const peak = week.reduce((best, d) => (d.seconds > best.seconds ? d : best), week[0]);
  const empty = rows.length === 0;

  return (
    <div className="panel stats" role="dialog" aria-label="Reading statistics">
      <Section title="Reading time">
        <dl className="stat-grid">
          <div><dt>Today</dt><dd>{formatDuration(secondsOn(rows, today))}</dd></div>
          <div><dt>Last 7 days</dt><dd>{formatDuration(weekTotal)}</dd></div>
          <div><dt>Day streak</dt><dd>{streak}</dd></div>
          <div><dt>All time</dt><dd>{formatDuration(totalSeconds(rows))}</dd></div>
          <div><dt>Books finished</dt><dd>{finished}</dd></div>
        </dl>
      </Section>

      <Section title="Last 7 days">
        {empty ? (
          <p className="hint">Nothing yet. Time is counted while you read, and stops when you are idle.</p>
        ) : (
          <>
            <div
              className="bars"
              role="group"
              aria-label={`Time read per day, last 7 days. Total ${formatDuration(weekTotal)}.`}
              style={{ height: CHART_H + 24 }}
            >
              {week.map((d) => {
                const h = d.seconds > 0 ? Math.max(4, Math.round((d.seconds / max) * CHART_H)) : 0;
                const label = `${weekdayName(d.day)}: ${formatDuration(d.seconds)}`;
                return (
                  <div key={d.day} className="bar-col" tabIndex={0} role="img" aria-label={label} data-tip={label}>
                    {d === peak && d.seconds > 0 ? <span className="bar-peak" aria-hidden="true">{formatDuration(d.seconds)}</span> : null}
                    <span className="bar-mark" style={{ height: h }} aria-hidden="true" />
                    <span className={`bar-day${d.day === today ? " today" : ""}`} aria-hidden="true">{weekdayInitial(d.day)}</span>
                  </div>
                );
              })}
            </div>
            {/* Text alternative to the chart. The wrapper clips it, since a clipped table still adds scrollable overflow. */}
            <div className="sr">
              <table>
                <caption>Reading time per day</caption>
                <tbody>
                  {week.map((d) => (
                    <tr key={d.day}>
                      <th scope="row">{weekdayName(d.day)} {d.day}</th>
                      <td>{formatDuration(d.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>

      {top.length ? (
        <Section title="Most read">
          <ul className="top-list">
            {top.map((b) => (
              <li key={b.id}>
                <span className="top-title">{b.title}</span>
                <span className="top-time">{formatDuration(b.seconds)}</span>
                <span className="bar-track thin" aria-hidden="true">
                  <span className="bar-fill" style={{ width: `${Math.round((b.seconds / top[0].seconds) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
