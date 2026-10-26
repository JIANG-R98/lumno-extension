// Copies pages keep in their own localStorage or sessionStorage, read
// before extension storage answers or kept for one tab.
import { defineSetting } from './define';
import { custom, opaque } from './schema';

// The keys the New Tab read at its last start, so the next one can start
// the same read before its scripts finish loading.
const newtabStartupStorageKeys = defineSetting({
  key: '_x_extension_newtab_startup_storage_keys_2026_unique_',
  area: 'page',
  schema: opaque()
});

// Whether the search box takes focus, as the focus entry reads it before
// storage answers ('true' or 'false').
const newtabInputAutoFocusCache = defineSetting({
  key: '_x_extension_newtab_input_auto_focus_cache_2026_unique_',
  area: 'page',
  schema: opaque()
});

// The locale whose messages the next New Tab fetches early.
const newtabLocaleCache = defineSetting({
  key: '_x_extension_newtab_locale_cache_2026_unique_',
  area: 'page',
  schema: opaque()
});

// The Options and popup theme from their last load, applied before their
// scripts load.
const optionsThemePreload = defineSetting({
  key: '_x_extension_options_theme_preload_2026_unique_',
  area: 'page',
  schema: opaque()
});

// Whether the popup's settings were expanded.
const popupSettingsExpanded = defineSetting({
  key: 'lumno-popup-settings-expanded',
  area: 'page',
  schema: custom((value) => value === true || value === 'true')
});

// The search state a New Tab hands to the tab it reopens as, so focus and
// the typed query survive. Firefox keeps it in localStorage: its new tab
// page starts a new session.
const newtabFocusResume = defineSetting({
  key: 'lumno:newtab-focus-resume',
  area: 'tab',
  schema: opaque()
});

// When a YouTube tab last reloaded to recover picture-in-picture, so it
// reloads at most once.
const youtubePipRecoveryReloadAt = defineSetting({
  key: '_x_lumno_yt_pip_recovery_reload_at_2026_',
  area: 'tab',
  schema: opaque()
});

export {
  newtabFocusResume,
  newtabInputAutoFocusCache,
  newtabLocaleCache,
  newtabStartupStorageKeys,
  optionsThemePreload,
  popupSettingsExpanded,
  youtubePipRecoveryReloadAt
};
