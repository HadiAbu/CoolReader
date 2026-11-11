import { detectDeviceClass, useSettings } from "../state/settings";
import { surfaceList, themeList, type Surface } from "../themes/themes";
import {
  UI_SCALE_MAX,
  UI_SCALE_MIN,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  type LayoutMode,
} from "../reader/zoom";

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

export function SettingsPanel() {
  const s = useSettings();
  const device = detectDeviceClass();
  const surfaceValue: Surface | "auto" = s.surface ?? "auto";

  return (
    <div className="panel" role="dialog" aria-label="Text settings">
      <section>
        <h3>Theme</h3>
        <div className="seg">
          {themeList.map((t) => (
            <button key={t.id} aria-pressed={s.themeId === t.id} onClick={() => s.setTheme(t.id)}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="seg">
          {(["auto", ...surfaceList] as const).map((v) => (
            <button
              key={v}
              aria-pressed={surfaceValue === v}
              onClick={() => s.setSurface(v === "auto" ? null : v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="row">
          <h3>Text size</h3>
          <span className="value" aria-live="polite">{s.zoom}%</span>
        </div>
        <div className="zoomrow">
          <button className="btn icon" aria-label="Smaller text" onClick={s.zoomOut}>
            <span style={{ fontSize: "0.9rem" }}>A</span>
          </button>
          <input
            type="range"
            aria-label="Text size"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={s.zoom}
            onChange={(e) => s.setZoom(Number(e.target.value))}
          />
          <button className="btn icon" aria-label="Larger text" onClick={s.zoomIn}>
            <span style={{ fontSize: "1.5rem" }}>A</span>
          </button>
        </div>
        <div className="seg">
          {PRESETS.map(([label, v]) => (
            <button key={label} aria-pressed={s.zoom === v} onClick={() => s.setZoom(v)}>
              {label}
            </button>
          ))}
        </div>
        <p className="hint">Ctrl/Cmd + or − to zoom, Ctrl/Cmd 0 to reset. Ctrl + scroll also works.</p>
      </section>

      <section>
        <h3>Page layout</h3>
        <div className="seg">
          {LAYOUTS.map(([v, label]) => (
            <button key={v} aria-pressed={s.layoutMode === v} onClick={() => s.setLayoutMode(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Line length <b>{s.charsPerLine} characters</b></span>
          <input type="range" min={45} max={75} step={1} value={s.charsPerLine}
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
      </section>

      <section>
        <label className="field">
          <span>Interface size <b>{s.uiScale}%</b></span>
          <input type="range" min={UI_SCALE_MIN} max={UI_SCALE_MAX} step={10} value={s.uiScale}
            onChange={(e) => s.setUiScale(Number(e.target.value))} />
        </label>
        <p className="hint">Settings are saved for this screen size ({device}).</p>
      </section>
    </div>
  );
}
