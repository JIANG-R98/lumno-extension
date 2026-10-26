// The search input's stylesheets, in the page or in the shadow root it
// draws in, and the surface's own looks for its parts.
function getRuntimeUrl(path: string): string {
  if (typeof chrome === 'undefined' || !chrome.runtime || typeof chrome.runtime.getURL !== 'function') {
    return '';
  }
  return chrome.runtime.getURL(path) || '';
}

function ensureLink(
  root: Document | ShadowRoot | HTMLElement,
  id: string,
  resourcePath: string
) {
  if (root.querySelector(`#${id}`)) {
    return;
  }
  const href = getRuntimeUrl(resourcePath);
  if (!href) {
    return;
  }
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  root.appendChild(link);
}

function ensureStyles(styleRoot: Document | ShadowRoot | null | undefined) {
  const isolated = Boolean(styleRoot);
  const root =
    styleRoot ||
    document.head ||
    document.documentElement;
  if (!root) {
    return;
  }
  ensureLink(
    root,
    isolated
      ? '_x_extension_open_sans_shadow_css_2026_unique_'
      : '_x_extension_open_sans_css_2024_unique_',
    'assets/fonts/open-sans/open-sans.css'
  );
  ensureLink(
    root,
    isolated
      ? '_x_extension_remixicon_shadow_css_2026_unique_'
      : '_x_extension_remixicon_css_2024_unique_',
    'assets/remixicon/fonts/remixicon.css'
  );
  ensureLink(
    root,
    '_x_extension_input_component_style_2026_unique_',
    'src/shared/search/search-input.css'
  );
}

function applyStyles(
  element: HTMLElement,
  styles: Record<string, string>
) {
  Object.entries(styles).forEach(([property, value]) => {
    element.style.setProperty(property, value);
  });
}

export { applyStyles, ensureStyles };
