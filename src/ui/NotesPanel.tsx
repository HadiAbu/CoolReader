import { useState } from "react";
import { groupByChapter, HIGHLIGHT_COLORS, toMarkdown } from "../annotations/logic";
import type { Annotation } from "../annotations/types";
import { Section } from "./Section";
import "./Annotations.css";

interface Props {
  book: { title: string; author: string };
  items: Annotation[];
  onGo: (a: Annotation) => void;
  onDelete: (a: Annotation) => void;
}

/** Drawer listing highlights, notes and bookmarks in reading order, with Markdown export. */
export function NotesPanel({ book, items, onGo, onDelete }: Props) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const groups = groupByChapter(items);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(book, items));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied("idle"), 2000);
  };

  return (
    <aside className="drawer notes" aria-label="Highlights and bookmarks">
      <div className="notes-head">
        <h2>Notes</h2>
        <button className="ann-btn" onClick={copy} disabled={!items.length}>
          {copied === "ok" ? "Copied" : copied === "fail" ? "Copy failed" : "Copy as Markdown"}
        </button>
      </div>
      {!items.length ? (
        <p className="hint">Select text to highlight it, or use the bookmark button to mark your place.</p>
      ) : (
        groups.map((g) => (
          <Section key={g.label} title={g.label} level={3} className="notes-group">
            <ul>
              {g.items.map((a) => (
                <li key={a.id} className="notes-item">
                  <button className="notes-go" onClick={() => onGo(a)}>
                    {a.kind === "highlight" ? (
                      <span className="notes-quote" style={{ borderColor: HIGHLIGHT_COLORS[a.color].hex }}>{a.text}</span>
                    ) : (
                      <span className="notes-bm">Bookmark · {Math.round(a.fraction * 100)}%</span>
                    )}
                    {a.note ? <span className="notes-note">{a.note}</span> : null}
                  </button>
                  <button className="notes-del" aria-label={`Delete ${a.kind}`} onClick={() => onDelete(a)}>×</button>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </aside>
  );
}
