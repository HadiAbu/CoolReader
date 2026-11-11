# CoolReader (Folio)

A beautiful, easy-to-use EPUB reader for desktop, with Android planned. Built with Tauri v2, React and TypeScript on top of the [foliate-js](https://github.com/johnfactotum/foliate-js) rendering engine.

> **Status:** early development. The reader, library, highlights and themes work on desktop (Windows tested). Android is not built yet.

## Features

- **Three themes** you can switch between at any time: **Paper** (warm, editorial), **Midnight** (dark, glassy) and **Quiet** (minimal). Each has light, sepia and dark reading surfaces, and each lays out the library differently (sidebar, icon rail or top bar).
- **Comfortable reading at any screen size.** Text zoom from 70% to 300% that reflows the text instead of stretching it, a capped line length (about 66 characters by default), and an automatic switch between two-page spread, single page and scroll. Zoom with `Ctrl/Cmd +`, `-`, `0`, `Ctrl` + scroll, the settings panel, or pinch on a touchscreen. A separate interface-size slider scales the app itself for 4K screens or small laptops.
- **Library** with real cover art, search (press `/`), sorting, a Reading / Unread / Finished filter and a "Continue reading" shelf. Import several books at once from a file picker or by dropping files into the window. Importing the same file twice is detected.
- **Resume where you left off.** Your position is saved as an EPUB CFI, so it survives zoom, theme and window-size changes.
- **Highlights, notes and bookmarks.** Select text to highlight it in four colours, add a note, and click a highlight to edit or delete it. A notes drawer lists everything in reading order, grouped by chapter, with copy-as-Markdown.
- **Search inside a book** (`Ctrl/Cmd + F`): results stream in grouped by chapter, matches are outlined on the page, and a click jumps to them. Options for match case and whole words.
- **Backup and restore** of your notes, highlights, bookmarks and reading positions to a single JSON file. Restoring merges safely (never deletes), and notes for a book you haven't re-imported yet reattach when you add that same file.
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

### Other commands

```bash
pnpm test         # unit tests (vitest)
pnpm build        # typecheck + production web build
pnpm tauri build  # package the desktop app
```

> **Windows note:** if your Rust toolchain is the GNU one (`stable-x86_64-pc-windows-gnu`) the project builds as-is. See [`docs/android.md`](docs/android.md) for what to change before an Android build.

## How it works

The book is rendered by foliate-js inside iframes; `src/reader/ReaderView.tsx` is the single React wrapper around it. Layout and zoom rules are pure functions in `src/reader/zoom.ts`. Themes are token sets applied as CSS variables and injected into the book (`src/themes`). Books and annotations are stored behind small repository interfaces (`src/library`, `src/annotations`), currently backed by IndexedDB. See [`CLAUDE.md`](CLAUDE.md) for a deeper architecture tour.

## Roadmap

- [x] Themes, zoom and adaptive layout, library, highlights / notes / bookmarks, bundled fonts, pinch-to-zoom
- [x] In-book search
- [x] Backup and restore of notes and reading positions
- [ ] Reading statistics
- [ ] Android build
- [ ] Optional SQLite and file storage, sync

## Credits and licenses

CoolReader is licensed under the [Apache License 2.0](LICENSE).

- [foliate-js](https://github.com/johnfactotum/foliate-js) by John Factotum (MIT), vendored as a git submodule in `vendor/foliate-js`. It includes [zip.js](https://github.com/gildas-lormeau/zip.js) (BSD-3-Clause), [fflate](https://github.com/101arrowz/fflate) (MIT) and [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0).
- Fonts via [Fontsource](https://fontsource.org/), all under the SIL Open Font License: Inter, Manrope, Fraunces, Newsreader, Literata and Source Serif 4.
- Design inspiration came from existing open-source readers such as Foliate and Readest; no code was copied from them.
