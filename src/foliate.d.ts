// foliate-js ships plain ES modules without types.
declare module "*/foliate-js/view.js" {
  /** Parses a File (or URL) into foliate's book interface. Throws for unsupported formats. */
  export const makeBook: (file: File | string) => Promise<{
    metadata?: { title?: unknown; author?: unknown };
    toc?: unknown;
    getCover?: () => Promise<Blob | null | undefined>;
  }>;
}

declare module "*/foliate-js/overlayer.js" {
  type Draw = (rects: unknown, options?: Record<string, unknown>) => SVGElement;
  export const Overlayer: {
    highlight: Draw;
    underline: Draw;
    squiggly: Draw;
    outline: Draw;
  };
}

declare module "*/foliate-js/epubcfi.js" {
  /** Negative, zero or positive, like Array.sort comparators. */
  export const compare: (a: string, b: string) => number;
  /** Collapse a range CFI to its start (or end when toEnd is true). */
  export const collapse: (cfi: string, toEnd?: boolean) => string;
  export const isCFI: RegExp;
}
