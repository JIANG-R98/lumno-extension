// Values scripts hand each other on globalThis.

declare global {
  // The traditional-to-simplified Han table as pairs of characters, set by
  // src/shared/search/search-han-variants.js once a page or the worker loads it.
  var LumnoSearchHanVariants: string | undefined;
  // Whether motion effects are on, as first read by src/shared/motion-preload.ts.
  var LumnoMotionPreferenceReady: Promise<boolean> | undefined;
}

export {};
