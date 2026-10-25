// The fonts installed on this device, as chrome.fontSettings lists them.

function isFontName(value: unknown): value is chrome.fontSettings.FontName {
  return typeof value === 'object' && value !== null &&
    'fontId' in value && typeof value.fontId === 'string' &&
    'displayName' in value && typeof value.displayName === 'string';
}

// The fonts a getFontList call reported; entries of another shape are left out.
function readFontList(fonts: unknown): chrome.fontSettings.FontName[] {
  return Array.isArray(fonts) ? fonts.filter(isFontName) : [];
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function';
}

// Installed fonts are only listable from an extension page with the
// fontSettings permission, which Firefox does not offer. Chrome does not
// let fontSettings be optional, so it is granted at install (it carries no
// install warning). Without the API the list is empty.
function listInstalledFonts(): Promise<chrome.fontSettings.FontName[]> {
  // Absent where the browser has no fontSettings API.
  const fontSettings = 'fontSettings' in chrome ? chrome.fontSettings : undefined;
  if (!fontSettings || typeof fontSettings.getFontList !== 'function') {
    return Promise.resolve([]);
  }
  try {
    const result: unknown = fontSettings.getFontList();
    // Chrome 96+ returns a promise. Older builds still take a callback.
    if (isPromiseLike(result)) {
      return Promise.resolve(result).then(readFontList, () => []);
    }
  } catch {
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    try {
      fontSettings.getFontList((fonts) => {
        // Reading lastError keeps Chrome from logging an unchecked error.
        void chrome.runtime.lastError;
        resolve(readFontList(fonts));
      });
    } catch {
      resolve([]);
    }
  });
}

export { listInstalledFonts };
