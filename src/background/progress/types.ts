// The shapes of the progress tracker.
import type * as LumnoProgressMatch from '../../domain/progress-match';
import type * as LumnoProgressHistory from '../../domain/progress-history';
import type { ProgressConfidence } from '../../domain/progress-match';
import type { SettingsStore } from '../../platform/settings-store';

type ProgressMatchApi = Pick<typeof LumnoProgressMatch,
  'getComparableUrl' | 'getProgressSiteKey' | 'compareProgressPages' | 'shouldAdvance' | 'looksLikeSeriesPage'>;
type ProgressHistoryApi = Pick<typeof LumnoProgressHistory, 'recordVersion' | 'getHistoryId'>;

// A timer from the injected timer functions; only they read it.
type TimerHandle = unknown;

// What a page's media session says is playing.
interface MediaReading {
  title: string;
  series: string;
}

// What a page says about itself (see readProgressPageHints).
interface PageHints {
  nextUrls: string[];
  prevUrls: string[];
  episodeNavigation: boolean;
  seriesName: string;
  episode: number;
  media: MediaReading | null;
}

// Hints read from a tracked card's page, and the page they were read from.
interface CardHints extends PageHints {
  url: string;
}

// A tab whose page is waiting out the dwell time.
interface DwellCandidate {
  url: string;
  timer: TimerHandle | null;
  // The dwell ran out while the tab was in the background.
  waiting: boolean;
  // The page was weighed.
  settled: boolean;
}

// Where a tab is, and the page it was on before.
interface Trail {
  url: string;
  title: string;
  previousUrl: string;
  previousTitle: string;
}

// A pinned card that follows a work, as stored. Fields the tracker does not
// read are kept as they are.
interface TrackedCard extends Record<string, unknown> {
  url: string;
  progressTracking: true;
}

interface AdvanceResult {
  changed: boolean;
  reason: string;
  confidence?: ProgressConfidence;
}

interface ObserveOptions {
  // The page's title or sound changed without a new URL.
  contentChanged?: boolean;
}

interface ProgressTrackerOptions {
  chromeApi?: typeof chrome | null;
  progressMatch: ProgressMatchApi;
  progressHistory: ProgressHistoryApi;
  // The settings the pinned sites and the progress history live in.
  settingsStore: SettingsStore;
  isEnabled?: () => boolean;
  dwellMs?: number;
  probeTimeoutMs?: number;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (timer: TimerHandle) => void;
}

interface ProgressTracker {
  attach(): boolean;
  observe(tab: chrome.tabs.Tab | null | undefined, options?: ObserveOptions): void;
  advance(tab: chrome.tabs.Tab & { id: number; url: string }): Promise<AdvanceResult>;
  probeSeries(url: unknown): Promise<boolean>;
  getPendingCount(): number;
}

interface ProgressContext {
  readonly config: ProgressTrackerOptions;
  readonly chromeApi: typeof chrome | null;
  readonly progressMatch: ProgressMatchApi;
  readonly progressHistory: ProgressHistoryApi;
  readonly settingsStore: SettingsStore;
  readonly isEnabled: () => boolean;
  readonly dwellMs: number;
  readonly probeTimeoutMs: number;
  readonly now: () => number;
  readonly setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  readonly clearTimer: (timer: TimerHandle) => void;
  readonly candidates: Map<number, DwellCandidate>;
  readonly trails: Map<number, Trail>;
  readonly cardHints: Map<string, CardHints>;
  queue: Promise<unknown>;
}

// Finds the tracked card this page continues and moves it forward. The
// version it leaves goes into the history first, so it can be restored.
type TrackedEntry = { item: TrackedCard; index: number };

export type {
  AdvanceResult,
  CardHints,
  DwellCandidate,
  MediaReading,
  ObserveOptions,
  PageHints,
  ProgressContext,
  ProgressHistoryApi,
  ProgressMatchApi,
  ProgressTracker,
  ProgressTrackerOptions,
  TimerHandle,
  TrackedCard,
  TrackedEntry,
  Trail
};
