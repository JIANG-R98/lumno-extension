// What the overlay services share: the tab shape they read, how an open is
// asked for, and the loading record the retries keep.
import type { OverlayLoadingRecord } from './overlay-loading-lifecycle';

// A tab as the overlay services read it; recovery builds partial ones.
type TargetTab = Partial<chrome.tabs.Tab>;

interface OpenOverlayOptions {
  onComplete?: (ok: boolean) => void;
  // Reopening after the page loaded under the overlay.
  loadingRecovery?: boolean;
  loadingRecord?: TrackedLoadingRecord | null;
  ensureOpen?: boolean;
  skipDuplicateGuard?: boolean;
}

// Opens the overlay on a tab (overlay-open-service.ts).
type OverlayOpener = (tab: TargetTab, tabs: readonly TargetTab[], source: string, options?: OpenOverlayOptions) => void;

// A loading record with the retry and stability bookkeeping this service
// adds to it.
interface TrackedLoadingRecord extends OverlayLoadingRecord {
  // Counts settled loads; a stability check only acts on its own count.
  stableCompletionToken?: number;
  stableCompletionStartedAt?: number;
  stableCompletionUrl?: string;
  recoveryAttempts?: number;
  preCompleteRetryUrl?: string;
  preCompleteRecoveryAttempts?: number;
  // The overlay was asked for while the tab was still leaving a page it
  // cannot open on.
  pendingNavigationDeferred?: boolean;
  pendingNavigationUrl?: string;
}

export type { OpenOverlayOptions, OverlayOpener, TargetTab, TrackedLoadingRecord };
