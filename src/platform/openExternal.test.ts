import { describe, expect, it } from "vitest";
import { isSafeExternalUrl } from "./openExternal";
import { baseName, mimeFor } from "./openWith";

describe("isSafeExternalUrl", () => {
  it("allows web and mail links", () => {
    expect(isSafeExternalUrl("https://example.com/a?b=1")).toBe(true);
    expect(isSafeExternalUrl("http://example.com")).toBe(true);
    expect(isSafeExternalUrl("mailto:someone@example.com")).toBe(true);
  });
  it("refuses everything that could run code or reach local files", () => {
    for (const bad of ["javascript:alert(1)", "file:///C:/Windows/System32/calc.exe", "data:text/html,<script>1</script>", "tauri://localhost", "ms-msdt:/id", "vbscript:x", "ftp://example.com", "blob:http://x/1"]) {
      expect(isSafeExternalUrl(bad), bad).toBe(false);
    }
  });
  it("refuses things that are not URLs", () => {
    expect(isSafeExternalUrl("")).toBe(false);
    expect(isSafeExternalUrl("not a url")).toBe(false);
    expect(isSafeExternalUrl("../relative/path.html")).toBe(false);
  });
});

describe("open-with helpers", () => {
  it("extracts file names from Windows and POSIX paths", () => {
    expect(baseName("C:\\Users\\me\\Books\\Dracula.epub")).toBe("Dracula.epub");
    expect(baseName("\\\\?\\C:\\Books\\x.epub")).toBe("x.epub");
    expect(baseName("/home/me/books/x.epub")).toBe("x.epub");
    expect(baseName("plain.epub")).toBe("plain.epub");
  });
  it("maps extensions to mime types", () => {
    expect(mimeFor("A.EPUB")).toBe("application/epub+zip");
    expect(mimeFor("a.cbz")).toBe("application/vnd.comicbook+zip");
    expect(mimeFor("a.unknown")).toBe("application/octet-stream");
  });
});
