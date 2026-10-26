// The global look: theme, motion and the simple result style.
import { defineSetting } from './define';
import { flag, oneOf } from './schema';

// A stored theme mode; 'system' follows the browser.
type ThemeMode = 'dark' | 'light' | 'system';

// A theme a page holds itself in, or '' to follow the global mode.
type ThemePreference = 'dark' | 'light' | '';

const THEME_MODES: readonly ThemeMode[] = Object.freeze(['dark', 'light', 'system']);

const themeMode = defineSetting({
  key: '_x_extension_theme_mode_2024_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: oneOf(THEME_MODES, 'system')
});

const motionEffectsEnabled = defineSetting({
  key: '_x_extension_motion_effects_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(true)
});

const simpleModeEnabled = defineSetting({
  key: '_x_extension_simple_mode_enabled_2026_unique_',
  area: 'preferences',
  sync: 'browser',
  schema: flag(false)
});

// The write that sets the global theme.
function createGlobalThemeModeStorageUpdate(mode: unknown): Record<string, ThemeMode> {
  return { [themeMode.key]: themeMode.parse(mode) };
}

function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'dark' || value === 'light' ? value : '';
}

export {
  THEME_MODES,
  createGlobalThemeModeStorageUpdate,
  motionEffectsEnabled,
  normalizeThemePreference,
  simpleModeEnabled,
  themeMode
};
export type { ThemeMode, ThemePreference };
