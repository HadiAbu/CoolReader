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

To drive the real native webview (clicks, JS, assertions) launch it with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222" pnpm tauri dev`, then talk Chrome DevTools Protocol to `http://127.0.0.1:9222/json` (Node 22 has a global `WebSocket`; send `Runtime.evaluate`). Only stop the node/epub-reader processes whose command line contains this repo's path.

```bash
cd src-tauri && cargo test --lib     # Rust unit tests (the open-with allow-list logic)
pnpm notices                          # regenerate THIRD_PARTY_NOTICES.md from the real license files
node scripts/gen-icon.mjs && pnpm tauri icon icons-source/app-icon.png   # redraw the app icon + all sizes
pnpm tauri build                      # NSIS installer (per-user); heavy, see below
```

Low on memory? Prefix cargo-heavy commands with `CARGO_BUILD_JOBS=2` (the machine has ~7 GB and the dev app was once killed for memory). The release profile deliberately uses thin LTO and 4 codegen units for the same reason.

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

**Native shell** (`src-tauri/src/lib.rs`, small on purpose). Window size/position via `tauri-plugin-window-state`; `tauri-plugin-single-instance` forwards a second launch's arguments to the running window. "Open with": the OS passes book paths as arguments; Rust canonicalises them, keeps them in an allow-list and queues them; the UI pulls them with `take_pending_opens` and reads bytes with `read_opened_file`, which refuses any path the OS did not hand over, non-book extensions and files over 512 MB. Frontend half is `platform/openWith.ts`; `App.tsx` imports then opens the first book. Links inside books never open in the app: `ReaderView` cancels foliate's `external-link` and `platform/openExternal.ts` allows only http, https and mailto through the opener plugin. Desktop-only crates sit under a `cfg(not(android/ios))` dependency table so Android can still build later. `mainBinaryName` makes the installed program `Folio.exe` (the cargo binary stays `epub-reader`); file-type names are prefixed "Folio " so they cannot collide with another reader's registry type. `bundle.fileAssociations`, the NSIS per-user installer and the bundled LICENSE/notices live in `tauri.conf.json`; `devCsp` is the looser dev-only CSP.

**Keyboard.** `reader/keys.ts` maps keys to actions (arrows are visual left/right so RTL books flip; Page keys and Space are logical prev/next). Because the book is in iframes, `ReaderView` forwards the same actions through `onKeyAction`, and `App.tsx` has one `handleKeyAction` for both the window and the frames. Navigation keys never fire from text fields or on Space over a button; Escape (close toolbar, then side panel) and F11 work everywhere. Fullscreen uses the Tauri window API with a browser fallback (`platform/fullscreen.ts`; needs the `core:window:allow-*-fullscreen` permissions in `src-tauri/capabilities`). The surface preference can be "system" (`resolveSurface` in `themes.ts`), which follows `prefers-color-scheme` live.

**Accessibility is enforced, not hoped for.** `themes/contrast.ts` plus the tests in `themes/themes.test.ts` check every text/background pairing (4.5:1), button labels on the accent, and the accent as a UI colour (3:1) for all 9 theme×surface combinations; when a token fails, adjust it (a surface may override `accent`/`accentFg`, as Midnight does). Panels use the `Section` component so every section has a heading label, with one `h1` per screen (the library title, or the book title in the reader), panels at `h2` and groups at `h3`. A skip link is the first tab stop, there is one global `:focus-visible` ring, and motion is disabled under `prefers-reduced-motion` (foliate only animates if an `animated` attribute is set, which we never do). Toggle buttons keep a constant name and use `aria-pressed`.

**Search** streams from foliate's `view.search()` async generator. `search/logic.ts` is a pure reducer (`applySearchEvent`) that folds events into grouped, capped (500 hits) results; `App.tsx` guards against overlapping searches with a token. Foliate paints the match outlines itself; `clearSearch()` removes them. Ctrl/Cmd+F is forwarded from the book iframe like the zoom hotkeys.

**Backup** (`backup/logic.ts`) exports progress + annotations (not book files) as versioned JSON. `parseBackup` validates and drops bad entries, forcing each annotation's `bookId` to its enclosing book; `planRestore` only adds or replaces-if-newer and never deletes. Annotations are keyed by file hash, so notes for a not-yet-imported book attach when that file is imported later.

**Reading stats** (`stats/`): `useReadingTimer` ticks every 5 s and only counts while the window is visible and there was input within 90 s (activity comes from the window plus listeners `ReaderView` attaches inside the book iframes via `onActivity`). It flushes every 30 s and on hide/unmount into per-day-per-book rows (`reading` store, key `day|bookId`; days are local time). Aggregation, streaks and formatting are pure and tested in `stats/logic.ts`. Stats are not part of the backup file yet. IndexedDB is at schema version 3; every `onupgradeneeded` step is guarded and connections close on `versionchange`.

**Highlights.** Stored as range CFIs. `ReaderView` draws them through foliate's overlayer in two places that must agree: the `create-overlay` event (section loaded; this is the only path after a reload) and a diff effect (add, recolour, delete). Both record into the same `drawn` map; if a path forgets to, deletes leave ghost highlights on the page.

## Gotchas

- **Rust toolchain:** this machine uses `stable-x86_64-pc-windows-gnu` (no Visual Studio Build Tools). Linking Tauri as a DLL fails ("export ordinal too large"), so `src-tauri/Cargo.toml` has `crate-type = ["rlib"]`. Restore `["staticlib", "cdylib", "rlib"]` before any Android/iOS work (see `docs/android.md`).
- **CSP** (`src-tauri/tauri.conf.json`) is `script-src 'self'` with no external styles or fonts. This blocks scripts inside books (foliate's iframes are `allow-scripts allow-same-origin`) and means fonts must be bundled, which they are. The browser dev server has no CSP, so CSP problems only show in `pnpm tauri dev`.
- `dragDropEnabled` is `false` in the Tauri window config so HTML5 file drops reach the page.
- Fonts are latin-subset variable fonts imported with `?url` from `@fontsource-variable/*`. Non-latin books fall back to system fonts.
- The foliate build warning about `vendor/pdfjs/*` glob is harmless (PDF is not supported yet).
- CSS is plain global stylesheets (no CSS modules): pick unique class names. A drawer once collapsed because it reused the library's `.search` class.
- Git on Windows prints "LF will be replaced by CRLF" warnings; ignore them.
- The Playwright MCP can only upload files from the repo root or its `.playwright-mcp` folder. Do not commit test books or screenshots.

## Rules for this project

- Do not copy code from Readest or Koodo Reader (AGPL-3.0). Reading them for design ideas is fine. foliate-js (MIT) and the bundled fonts (OFL) are fine.
- Work is organised in phase branches (`phase-*`); merge to the default branch with `--no-ff` and never delete the phase branch. Never push without the user approving that specific push.
