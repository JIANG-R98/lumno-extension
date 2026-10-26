// The Options theme: the system / light / dark picker, the resolved theme
// on the page, and the localStorage copy theme-preload.ts paints from on the
// next load. While the mode is "system" the page follows the OS setting.
import type * as Settings from '../domain/settings';
import type { ThemeMode } from '../domain/settings/appearance';
import type { SettingsStore } from '../platform/settings-store';
import type { GetMessage } from './options-types';
import type { ThemePickerRenderModel } from './react/theme-picker';

// The page's settings, as the section reads and writes the theme.
type ThemeSettingsStore = Pick<SettingsStore, 'include' | 'get' | 'set'>;

interface ThemeSectionOptions {
  documentObj: Document;
  windowObj: Window;
  panel: HTMLElement;
  settingsStore: ThemeSettingsStore;
  settings: Pick<typeof Settings, 'themeMode' | 'optionsThemePreload'>;
  picker: { render(model: ThemePickerRenderModel): void };
  getMessage: GetMessage;
  // Runs whenever the picker shows a mode.
  onModeShown?(mode: ThemeMode): void;
}

const THEME_PREVIEWS = Object.freeze({
  system: '../../assets/images/system.svg',
  light: '../../assets/images/light.svg',
  dark: '../../assets/images/dark.svg'
});
const CLICK_EFFECT_MS = 260;

function createThemeSection(options: ThemeSectionOptions) {
  const { documentObj, windowObj, panel, settingsStore, settings, picker } = options;
  const getMessage = options.getMessage;
  const onModeShown = options.onModeShown || (() => {});
  const mediaQuery = windowObj.matchMedia('(prefers-color-scheme: dark)');
  let currentMode: ThemeMode = 'system';
  let followsSystem = false;

  function resolveTheme(mode: ThemeMode): 'dark' | 'light' {
    if (mode === 'dark' || mode === 'light') {
      return mode;
    }
    return mediaQuery.matches ? 'dark' : 'light';
  }

  function applyResolvedTheme(resolvedTheme: 'dark' | 'light'): void {
    documentObj.body.setAttribute('data-theme', resolvedTheme);
    panel.setAttribute('data-theme', resolvedTheme);
    documentObj.documentElement.style.colorScheme = resolvedTheme;
    const themeColorMeta = documentObj.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', resolvedTheme === 'dark' ? '#111111' : '#f1f5f9');
    }
  }

  function render(): void {
    onModeShown(currentMode);
    picker.render({
      activeMode: currentMode,
      options: [
        {
          mode: 'system',
          labelKey: 'settings_theme_system',
          label: getMessage('settings_theme_system', '跟随系统设置'),
          previewSrc: THEME_PREVIEWS.system
        },
        {
          mode: 'light',
          labelKey: 'settings_theme_light',
          label: getMessage('settings_theme_light', '浅色'),
          previewSrc: THEME_PREVIEWS.light
        },
        {
          mode: 'dark',
          labelKey: 'settings_theme_dark',
          label: getMessage('settings_theme_dark', '深色'),
          previewSrc: THEME_PREVIEWS.dark
        }
      ]
    });
  }

  function onSystemThemeChange(): void {
    if (currentMode === 'system') {
      applyResolvedTheme(resolveTheme('system'));
    }
  }

  function followSystemTheme(follow: boolean): void {
    if (follow === followsSystem) {
      return;
    }
    followsSystem = follow;
    if (follow) {
      mediaQuery.addEventListener('change', onSystemThemeChange);
    } else {
      mediaQuery.removeEventListener('change', onSystemThemeChange);
    }
  }

  function cacheMode(mode: ThemeMode): void {
    try {
      windowObj.localStorage.setItem(settings.optionsThemePreload.key, mode);
    } catch (e) {
      // The early theme preloader falls back to the system theme when caching is unavailable.
    }
  }

  // Shows a stored mode: picker, page theme and, for "system", OS changes.
  function show(mode: ThemeMode): void {
    currentMode = mode;
    render();
    applyResolvedTheme(resolveTheme(currentMode));
    followSystemTheme(currentMode === 'system');
  }

  // theme-preload.ts has already painted the cached (or system) theme and
  // marked the page ready before this runs, so there is nothing to fall
  // back to while the stored preference loads.
  function init(): Promise<void> {
    return settingsStore.include(settings.themeMode).then(() => {
      const storedMode = settingsStore.get(settings.themeMode);
      cacheMode(storedMode);
      show(storedMode);
      documentObj.documentElement.setAttribute('data-theme-ready', 'true');
    });
  }

  function setMode(mode: unknown): void {
    const nextMode = settings.themeMode.parse(mode);
    cacheMode(nextMode);
    settingsStore.set(settings.themeMode, nextMode).then(() => show(nextMode), () => {});
  }

  function applyStorageChange(value: unknown): void {
    show(settings.themeMode.parse(value));
  }

  return Object.freeze({ applyStorageChange, init, render, setMode });
}

// The short press animation on a theme option.
function playThemeOptionClickEffect(button: Element | null, windowObj: Window): void {
  if (!button) {
    return;
  }
  button.classList.remove('x-theme-clicking');
  // Reading the layout restarts the animation when the class returns.
  void button.getBoundingClientRect();
  button.classList.add('x-theme-clicking');
  windowObj.setTimeout(() => {
    button.classList.remove('x-theme-clicking');
  }, CLICK_EFFECT_MS);
}

export { createThemeSection, playThemeOptionClickEffect };
export type { ThemeSectionOptions, ThemeSettingsStore };
