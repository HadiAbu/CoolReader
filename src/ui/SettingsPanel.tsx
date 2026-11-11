import { useRef } from "react";
import { detectDeviceClass, useSettings } from "../state/settings";
import { surfaceList, themeList, type SurfacePref } from "../themes/themes";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  type LayoutMode,
} from "../reader/zoom";
import { Section } from "./Section";

const PRESETS: [string, number][] = [
  ["Small", 90],
  ["Default", 100],
  ["Large", 140],
  ["Extra", 200],
];

const LAYOUTS: [LayoutMode, string][] = [
  ["auto", "Auto"],
  ["single", "Single"],
  ["spread", "Spread"],
  ["scroll", "Scroll"],
];

export interface DataActions {
  onExport: () => void;
  onRestore: (file: File) => void;
  /** Result of the last export or restore, shown under the buttons. */
  message: string | null;
}

export function SettingsPanel({ data }: { data?: DataActions }) {
  const s = useSettings();
  const restoreInput = useRef<HTMLInputElement>(null);
  const device = detectDeviceClass();
  const surfaceValue: SurfacePref | "auto" = s.surface ?? "auto";

  return (
    <div className="panel" role="dialog" aria-label="Display settings">
      <Section title="Theme">
        <div className="seg" role="group" aria-label="Theme">
          {themeList.map((t) => (
            <button key={t.id} aria-pressed={s.themeId === t.id} onClick={() => s.setTheme(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Reading surface">
          {(["auto", ...surfaceList, "system"] as const).map((v) => (
            <button
              key={v}
              aria-pressed={surfaceValue === v}
              onClick={() => s.setSurface(v === "auto" ? null : v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Text size" aside={<span className="value" aria-hidden="true">{s.zoom}%</span>}>
        <div className="zoomrow">
          <button className="btn icon" aria-label="Smaller text" onClick={s.zoomOut}>
            <span style={{ fontSize: "0.9rem" }} aria-hidden="true">A</span>
          </button>
          <input
            type="range"
            aria-label="Text size"
            aria-valuetext={`${s.zoom} percent`}
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={s.zoom}
            onChange={(e) => s.setZoom(Number(e.target.value))}
          />
          <button className="btn icon" aria-label="Larger text" onClick={s.zoomIn}>
            <span style={{ fontSize: "1.5rem" }} aria-hidden="true">A</span>
          </button>
        </div>
        <div className="seg" role="group" aria-label="Text size presets">
          {PRESETS.map(([label, v]) => (
            <button key={label} aria-pressed={s.zoom === v} onClick={() => s.setZoom(v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">Ctrl/Cmd + or − to zoom, Ctrl/Cmd 0 to reset. Ctrl + scroll also works.</p>
      </Section>

      <Section title="Page layout">
        <div className="seg" role="group" aria-label="Page layout">
          {LAYOUTS.map(([v, label]) => (
            <button key={v} aria-pressed={s.layoutMode === v} onClick={() => s.setLayoutMode(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Line length <b>{s.charsPerLine} characters</b></span>
          <input type="range" min={45} max={75} step={1} value={s.charsPerLine}
            aria-valuetext={`${s.charsPerLine} characters`}
            onChange={(e) => s.setCharsPerLine(Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Line spacing <b>{s.lineHeight.toFixed(1)}</b></span>
          <input type="range" min={1.2} max={2.4} step={0.1} value={s.lineHeight}
            onChange={(e) => s.setLineHeight(Number(e.target.value))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={s.justify} onChange={(e) => s.setJustify(e.target.checked)} /> Justify text
        </label>
        <label className="check">
          <input type="checkbox" checked={s.hyphenate} onChange={(e) => s.setHyphenate(e.target.checked)} /> Hyphenate
        </label>
      </Section>

      <Section title="Interface">
        <label className="field">
          <span>Interface size <b>{s.uiScale}%</b></span>
          <input type="range" min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={10} value={s.uiScale}
            aria-valuetext={`${s.uiScale} percent`}
            onChange={(e) => s.setUiScale(Number(e.target.value))} />
        </label>
        <p className="hint">Settings are saved for this screen size ({device}).</p>
      </Section>

      {data ? (
        <Section title="Your data">
          <div className="seg" role="group" aria-label="Backup">
            <button onClick={data.onExport}>Export notes</button>
            <button onClick={() => restoreInput.current?.click()}>Restore</button>
          </div>
          <input
            ref={restoreInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Backup file to restore"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) data.onRestore(f);
              e.target.value = "";
            }}
          />
          <p className="hint" role="status" aria-live="polite">
            {data.message ?? "Saves your notes, highlights, bookmarks and reading positions to a file. Your books are not included."}
          </p>
        </Section>
      ) : null}
    </div>
  );
}
