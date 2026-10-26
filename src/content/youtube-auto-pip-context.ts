// What the YouTube auto PiP script keeps, and its timings and limits.
import type { AutoPipCore, AutoPipState } from './auto-pip-core';

const RECOVERY_RELOAD_GUARD_MS = 15000;
const ENTER_SUPPRESS_AFTER_EXIT_MS = 1200;
const ENTER_SUPPRESS_AFTER_VISIBLE_MS = 1400;
// After the tab is shown again, keep undoing PiP and mini-player leftovers:
// quickly at first, then more slowly; reload as a last resort.
const VISIBLE_RECOVERY_MAX_ATTEMPTS = 10;
const VISIBLE_RECOVERY_FAST_ATTEMPTS = 3;
const VISIBLE_RECOVERY_FAST_DELAY_MS = 120;
const VISIBLE_RECOVERY_SLOW_DELAY_MS = 320;
const VISIBLE_RECOVERY_UI_DEFER_MS = 160;
const HARD_RECOVERY_ATTEMPT = 8;

interface YouTubePipContext {
  readonly state: AutoPipState & { uiRecoverySuppressUntil: number };
  readonly core: AutoPipCore;
}

export {
  ENTER_SUPPRESS_AFTER_EXIT_MS,
  ENTER_SUPPRESS_AFTER_VISIBLE_MS,
  HARD_RECOVERY_ATTEMPT,
  RECOVERY_RELOAD_GUARD_MS,
  VISIBLE_RECOVERY_FAST_ATTEMPTS,
  VISIBLE_RECOVERY_FAST_DELAY_MS,
  VISIBLE_RECOVERY_MAX_ATTEMPTS,
  VISIBLE_RECOVERY_SLOW_DELAY_MS,
  VISIBLE_RECOVERY_UI_DEFER_MS
};
export type {
  YouTubePipContext
};
