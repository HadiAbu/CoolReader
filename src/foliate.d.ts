// foliate-js ships plain ES modules without types.
declare module "*/foliate-js/view.js" {
  /** Parses a File (or URL) into foliate's book interface. Throws for unsupported formats. */
  export const makeBook: (file: File | string) => Promise<{
    metadata?: { title?: unknown; author?: unknown };
    toc?: unknown;
    getCover?: () => Promise<Blob | null | undefined>;
  }>;
}
