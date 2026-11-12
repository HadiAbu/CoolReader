# CoolReader (Folio)

<img width="947" height="480" alt="image" src="https://github.com/user-attachments/assets/7fd3be83-0452-48bd-9198-473bfdd44b0c" />
<img width="458" height="467" alt="image" src="https://github.com/user-attachments/assets/e7707155-8cf2-4e40-ba60-246dc4f5c011" />

A beautiful, easy-to-use EPUB reader for desktop, with Android planned. Built with Tauri v2, React and TypeScript on top of the [foliate-js](https://github.com/johnfactotum/foliate-js) rendering engine.

> **Status:** early development. The reader, library, highlights and themes work on desktop (Windows tested). Android is not built yet.

## Features

- **Three themes** you can switch between at any time: **Paper** (warm, editorial), **Midnight** (dark, glassy) and **Quiet** (minimal). Each has light, sepia and dark reading surfaces, and each lays out the library differently (sidebar, icon rail or top bar).
- **Comfortable reading at any screen size.** Text zoom from 70% to 300% that reflows the text instead of stretching it, a capped line length (about 66 characters by default), and an automatic switch between two-page spread, single page and scroll. Zoom with `Ctrl/Cmd +`, `-`, `0`, `Ctrl` + scroll, the settings panel, or pinch on a touchscreen. A separate interface-size slider scales the app itself for 4K screens or small laptops.
- **Library** with real cover art, search (press `/`), sorting, a Reading / Unread / Finished filter and a "Continue reading" shelf. Import several books at once from a file picker or by dropping files into the window. Importing the same file twice is detected.
- **Resume where you left off.** Your position is saved as an EPUB CFI, so it survives zoom, theme and window-size changes.
- **Highlights, notes and bookmarks.** Select text to highlight it in four colours, add a note, and click a highlight to edit or delete it. A notes drawer lists everything in reading order, grouped by chapter, with copy-as-Markdown.
- **Search inside a book** (`Ctrl/Cmd + F`): results stream in grouped by chapter, matches are outlined on the page, and a click jumps to them. Options for match case and whole words.
- **Backup and restore** of your notes, highlights, bookmarks, reading positions and reading history to a single JSON file. Restoring merges safely (never deletes), and notes for a book you haven't re-imported yet reattach when you add that same file.
- **Reading statistics:** time read today and over the last 7 days, a day streak, books finished, a small chart and your most-read books. Time only counts while you are actually reading (the window is visible and there was recent input), so a book left open overnight adds nothing.
- **Open books from Explorer.** Double-click an `.epub` (or choose "Open with Folio"). If Folio is already running, the book opens in that window instead of starting a second copy. The window remembers its size and position.
- **Keyboard friendly.** Arrow keys, Page Up/Down, Space (Shift+Space goes back), Home and End turn pages from anywhere in the window; `Esc` closes panels; `F11` toggles fullscreen; `Ctrl/Cmd + F` searches. Theme can follow your system's light/dark setting.
- **Accessible.** Every colour pairing is tested against WCAG AA contrast, headings and landmarks are labelled, there is a skip link and a visible focus ring, and animations respect "reduce motion".
- **Offline by design.** Fonts are bundled, nothing is fetched from the internet, and your books and notes stay on your device.
- **Formats:** EPUB (primary), plus MOBI, AZW3, FB2 and CBZ through foliate-js.
- Settings are remembered separately for phone, tablet and desktop-sized windows.

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (stable) for the desktop app
- Windows: [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (included in Windows 11). macOS and Linux need the usual [Tauri prerequisites](https://tauri.app/start/prerequisites/).

### Run it

```bash
git clone --recurse-submodules https://github.com/HadiAbu/CoolReader.git
cd CoolReader
pnpm install

pnpm tauri dev    # the desktop app (first Rust build takes several minutes)
pnpm dev          # or just the web UI at http://localhost:1420
```

If you already cloned without `--recurse-submodules`, run `git submodule update --init`.

### Build an installer (Windows)

```bash
pnpm tauri build   # NSIS installer, per-user (no admin needed), in src-tauri/target/release/bundle/nsis/
```

The first release build compiles the whole Rust dependency tree and needs a few GB of free memory. If the machine is tight, close other apps and limit parallelism with `CARGO_BUILD_JOBS=2`.

### Other commands

```bash
pnpm test         # unit tests (vitest)
pnpm build        # typecheck + production web build
pnpm notices      # regenerate THIRD_PARTY_NOTICES.md
```

> **Windows note:** if your Rust toolchain is the GNU one (`stable-x86_64-pc-windows-gnu`) the project builds as-is. See [`docs/android.md`](docs/android.md) for what to change before an Android build.

## How it works

The book is rendered by foliate-js inside iframes; `src/reader/ReaderView.tsx` is the single React wrapper around it. Layout and zoom rules are pure functions in `src/reader/zoom.ts`. Themes are token sets applied as CSS variables and injected into the book (`src/themes`). Books and annotations are stored behind small repository interfaces (`src/library`, `src/annotations`), currently backed by IndexedDB. See [`CLAUDE.md`](CLAUDE.md) for a deeper architecture tour.

## Roadmap

- [x] Themes, zoom and adaptive layout, library, highlights / notes / bookmarks, bundled fonts, pinch-to-zoom
- [x] In-book search
- [x] Backup and restore of notes and reading positions
- [x] Reading statistics
- [ ] Android build
- [ ] Optional SQLite and file storage, sync

## Credits and licenses

CoolReader is licensed under the [Apache License 2.0](LICENSE).

- [foliate-js](https://github.com/johnfactotum/foliate-js) by John Factotum (MIT), vendored as a git submodule in `vendor/foliate-js`. It includes [zip.js](https://github.com/gildas-lormeau/zip.js) (BSD-3-Clause), [fflate](https://github.com/101arrowz/fflate) (MIT) and [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0).
- Full license texts for everything bundled are in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (regenerate with `pnpm notices`).
- Fonts via [Fontsource](https://fontsource.org/), all under the SIL Open Font License: Inter, Manrope, Fraunces, Newsreader, Literata and Source Serif 4.
- Design inspiration came from existing open-source readers such as Foliate and Readest; no code was copied from them.
