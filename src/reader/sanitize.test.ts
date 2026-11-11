import { describe, expect, it } from "vitest";
import { installBookSafety, isDangerousUrl, isMarkupType, sanitizeMarkup } from "./sanitize";

const XHTML = (body: string, head = "") =>
  `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title>${head}</head><body>${body}</body></html>`;
const parse = (s: string, t = "application/xhtml+xml") => new DOMParser().parseFromString(s, t as DOMParserSupportedType);

describe("isDangerousUrl", () => {
  it("catches executable schemes including whitespace and case tricks", () => {
    for (const u of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "  javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)", "vbscript:x", "data:text/html,<script>1</script>", "\u0001javascript:1"]) {
      expect(isDangerousUrl(u), JSON.stringify(u)).toBe(true);
    }
  });
  it("leaves ordinary URLs alone", () => {
    for (const u of ["chapter2.xhtml#p3", "https://example.com", "mailto:a@b.c", "blob:http://x/1", "data:image/png;base64,AAAA", "#top", ""]) {
      expect(isDangerousUrl(u), u).toBe(false);
    }
  });
});

describe("isMarkupType", () => {
  it("recognises the documents that can carry script", () => {
    expect(isMarkupType("application/xhtml+xml")).toBe(true);
    expect(isMarkupType("text/html; charset=utf-8")).toBe(true);
    expect(isMarkupType("image/svg+xml")).toBe(true);
    expect(isMarkupType("text/css")).toBe(false);
    expect(isMarkupType("image/png")).toBe(false);
    expect(isMarkupType(undefined)).toBe(false);
  });
});

describe("sanitizeMarkup (XHTML)", () => {
  it("removes script elements and event handlers but keeps the text", () => {
    const out = sanitizeMarkup(XHTML('<p onclick="x()">Hello</p><script>window.parent.document.title="pwned"</script><img src="a.png" onerror="x()"/>'), "application/xhtml+xml");
    expect(out).not.toMatch(/script/i);
    expect(out).not.toMatch(/onclick|onerror/i);
    expect(out).toContain("Hello");
    expect(out).toContain('src="a.png"');
  });

  it("removes javascript: and data:text/html links but keeps normal links", () => {
    const out = sanitizeMarkup(XHTML('<a href="javascript:alert(1)">a</a><a href="chapter2.xhtml#x">b</a><a href="java&#9;script:alert(1)">c</a><a href="data:text/html,&lt;script&gt;1&lt;/script&gt;">d</a>'), "application/xhtml+xml");
    const doc = parse(out);
    const hrefs = Array.from(doc.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([null, "chapter2.xhtml#x", null, null]);
  });

  it("removes embedding and redirecting elements", () => {
    const out = sanitizeMarkup(XHTML('<iframe src="x"></iframe><object data="x"></object><embed src="x"/><p>ok</p>', '<base href="https://evil.example/"/><meta http-equiv="refresh" content="0;url=https://evil.example"/><meta name="viewport" content="width=1"/>'), "application/xhtml+xml");
    expect(out).not.toMatch(/iframe|object|embed|<base|refresh/i);
    expect(out).toContain('name="viewport"');
    expect(out).toContain("ok");
  });

  it("removes srcdoc and keeps the XHTML namespace", () => {
    const out = sanitizeMarkup(XHTML('<div srcdoc="&lt;script&gt;1&lt;/script&gt;">x</div>'), "application/xhtml+xml");
    expect(out).not.toMatch(/srcdoc/i);
    expect(out).toContain('xmlns="http://www.w3.org/1999/xhtml"');
  });

  it("leaves ordinary book markup intact (styles, images, internal links, inline CSS)", () => {
    const body = '<h1 id="t">Title</h1><p style="color:red">Text <em>em</em></p><img src="blob:http://x/1" alt="a"/><a href="#t">top</a>';
    const out = sanitizeMarkup(XHTML(body, "<style>p{margin:0}</style>"), "application/xhtml+xml");
    const doc = parse(out);
    expect(doc.querySelector("h1")?.textContent).toBe("Title");
    expect(doc.querySelector("p")?.getAttribute("style")).toBe("color:red");
    expect(doc.querySelector("img")?.getAttribute("src")).toBe("blob:http://x/1");
    expect(doc.querySelector("a")?.getAttribute("href")).toBe("#t");
    expect(doc.querySelector("style")?.textContent).toBe("p{margin:0}");
  });

  it("fails closed on markup that is not well-formed XML", () => {
    const out = sanitizeMarkup('<html xmlns="http://www.w3.org/1999/xhtml"><body><p>unclosed<script>1</body>', "application/xhtml+xml");
    expect(out).not.toMatch(/<script/i);
    expect(out).toContain("could not be displayed safely");
  });
});

describe("sanitizeMarkup (HTML and SVG)", () => {
  it("cleans tolerant HTML", () => {
    const out = sanitizeMarkup('<p onmouseover="x()">hi</p><SCRIPT>1</SCRIPT><a href=" javascript:1">l</a>', "text/html");
    expect(out.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(out).not.toMatch(/script|onmouseover|javascript/i);
    expect(out).toContain("hi");
  });

  it("cleans SVG including animated href tricks and foreignObject scripts", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="x()"><a xlink:href="javascript:alert(1)"><text>t</text></a><set attributeName="href" to="javascript:alert(1)"/><script>1</script><circle r="1"/></svg>';
    const out = sanitizeMarkup(svg, "image/svg+xml");
    expect(out).not.toMatch(/script|onload|javascript|<set/i);
    expect(out).toContain("<circle");
  });

  it("does not touch non-markup types", () => {
    expect(sanitizeMarkup("body{background:url(javascript:1)}", "text/css")).toBe("body{background:url(javascript:1)}");
  });
});

describe("installBookSafety", () => {
  const fire = (target: EventTarget, name: string, detail: Record<string, unknown>) => {
    const ev = new CustomEvent(name, { detail });
    target.dispatchEvent(ev);
    return ev.detail as Record<string, unknown>;
  };

  it("refuses script items but allows everything else", () => {
    const t = new EventTarget();
    installBookSafety(t);
    expect(fire(t, "load", { type: "text/javascript", isScript: true, allow: true }).allow).toBe(false);
    expect(fire(t, "load", { type: "application/xhtml+xml", isScript: false, allow: true }).allow).toBe(true);
  });

  it("sanitises markup passing through the data event (string and Blob), leaving other types alone", async () => {
    const t = new EventTarget();
    installBookSafety(t);
    const a = fire(t, "data", { data: XHTML("<p>x</p><script>1</script>"), type: "application/xhtml+xml" });
    expect(await a.data).not.toMatch(/script/i);
    const b = fire(t, "data", { data: new Blob([XHTML('<p onclick="x()">y</p>')]), type: "application/xhtml+xml" });
    expect(await b.data).not.toMatch(/onclick/i);
    const css = fire(t, "data", { data: "p{color:red}", type: "text/css" });
    expect(await css.data).toBe("p{color:red}");
    const bin = new Uint8Array([1, 2, 3]);
    const img = fire(t, "data", { data: bin, type: "image/png" });
    expect(await img.data).toBe(bin);
  });

  it("cooperates with a promised type and tolerates a missing target", async () => {
    const t = new EventTarget();
    installBookSafety(t);
    const d = fire(t, "data", { data: Promise.resolve(XHTML("<script>1</script><p>z</p>")), type: Promise.resolve("application/xhtml+xml") });
    expect(await d.data).toContain("z");
    expect(() => installBookSafety(undefined)).not.toThrow();
  });
});
