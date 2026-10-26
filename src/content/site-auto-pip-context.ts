// What the site auto PiP script keeps, and its timings and limits.
import type { AutoPipCore, AutoPipState } from './auto-pip-core';
import type { SitePlayerProfile } from './site-auto-pip-profiles';


const ENTER_SUPPRESS_AFTER_EXIT_MS = 1100;
const ENTER_SUPPRESS_AFTER_VISIBLE_MS = 1300;
const QUICK_REHIDE_BYPASS_MS = 900;
const DEFAULT_HIDDEN_RETRY_LIMIT = 4;
const DEFAULT_HIDDEN_RETRY_DELAY_MS = 220;
const MIN_VISIBLE_WIDTH = 220;
const MIN_VISIBLE_HEIGHT = 124;
const MIN_VISIBLE_AREA = 60000;
const DOUYIN_MODAL_RECOVERY_RELOAD_GUARD_MS = 15000;
// Timeouts for asking the background to run PiP code in the page's world.
const MAIN_WORLD_SETUP_TIMEOUT_MS = 960;
const MAIN_WORLD_ENTER_TIMEOUT_MS = 920;
// After the tab is shown again, retry leaving PiP a few times: quickly at
// first, then more slowly while the site's player settles.
const VISIBLE_RECOVERY_MAX_ATTEMPTS = 5;
const VISIBLE_RECOVERY_FAST_ATTEMPTS = 3;
const VISIBLE_RECOVERY_FAST_DELAY_MS = 120;
const VISIBLE_RECOVERY_SLOW_DELAY_MS = 280;


interface SitePipContext {
  readonly state: AutoPipState & { lastVisibleAt: number; hadUserGesture: boolean; douyinModalReloadAt: number };
  readonly host: string;
  readonly core: AutoPipCore;
  readonly matchedProfile: SitePlayerProfile | null;
  readonly profileSelectors: string[];
  readonly profileRejectSelectors: string[];
  readonly mainWorldEnter: SitePlayerProfile['mainWorldEnter'] | null;
}

export {
  DEFAULT_HIDDEN_RETRY_DELAY_MS,
  DEFAULT_HIDDEN_RETRY_LIMIT,
  DOUYIN_MODAL_RECOVERY_RELOAD_GUARD_MS,
  ENTER_SUPPRESS_AFTER_EXIT_MS,
  ENTER_SUPPRESS_AFTER_VISIBLE_MS,
  MAIN_WORLD_ENTER_TIMEOUT_MS,
  MAIN_WORLD_SETUP_TIMEOUT_MS,
  MIN_VISIBLE_AREA,
  MIN_VISIBLE_HEIGHT,
  MIN_VISIBLE_WIDTH,
  QUICK_REHIDE_BYPASS_MS,
  VISIBLE_RECOVERY_FAST_ATTEMPTS,
  VISIBLE_RECOVERY_FAST_DELAY_MS,
  VISIBLE_RECOVERY_MAX_ATTEMPTS,
  VISIBLE_RECOVERY_SLOW_DELAY_MS
};
export type {
  SitePipContext
};
