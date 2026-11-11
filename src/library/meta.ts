/** foliate-js metadata fields can be strings, language maps ({en: "..."}) or contributor objects. */
export const lang = (v: unknown): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(lang).filter(Boolean).join(", ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("name" in o) return lang(o.name);
    return lang(Object.values(o)[0]);
  }
  return "";
};
