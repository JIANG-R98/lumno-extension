import * as AppearanceSettings from '../domain/settings/appearance';
import * as PageCacheSettings from '../domain/settings/page-cache';

(function() {
  // Paints the last theme the extension pages saw before the popup's first
  // render, so a light or dark choice that differs from the OS does not flash.
  // The popup reads the stored mode afterwards and updates this copy.
  let mode = 'system';
  try {
    mode = AppearanceSettings.themeMode.parse(
      globalThis.localStorage.getItem(PageCacheSettings.optionsThemePreload.key)
    );
  } catch (error) {
    mode = 'system';
  }
  if (mode === 'dark' || mode === 'light') {
    document.body.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  }
})();
