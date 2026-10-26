// The features the worker and content scripts run, and the state each keeps:
// picture-in-picture, the tab switcher, pinned tab recovery, link preview,
// the selection toolbar, and the update and engagement notices.
import { defineSetting, defineSettingFamily } from './define';
import type { PipKind, PipOwner } from '../messages';
import { custom, flag, isOneOf, isRecord, opaque } from './schema';

type SelectionQuickActionsProvider =
  | 'gpt' | 'gm' | 'dbai' | 'qw' | 'yb' | 'mx' | 'ds' | 'kimi' | 'cp' | 'grok' | 'qwen' | 'ais';

const SELECTION_QUICK_ACTIONS_PROVIDER_KEYS: readonly SelectionQuickActionsProvider[] = Object.freeze([
  'gpt',
  'gm',
  'dbai',
  'qw',
  'yb',
  'mx',
  'ds',
  'kimi',
  'cp',
  'grok',
  'qwen',
  'ais'
]);

const autoPipEnabled = defineSetting({
  key: '_x_extension_auto_pip_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(true)
});

const documentPipEnabled = defineSetting({
  key: '_x_extension_document_pip_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

function normalizePipOwnerRecord(value: unknown): PipOwner | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind: PipKind | '' = value.kind === 'document' ? 'document' : (value.kind === 'video' ? 'video' : '');
  const tabId = Number(value.tabId);
  if (!kind || !Number.isInteger(tabId) || tabId < 0) {
    return null;
  }
  const frameId = Number.isInteger(Number(value.frameId)) ? Number(value.frameId) : 0;
  const token = typeof value.token === 'string' && value.token
    ? value.token
    : '';
  if (!token) {
    return null;
  }
  return {
    kind: kind,
    tabId: tabId,
    frameId: frameId,
    token: token,
    url: typeof value.url === 'string' ? value.url : '',
    updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now()
  };
}

// Which frame holds the picture-in-picture window this browser session.
const globalPipOwner = defineSetting({
  key: '_x_lumno_global_pip_owner_2026_',
  area: 'session',
  schema: custom(normalizePipOwnerRecord)
});

const tabSwitcherEnabled = defineSetting({
  key: '_x_extension_tab_switcher_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(true)
});

const tabSwitcherCurrentWindowOnly = defineSetting({
  key: '_x_extension_tab_switcher_current_window_only_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

// The switcher's tab thumbnails, and how often each tab was switched to.
const tabSwitcherThumbnails = defineSetting({
  key: '_x_extension_tab_switcher_state_2026_unique_',
  area: 'session',
  schema: opaque()
});

// One thumbnail per tab, so a switch rewrites only the thumbnails that
// changed; tabSwitcherThumbnails lists which tabs have one.
const tabSwitcherThumbnail = defineSettingFamily({
  prefix: '_x_extension_tab_switcher_thumbnail_2026_unique_:',
  area: 'session',
  schema: opaque()
});

// The worker's record of each tab's top frame navigation and of the search
// overlay loading in it, so a restarted worker can finish what it started.
const overlayNavigationState = defineSettingFamily({
  prefix: '_x_extension_overlay_navigation_state_2026_unique_:',
  area: 'session',
  schema: opaque()
});

const overlayLoadingRecord = defineSettingFamily({
  prefix: '_x_extension_overlay_loading_record_2026_unique_:',
  area: 'session',
  schema: opaque()
});

const tabSwitchStats = defineSetting({
  key: '_x_extension_tab_switch_stats_2026_unique_',
  area: 'session',
  schema: opaque()
});

const pinnedTabRecoveryEnabled = defineSetting({
  key: '_x_extension_pinned_tab_recovery_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

// The pinned tabs to bring back after the browser restarts.
const pinnedTabSnapshot = defineSetting({
  key: '_x_extension_pinned_tab_snapshot_2026_unique_',
  area: 'device',
  schema: opaque()
});

const linkPreviewEnabled = defineSetting({
  key: '_x_extension_link_preview_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(true)
});

// Open link previews, so a restarted worker can still answer them.
const linkPreviewSessions = defineSetting({
  key: '_x_extension_link_preview_sessions_2026_unique_',
  area: 'session',
  schema: opaque()
});

const selectionQuickActionsEnabled = defineSetting({
  key: '_x_extension_selection_quick_actions_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

const selectionQuickActionsProvider = defineSetting({
  key: '_x_extension_selection_quick_actions_provider_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: custom((value): SelectionQuickActionsProvider => {
    const key = String(value || '').trim().toLowerCase();
    return isOneOf(SELECTION_QUICK_ACTIONS_PROVIDER_KEYS, key) ? key : 'gpt';
  })
});

const selectionQuickActionsGroupEnabled = defineSetting({
  key: '_x_extension_selection_quick_actions_group_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

// The shortcut the content scripts listen for when the browser's own
// shortcut is unset.
const fallbackShortcut = defineSetting({
  key: '_x_extension_fallback_hotkey_2024_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: opaque()
});

const updateNoticeEnabled = defineSetting({
  key: '_x_extension_update_notice_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(true)
});

// The update the notice announces, and which surfaces have shown it.
const updateNoticeState = defineSetting({
  key: '_x_lumno_update_notice_2026_unique_',
  area: 'preferences',
  schema: opaque()
});

// How many times each release's notice was shown, by version.
const updateNoticeDisplayCount = defineSettingFamily({
  prefix: '_x_lumno_update_notice_display_count_2026_',
  area: 'preferences',
  schema: opaque()
});

// When the release page last opened after an update.
const releasePageOpened = defineSetting({
  key: '_x_lumno_release_page_opened_2026_unique_',
  area: 'preferences',
  schema: opaque()
});

// When the review and community notice showed and how it was answered.
const engagementNoticeState = defineSetting({
  key: '_x_lumno_engagement_notice_state_2026_unique_',
  area: 'device',
  schema: opaque()
});

export {
  SELECTION_QUICK_ACTIONS_PROVIDER_KEYS,
  autoPipEnabled,
  documentPipEnabled,
  engagementNoticeState,
  fallbackShortcut,
  globalPipOwner,
  linkPreviewEnabled,
  linkPreviewSessions,
  overlayLoadingRecord,
  overlayNavigationState,
  pinnedTabRecoveryEnabled,
  pinnedTabSnapshot,
  releasePageOpened,
  selectionQuickActionsEnabled,
  selectionQuickActionsGroupEnabled,
  selectionQuickActionsProvider,
  tabSwitchStats,
  tabSwitcherCurrentWindowOnly,
  tabSwitcherEnabled,
  tabSwitcherThumbnail,
  tabSwitcherThumbnails,
  updateNoticeDisplayCount,
  updateNoticeEnabled,
  updateNoticeState
};
export type { SelectionQuickActionsProvider };
