// Defence in depth for scripted book content.
//
// Book sections render in iframes that are same-origin with the app (foliate-js uses
// sandbox="allow-same-origin allow-scripts"). The production CSP blocks script there, but that is
// the only control, so books are also neutralised before they reach the frame:
//   1. script items in the manifest are refused (foliate's `load` event `allow` flag), and
//   2. every markup document is stripped of active content before its blob URL is created
//      (foliate's `data` event, fired for EPUB and MOBI sections).

const MARKUP_TYPES = new Set(["application/xhtml+xml", "text/html", "image/svg+xml"]);
const XML_TYPES = new Set(["application/xhtml+xml", "image/svg+xml"]);

/** Elements that run code, embed other documents or redirect resource resolution. */
const REMOVED_ELEMENTS = ["script", "object", "embed", "applet", "iframe", "frame", "frameset", "base"];
/** Attributes whose value is a URL that may use an executable scheme. */
const URL_ATTRIBUTES = ["href", "src", "xlink:href", "action", "formaction", "data", "poster", "background", "cite", "longdesc"];

export const isMarkupType = (type: string | undefined): boolean => !!type && MARKUP_TYPES.has(type.split(";")[0].trim().toLowerCase());

/** Browsers ignore tabs, newlines and other control characters inside a URL scheme ("java	script:"). */
const IGNORED_IN_SCHEME = new RegExp(
  // control characters and space, no-break space, Unicode spaces and separators, zero-width no-break space
  "[\u0000-\u0020\u00a0\u1680\u2000-\u200b\u2028\u2029\u202f\u205f\u3000\ufeff]",
  "g",
);
const normalizeUrl = (value: string): string => value.replace(IGNORED_IN_SCHEME, "").toLowerCase();

export const isDangerousUrl = (value: string): boolean => {
  const v = normalizeUrl(value);
  return v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("data:text/html") || v.startsWith("data:application/xhtml") || v.startsWith("data:image/svg");
};

const FALLBACK_XHTML =
  '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title></title></head><body><p>This section could not be displayed safely.</p></body></html>';
const FALLBACK_HTML = "<!DOCTYPE html><html><head><title></title></head><body><p>This section could not be displayed safely.</p></body></html>";

const scrub = (root: Element): void => {
  for (const tag of REMOVED_ELEMENTS) for (const el of Array.from(root.querySelectorAll(tag))) el.remove();
  // Meta refresh and CSP-override style redirects.
  for (const el of Array.from(root.querySelectorAll("meta"))) {
    const equiv = (el.getAttribute("http-equiv") ?? "").trim().toLowerCase();
    if (equiv === "refresh" || equiv === "set-cookie" || equiv === "content-security-policy") el.remove();
  }
  // SVG animation that rewrites a link target into a javascript: URL.
  for (const el of Array.from(root.querySelectorAll("set, animate"))) {
    if (/href/i.test(el.getAttribute("attributeName") ?? "")) el.remove();
  }
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "srcdoc") el.removeAttribute(attr.name);
      else if (URL_ATTRIBUTES.includes(name) && isDangerousUrl(attr.value)) el.removeAttribute(attr.name);
    }
  }
};

/** Strip active content from one markup document. Fails closed: unparseable XML becomes a harmless page. */
export const sanitizeMarkup = (text: string, type: string): string => {
  const mime = type.split(";")[0].trim().toLowerCase();
  if (!isMarkupType(mime)) return text;
  const xml = XML_TYPES.has(mime);
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, mime as DOMParserSupportedType);
  } catch {
    return xml ? FALLBACK_XHTML : FALLBACK_HTML;
  }
  if (doc.getElementsByTagName("parsererror").length || !doc.documentElement) return xml ? FALLBACK_XHTML : FALLBACK_HTML;
  scrub(doc.documentElement);
  return xml ? new XMLSerializer().serializeToString(doc) : `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
};

interface DataDetail {
  data: unknown;
  type?: unknown;
  isScript?: boolean;
  allow?: unknown;
}

/**
 * Attach both layers to a book's transform target (foliate `book.transformTarget`).
 * Call right after the book is opened and before the first section loads.
 */
export const installBookSafety = (target: EventTarget | undefined | null): void => {
  if (!target) return;
  target.addEventListener("load", (e) => {
    const detail = (e as CustomEvent<DataDetail>).detail;
    if (detail?.isScript) detail.allow = false;
  });
  target.addEventListener("data", (e) => {
    const detail = (e as CustomEvent<DataDetail>).detail;
    if (!detail) return;
    // `type` may be a promise or a string; resolve it together with the data.
    const original = Promise.resolve(detail.data);
    const typeP = Promise.resolve(detail.type);
    detail.data = Promise.all([original, typeP]).then(async ([data, type]) => {
      if (typeof type !== "string" || !isMarkupType(type)) return data;
      if (typeof data === "string") return sanitizeMarkup(data, type);
      if (typeof Blob !== "undefined" && data instanceof Blob) return sanitizeMarkup(await data.text(), type);
      return data;
    });
  });
};
