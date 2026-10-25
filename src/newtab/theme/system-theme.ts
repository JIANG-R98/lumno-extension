// The browser's light or dark preference, and the theme a theme mode
// resolves to under it.
import type { ThemeMode } from '../../domain/settings';

type ResolvedTheme = 'light' | 'dark';
type MediaChangeListener = (event: MediaQueryListEvent) => void;

// A theme the user fixed, or the system's when the mode follows it.
function resolveThemeMode(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === 'dark' || mode === 'light') {
    return mode;
  }
  return systemDark ? 'dark' : 'light';
}

// Older Safari-derived engines only have addListener on a MediaQueryList.
function addMediaQueryChangeListener(queryList: MediaQueryList, listener: MediaChangeListener): boolean {
  if (typeof queryList.addEventListener === 'function') {
    queryList.addEventListener('change', listener);
    return true;
  }
  if (typeof queryList.addListener === 'function') {
    queryList.addListener(listener);
    return true;
  }
  return false;
}

function removeMediaQueryChangeListener(queryList: MediaQueryList, listener: MediaChangeListener): void {
  if (typeof queryList.removeEventListener === 'function') {
    queryList.removeEventListener('change', listener);
    return;
  }
  if (typeof queryList.removeListener === 'function') {
    queryList.removeListener(listener);
  }
}

function createSystemTheme(windowObj: Pick<Window, 'matchMedia'>) {
  const mediaQuery = windowObj.matchMedia('(prefers-color-scheme: dark)');

  // Resolves "system" through the media query unless the caller passes the
  // match it read.
  function resolveTheme(mode: ThemeMode, mediaMatchesOverride?: boolean | null): ResolvedTheme {
    return resolveThemeMode(mode, typeof mediaMatchesOverride === 'boolean' ? mediaMatchesOverride : mediaQuery.matches);
  }

  return {
    mediaQuery,
    resolveTheme,
    addMediaQueryChangeListener,
    removeMediaQueryChangeListener
  };
}

export { addMediaQueryChangeListener, createSystemTheme, removeMediaQueryChangeListener, resolveThemeMode };
export type { ResolvedTheme };
