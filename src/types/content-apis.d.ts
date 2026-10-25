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

// What a call on the web clip picker did.
export interface DocumentPipPickerReply {
  ok: boolean;
  state: 'started' | 'already-active' | 'unsupported' | 'blocked-by-video-pip' | 'closed' | 'cancelled';
  // Why the page cannot open a floating window, when it is unsupported.
  reason?: string;
}

// The web clip picker, which the worker's injected function calls.
export interface DocumentPipPickerApi {
  // Starts picking, or cancels it, or closes the open clip.
  toggle(): DocumentPipPickerReply;
  // Closes the open clip; false when there was none.
  restore(): boolean;
  // Ends any picking and says a video picture-in-picture is in the way.
  notifyVideoPiPConflict(): DocumentPipPickerReply;
}
