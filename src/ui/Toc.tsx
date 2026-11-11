import type { BookInfo } from "../reader/ReaderView";

interface Props {
  items: BookInfo["toc"];
  activeHref?: string;
  onPick: (href: string) => void;
  depth?: number;
}

export function Toc({ items, activeHref, onPick, depth = 0 }: Props) {
  return (
    <ul className="toc" style={{ paddingInlineStart: depth ? "1rem" : 0 }}>
      {items.map((item, i) => (
        <li key={`${item.href}-${i}`}>
          <button
            className="toc-item"
            aria-current={item.href === activeHref ? "true" : undefined}
            onClick={() => onPick(item.href)}
          >
            {item.label?.trim() || "Untitled"}
          </button>
          {item.subitems?.length ? (
            <Toc items={item.subitems} activeHref={activeHref} onPick={onPick} depth={depth + 1} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
