import * as LumnoSettings from '../domain/settings';

(function() {
  // Paints the last theme the extension pages saw before the popup's first
  // render, so a light or dark choice that differs from the OS does not flash.
  // The popup reads the stored mode afterwards and updates this copy.
  const settings = LumnoSettings;
  let mode = 'system';
  try {
    mode = settings.normalizeThemeMode(
      globalThis.localStorage.getItem(settings.OPTIONS_THEME_PRELOAD_STORAGE_KEY)
    );
  } catch (error) {
    mode = 'system';
  }
  if (mode === 'dark' || mode === 'light') {
    document.body.setAttribute('data-theme', mode);
    document.documentElement.style.colorScheme = mode;
  }
})();
