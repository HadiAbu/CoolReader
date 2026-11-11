import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { COLOR_NAMES, HIGHLIGHT_COLORS } from "../annotations/logic";
import type { HighlightColor } from "../annotations/types";
import type { ScreenRect } from "../reader/ReaderView";
import "./Annotations.css";

interface Props {
  /** Where the selection or highlight is, in window coordinates. */
  rect: ScreenRect;
  mode: "create" | "edit";
  color?: HighlightColor;
  note?: string;
  onPickColor: (c: HighlightColor) => void;
  onSaveNote: (note: string) => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onClose: () => void;
}

const MARGIN = 8;

/** Floating toolbar shown over a text selection (create) or an existing highlight (edit). */
export function AnnotationPopover({ rect, mode, color, note = "", onPickColor, onSaveNote, onDelete, onCopy, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: rect.left, top: rect.top });
  const [draft, setDraft] = useState(note);
  const [noting, setNoting] = useState(false);

  // Keep the note draft in sync when a different highlight is opened.
  useEffect(() => {
    setDraft(note);
    setNoting(false);
  }, [note, rect.left, rect.top]);

  // Place above the selection when there is room, else below, and keep inside the window.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.top - h - MARGIN;
    if (top < MARGIN) top = rect.top + rect.height + MARGIN;
    top = Math.min(Math.max(MARGIN, top), vh - h - MARGIN);
    let left = rect.left + rect.width / 2 - w / 2;
    left = Math.min(Math.max(MARGIN, left), vw - w - MARGIN);
    setPos({ left, top });
  }, [rect.left, rect.top, rect.width, rect.height, noting, mode]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [onClose]);

  return (
    <div ref={ref} className="ann-pop" role="dialog" aria-label={mode === "create" ? "Highlight text" : "Edit highlight"} style={{ left: pos.left, top: pos.top }}>
      <div className="ann-row">
        {COLOR_NAMES.map((c) => (
          <button
            key={c}
            className="ann-dot"
            style={{ background: HIGHLIGHT_COLORS[c].hex }}
            aria-label={`${mode === "create" ? "Highlight" : "Change to"} ${HIGHLIGHT_COLORS[c].label.toLowerCase()}`}
            aria-pressed={mode === "edit" && color === c}
            onClick={() => onPickColor(c)}
          />
        ))}
        {mode === "edit" ? (
          <>
            <button className="ann-btn" onClick={() => setNoting((n) => !n)} aria-expanded={noting}>
              {note || noting ? "Note" : "Add note"}
            </button>
            <button className="ann-btn danger" onClick={onDelete} aria-label="Delete highlight">Delete</button>
          </>
        ) : (
          <button className="ann-btn" onClick={onCopy}>Copy</button>
        )}
      </div>
      {mode === "edit" && (noting || note) ? (
        <div className="ann-note">
          <textarea
            aria-label="Note"
            rows={3}
            placeholder="Write a note…"
            value={draft}
            autoFocus={noting}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="ann-row end">
            <button className="ann-btn" onClick={() => onSaveNote(draft)} disabled={draft === note}>Save note</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
