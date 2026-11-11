//! Folio desktop shell.
//!
//! Besides hosting the web UI this does three small native jobs:
//! - remember the window size and position (window-state plugin),
//! - keep a single running instance, forwarding later launches to it (single-instance plugin),
//! - "Open with Folio": accept book paths from the OS and hand their bytes to the UI.

use std::{
    collections::HashSet,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

use tauri::Manager;
#[cfg(desktop)]
use tauri::Emitter;

/// Extensions the app can read (the same list as the file picker in the UI).
const BOOK_EXTENSIONS: [&str; 5] = ["epub", "mobi", "azw3", "fb2", "cbz"];
/// Refuse absurdly large files instead of loading them into memory.
const MAX_BOOK_BYTES: u64 = 512 * 1024 * 1024;

/// Paths the OS handed us. Only these can be read back by the UI.
#[derive(Default)]
struct Opens {
    /// Waiting for the UI to collect them.
    pending: Mutex<Vec<String>>,
    /// Every path the OS has handed us this session; the only files `read_opened_file` will serve.
    allowed: Mutex<HashSet<PathBuf>>,
}

/// A poisoned lock only means another thread panicked; the data is still fine to use here.
fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn is_book(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| BOOK_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
}

/// Remember any book paths among `args`. Returns true if at least one was accepted.
fn register(opens: &Opens, args: impl Iterator<Item = String>) -> bool {
    let mut any = false;
    for arg in args {
        let path = PathBuf::from(&arg);
        if !is_book(&path) {
            continue;
        }
        // Canonical form: absolute, links resolved, so the allow-list cannot be sidestepped with `..`.
        let Ok(canonical) = path.canonicalize() else { continue };
        lock(&opens.allowed).insert(canonical.clone());
        lock(&opens.pending).push(canonical.to_string_lossy().into_owned());
        any = true;
    }
    any
}

/// Paths waiting to be opened. Returns them once and clears the queue.
#[tauri::command]
fn take_pending_opens(state: tauri::State<'_, Opens>) -> Vec<String> {
    std::mem::take(&mut *lock(&state.pending))
}

/// Bytes of a file the OS asked us to open. Refuses any path it did not hand us.
#[tauri::command]
fn read_opened_file(path: String, state: tauri::State<'_, Opens>) -> Result<tauri::ipc::Response, String> {
    let path = PathBuf::from(path);
    if !lock(&state.allowed).contains(&path) {
        return Err("That file was not opened by the user.".into());
    }
    let size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
    if size > MAX_BOOK_BYTES {
        return Err("That file is too large to open.".into());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().manage(Opens::default());

    // Desktop-only plugins. The single-instance plugin must be registered first.
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // A second launch (e.g. double-clicking another book) lands here, in the first instance.
            if register(&app.state::<Opens>(), args.into_iter().skip(1)) {
                let _ = app.emit("open-files", ());
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![take_pending_opens, read_opened_file])
        .setup(|app| {
            // Books passed on the command line of the very first launch.
            register(&app.state::<Opens>(), std::env::args().skip(1));
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("folio-test-{name}-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn accepts_existing_book_files_case_insensitively() {
        let dir = temp_dir("accept");
        let book = dir.join("Dracula.EPUB");
        fs::write(&book, b"x").unwrap();
        assert!(is_book(&book));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn rejects_other_files_directories_and_missing_paths() {
        let dir = temp_dir("reject");
        let exe = dir.join("run.exe");
        fs::write(&exe, b"x").unwrap();
        assert!(!is_book(&exe));
        assert!(!is_book(&dir));
        assert!(!is_book(&dir.join("missing.epub")));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn registers_only_books_and_queues_them_once() {
        let dir = temp_dir("register");
        let book = dir.join("a.epub");
        let other = dir.join("notes.txt");
        fs::write(&book, b"x").unwrap();
        fs::write(&other, b"x").unwrap();

        let opens = Opens::default();
        let args = vec![
            "C:\\Folio\\folio.exe".to_string(),
            book.to_string_lossy().into_owned(),
            other.to_string_lossy().into_owned(),
        ];
        // The first argument is the program name in real launches; skip it like the real call sites do.
        assert!(register(&opens, args.into_iter().skip(1)));
        assert_eq!(lock(&opens.pending).len(), 1);
        assert_eq!(lock(&opens.allowed).len(), 1);
        assert!(!register(&opens, std::iter::once("nonexistent.epub".to_string())));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn allow_list_holds_canonical_paths_so_dotdot_cannot_escape() {
        let dir = temp_dir("canon");
        fs::create_dir_all(dir.join("sub")).unwrap();
        let book = dir.join("b.epub");
        fs::write(&book, b"x").unwrap();
        let sneaky = dir.join("sub").join("..").join("b.epub");

        let opens = Opens::default();
        assert!(register(&opens, std::iter::once(sneaky.to_string_lossy().into_owned())));
        let allowed = lock(&opens.allowed);
        assert!(allowed.contains(&book.canonicalize().unwrap()));
        assert!(!allowed.contains(&sneaky));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn take_pending_clears_the_queue() {
        let opens = Opens::default();
        lock(&opens.pending).push("a".into());
        let taken = std::mem::take(&mut *lock(&opens.pending));
        assert_eq!(taken, vec!["a".to_string()]);
        assert!(lock(&opens.pending).is_empty());
    }
}
