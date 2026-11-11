// Cheap checks that run before a hostile or oversized file reaches the parsers.

/** Largest book accepted. Larger files are refused before they are read into memory. */
export const MAX_BOOK_BYTES = 256 * 1024 * 1024;
/** Upper bound for parsing one book; a file that takes longer is treated as unreadable. */
export const PARSE_TIMEOUT_MS = 60_000;

/**
 * foliate-js picks a parser from the file's contents, not its name, so a PDF renamed ".epub" would
 * reach the bundled PDF engine even though the app does not offer PDF. Refuse it up front.
 */
export const looksLikePdf = (head: Uint8Array): boolean =>
  // "%PDF-" may be preceded by up to 1024 bytes of junk in real PDFs; the app only inspects the first bytes it read.
  head.length >= 5 && indexOfAscii(head, "%PDF-") !== -1;

const indexOfAscii = (bytes: Uint8Array, needle: string): number => {
  outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle.charCodeAt(j)) continue outer;
    return i;
  }
  return -1;
};

export class ParseTimeoutError extends Error {
  constructor() {
    super("Reading this file took too long, so it was skipped.");
    this.name = "ParseTimeoutError";
  }
}

/** Reject if `promise` does not settle in time. (The underlying work cannot be cancelled; the import just stops waiting.) */
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ParseTimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
