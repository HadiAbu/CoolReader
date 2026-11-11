import { afterEach, describe, expect, it, vi } from "vitest";
import { looksLikePdf, MAX_BOOK_BYTES, ParseTimeoutError, withTimeout } from "./importGuards";

const bytes = (s: string) => new TextEncoder().encode(s);

describe("looksLikePdf", () => {
  it("detects a PDF header, including leading junk", () => {
    expect(looksLikePdf(bytes("%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(bytes("\u0000\u0000junk%PDF-1.4"))).toBe(true);
  });
  it("does not flag books or tiny inputs", () => {
    expect(looksLikePdf(bytes("PK\u0003\u0004 epub zip"))).toBe(false);
    expect(looksLikePdf(bytes("BOOKMOBI"))).toBe(false);
    expect(looksLikePdf(bytes("<?xml version=\"1.0\"?><FictionBook>"))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
    expect(looksLikePdf(bytes("%PDF"))).toBe(false);
  });
});

describe("limits", () => {
  it("caps books at a sane size", () => {
    expect(MAX_BOOK_BYTES).toBe(256 * 1024 * 1024);
  });
});

describe("withTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("passes through a result that arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
  it("passes through a rejection from the work itself", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000)).rejects.toThrow("boom");
  });
  it("rejects with a clear error when the work is too slow", async () => {
    vi.useFakeTimers();
    const never = new Promise<number>(() => {});
    const p = withTimeout(never, 500);
    const assertion = expect(p).rejects.toBeInstanceOf(ParseTimeoutError);
    await vi.advanceTimersByTimeAsync(501);
    await assertion;
  });
});
