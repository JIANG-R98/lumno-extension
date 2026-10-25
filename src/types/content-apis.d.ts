// What content scripts leave on the page's window for the worker's
// injected functions (and each other) to find.

// Sites where automatic picture-in-picture stays off.
export interface AutoPipBlacklist {
  hostRules: RegExp[];
}

export interface PageShortcutToastOptions {
  error?: boolean;
  duration?: number;
  // 'light', 'dark', or anything else for the system setting.
  themeMode?: string;
}

// The toast that tells the page what "Add to Lumno New Tab" did.
export interface PageShortcutToastApi {
  // False when there was nothing to say or no place to show it.
  show(message: string, options?: PageShortcutToastOptions | null): boolean;
}
