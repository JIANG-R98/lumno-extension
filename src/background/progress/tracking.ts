// The progress tracker's parts: what it works with, where each tab came
// from (trails.ts), the pages waiting out their dwell time, hints read from tracked
// cards' pages, and the queue that moves one card at a time.
import { TabTrails } from './trails';
import type { CardHints, DwellCandidate, TimerHandle } from './types';
import type { SettingsStore } from '../../platform/settings-store';

interface ProgressPorts {
  chromeApi: typeof chrome | null;
  // The settings the pinned sites and the progress history live in.
  settingsStore: SettingsStore;
  isEnabled: () => boolean;
  now: () => number;
  setTimer: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer: (timer: TimerHandle) => void;
  dwellMs: number;
  probeTimeoutMs: number;
}

// Runs its tasks one at a time, in order, each after the one before
// settles either way.
class TaskQueue {
  private queue: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }
}

interface ProgressTracking {
  readonly ports: ProgressPorts;
  readonly trails: TabTrails;
  // Tabs whose page is waiting out the dwell time.
  readonly candidates: Map<number, DwellCandidate>;
  // Card history id → hints read from the card's own page while it was open.
  readonly cardHints: Map<string, CardHints>;
  readonly queue: TaskQueue;
}

export type { ProgressPorts, ProgressTracking };
export { TaskQueue };
