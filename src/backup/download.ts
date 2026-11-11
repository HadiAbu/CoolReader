/** Save text as a file through the browser/webview download mechanism. */
export const downloadText = (filename: string, text: string, type = "application/json"): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Revoke later so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};
