import { useCallback, useEffect, useRef } from "react";
import { dayKey, FLUSH_SECONDS, shouldCount, TICK_MS, TICK_SECONDS, type StatsRepo } from "./logic";

/**
 * Counts time spent reading a book. Time only accrues while the window is visible and there was
 * recent input (page turns, keys, taps, scrolling), so leaving a book open overnight adds nothing.
 * Returns `touch`, which the reader calls on any activity inside the book iframe.
 */
export function useReadingTimer(bookId: string | null, repo: StatsRepo) {
  const lastActivity = useRef(Date.now());
  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  useEffect(() => {
    if (!bookId) return;
    lastActivity.current = Date.now();
    let pending = 0;

    const flush = () => {
      const seconds = pending;
      pending = 0;
      if (seconds > 0) void repo.add(dayKey(new Date()), bookId, seconds).catch(() => {});
    };
    const id = window.setInterval(() => {
      const visible = document.visibilityState === "visible";
      if (shouldCount({ now: Date.now(), lastActivity: lastActivity.current, visible })) {
        pending += TICK_SECONDS;
        if (pending >= FLUSH_SECONDS) flush();
      }
    }, TICK_MS);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("keydown", touch);
    window.addEventListener("pointerdown", touch);
    window.addEventListener("wheel", touch, { passive: true });
    return () => {
      window.clearInterval(id);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("keydown", touch);
      window.removeEventListener("pointerdown", touch);
      window.removeEventListener("wheel", touch);
      flush();
    };
  }, [bookId, repo, touch]);

  return { touch };
}
