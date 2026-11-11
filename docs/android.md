# Android notes

Status: not started. The app is built desktop-first with phone screens in mind (settings are stored per
device class, touch targets are at least 44px, the library collapses to a top bar with a floating add button).

## Before `pnpm tauri android init`

1. In `src-tauri/Cargo.toml`, restore the library crate types:

   ```toml
   crate-type = ["staticlib", "cdylib", "rlib"]
   ```

   They were reduced to `["rlib"]` because the GNU Windows toolchain on the dev machine cannot link Tauri as a
   DLL (`export ordinal too large`). Android builds cross-compile to `aarch64-linux-android` and are not affected,
   but desktop builds on the GNU toolchain are. Either install the Visual Studio Build Tools and switch to
   `stable-x86_64-pc-windows-msvc`, or keep the crate types behind a build flag.

2. Install the Android SDK + NDK and set `ANDROID_HOME` and `NDK_HOME`.
3. `rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`

## Things to verify on a device

- File import goes through the WebView `<input type="file">`, which returns `File` objects on Android, so no
  path-based APIs are required.
- Pinch-to-zoom text (planned, not built).
- Settings panel should become a bottom sheet on phones.
