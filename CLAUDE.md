# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Folio ("CoolReader") is an EPUB reader: Tauri v2 shell + React 19 + TypeScript + Vite, rendering books with the vendored foliate-js engine. Desktop first, Android later. There is no backend.

## Commands

```bash
git submodule update --init      # vendor/foliate-js is a submodule; nothing works without it
pnpm install
pnpm dev                         # frontend only, http://localhost:1420 (fixed port)
pnpm tauri dev                   # native window; first Rust compile takes many minutes
pnpm build                       # tsc typecheck + vite build (this is the only type check)
pnpm test                        # vitest run, all tests
pnpm vitest run src/reader/zoom.test.ts            # one file
pnpm vitest run -t "pinchZoomTarget"               # one test by name
```

There is no linter or formatter configured. `pnpm build` must stay clean (`noUnusedLocals`/`noUnusedParameters` are on).

## Architecture

**Rendering is foliate-js, not ours.** `vendor/foliate-js` (git submodule, MIT, plain ES modules, no types) parses books and paginates them. Do not edit it. `src/foliate.d.ts` declares the few modules we import (`view.js`, `overlayer.js`, `epubcfi.js`). `src/reader/ReaderView.tsx` is the only place that talks to the `<foliate-view>` element.

**Book content lives in iframes, which drives several designs:**
- Key, wheel, touch and selection events do not reach the app window. `ReaderView` attaches listeners to each section document from the foliate `load` event (zoom hotkeys, arrow-key paging, pinch, text selection).
- App `@font-face` rules and CSS variables are invisible inside the book. `themes/themes.ts#readerCss` builds the whole stylesheet (colours, font size forced with `!important`, bundled `@font-face` from `themes/fonts.ts`) and `ReaderView` pushes it with `renderer.setStyles`.
- Layout is controlled by attributes on the renderer (`flow`, `gap`, `margin`, `max-inline-size`, `max-column-count`) computed by `reader/zoom.ts#computeLayout`.
- On any layout or style change `ReaderView` re-applies them and calls `goTo(lastLocation.cfi)` to keep the reading position. Position is always a CFI, never a page number.
- `ReaderView` keeps the latest props in a `latest` ref so the long-lived listeners created when a book opens never go stale. Do not put callbacks in the open-effect dependency list.

**Pure logic is separated and tested.** `reader/zoom.ts` (zoom range, layout rules, hotkey and pinch mapping), `library/logic.ts` (sort, filter, status, content-hash id), `annotations/logic.ts` (CFI ordering, "is this bookmark on the visible page", Markdown export) and the settings store have unit tests next to them. UI components are verified by running the app. `annotations/logic.ts` imports `vendor/foliate-js/epubcfi.js` directly, which is pure JS and runs under vitest.

**Themes are token sets plus structural flags.** `themes/themes.ts` defines Paper, Midnight and Quiet, each with light, sepia and dark surfaces. `applyTheme` writes CSS variables on `<html>` (and `data-theme`/`data-surface`). A theme's `nav` flag (`sidebar | rail | topbar`) switches the library layout through `.nav-*` classes in `ui/Library.css`; there is one DOM, not three components. Theme-specific polish uses `[data-theme="..."]` selectors.

**Settings are per device class.** `state/settings.ts` creates one persisted zustand store keyed `folio.settings.<phone|tablet|desktop>`, chosen once at module load from `window.innerWidth`. So a narrow window loads different saved settings than a wide one; this is intended. Text zoom (reader) and `uiScale` (root font size, so use `rem`) are independent.

**Storage sits behind two interfaces** in `library/types.ts` and `annotations/types.ts` (`BookRepo`, `AnnotationRepo`). `library/repo.ts` picks the backend; today it is IndexedDB (`library/idbRepo.ts`, DB version 2, guarded upgrades) in both the browser and the Tauri webview. A SQLite + files backend is planned but deliberately not built. Books are keyed by the first 16 hex chars of the file's SHA-256, so re-importing is a no-op. `App.tsx` owns the library/reader view state, saves progress debounced at 600 ms, and flushes on "back to library" and `pagehide`.

**Highlights.** Stored as range CFIs. `ReaderView` draws them through foliate's overlayer in two places that must agree: the `create-overlay` event (section loaded; this is the only path after a reload) and a diff effect (add, recolour, delete). Both record into the same `drawn` map; if a path forgets to, deletes leave ghost highlights on the page.

## Gotchas

- **Rust toolchain:** this machine uses `stable-x86_64-pc-windows-gnu` (no Visual Studio Build Tools). Linking Tauri as a DLL fails ("export ordinal too large"), so `src-tauri/Cargo.toml` has `crate-type = ["rlib"]`. Restore `["staticlib", "cdylib", "rlib"]` before any Android/iOS work (see `docs/android.md`).
- **CSP** (`src-tauri/tauri.conf.json`) is `script-src 'self'` with no external styles or fonts. This blocks scripts inside books (foliate's iframes are `allow-scripts allow-same-origin`) and means fonts must be bundled, which they are. The browser dev server has no CSP, so CSP problems only show in `pnpm tauri dev`.
- `dragDropEnabled` is `false` in the Tauri window config so HTML5 file drops reach the page.
- Fonts are latin-subset variable fonts imported with `?url` from `@fontsource-variable/*`. Non-latin books fall back to system fonts.
- The foliate build warning about `vendor/pdfjs/*` glob is harmless (PDF is not supported yet).
- Git on Windows prints "LF will be replaced by CRLF" warnings; ignore them.
- The Playwright MCP can only upload files from the repo root or its `.playwright-mcp` folder. Do not commit test books or screenshots.

## Rules for this project

- Do not copy code from Readest or Koodo Reader (AGPL-3.0). Reading them for design ideas is fine. foliate-js (MIT) and the bundled fonts (OFL) are fine.
- Work is organised in phase branches (`phase-*`); merge to the default branch with `--no-ff` and never delete the phase branch. Never push without the user approving that specific push.
