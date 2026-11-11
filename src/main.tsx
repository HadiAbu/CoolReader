import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installAppFonts } from "./themes/fonts";

installAppFonts();

// Ask the browser/webview not to evict the library under storage pressure (the Tauri webview already persists).
void Promise.resolve(navigator.storage?.persist?.()).catch(() => {});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
