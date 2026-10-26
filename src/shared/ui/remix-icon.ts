// The Remix Icon glyphs the extension draws, by class name. An icon draws
// through the bundled icon font (assets/remixicon/fonts/remixicon.css),
// which defines one ::before glyph per class; tests check that every name
// here has one.
const REMIX_ICON_NAMES = [
  'ri-add-large-line',
  'ri-add-line',
  'ri-apps-2-add-line',
  'ri-arrow-down-s-line',
  'ri-arrow-go-back-line',
  'ri-arrow-left-s-line',
  'ri-arrow-right-line',
  'ri-arrow-right-s-line',
  'ri-arrow-up-s-line',
  'ri-asterisk',
  'ri-bilibili-fill',
  'ri-book-open-line',
  'ri-bookmark-3-line',
  'ri-bookmark-line',
  'ri-brush-2-line',
  'ri-chat-smile-2-line',
  'ri-check-line',
  'ri-checkbox-circle-line',
  'ri-chrome-line',
  'ri-close-line',
  'ri-cloud-line',
  'ri-command-fill',
  'ri-compass-3-line',
  'ri-contrast-2-line',
  'ri-delete-bin-4-line',
  'ri-delete-bin-6-line',
  'ri-download-2-line',
  'ri-download-line',
  'ri-draggable',
  'ri-dropper-line',
  'ri-edit-line',
  'ri-error-warning-line',
  'ri-external-link-line',
  'ri-eye-line',
  'ri-eye-off-line',
  'ri-feedback-line',
  'ri-file-copy-line',
  'ri-file-excel-2-line',
  'ri-file-line',
  'ri-file-text-line',
  'ri-focus-3-line',
  'ri-forbid-2-fill',
  'ri-github-fill',
  'ri-github-line',
  'ri-global-line',
  'ri-google-fill',
  'ri-history-line',
  'ri-information-line',
  'ri-keyboard-box-line',
  'ri-link',
  'ri-link-m',
  'ri-lock-line',
  'ri-magic-line',
  'ri-message-3-line',
  'ri-moon-clear-fill',
  'ri-more-fill',
  'ri-more-line',
  'ri-palette-line',
  'ri-picture-in-picture-2-line',
  'ri-pushpin-2-fill',
  'ri-pushpin-2-line',
  'ri-pushpin-fill',
  'ri-pushpin-line',
  'ri-puzzle-line',
  'ri-qr-code-line',
  'ri-question-line',
  'ri-radar-fill',
  'ri-radar-line',
  'ri-refresh-line',
  'ri-reset-left-line',
  'ri-scissors-cut-line',
  'ri-screenshot-2-line',
  'ri-search-ai-line',
  'ri-search-line',
  'ri-settings-3-line',
  'ri-settings-line',
  'ri-shield-check-line',
  'ri-shuffle-line',
  'ri-sparkling-2-line',
  'ri-stack-line',
  'ri-star-line',
  'ri-subtract-line',
  'ri-t-shirt-2-line',
  'ri-test-tube-fill',
  'ri-time-line',
  'ri-translate-2',
  'ri-twitter-x-line',
  'ri-unpin-line',
  'ri-upload-line',
  'ri-user-3-line',
  'ri-vip-diamond-line',
  'ri-wechat-fill',
  'ri-wechat-line',
  'ri-window-2-line',
  'ri-window-line'
] as const;

type RemixIconName = typeof REMIX_ICON_NAMES[number];

// The sizes the shared styles define, as ri-size-<n> classes.
const REMIX_ICON_SIZES = [8, 12, 14, 16, 20, 24, 28] as const;

type RemixIconSize = typeof REMIX_ICON_SIZES[number];

// An icon a model asks a view to draw. Without a size, the icon takes the
// size its surroundings set.
interface RemixIconSpec {
  name: RemixIconName;
  size?: RemixIconSize;
  className?: string;
}

function isRemixIconName(value: unknown): value is RemixIconName {
  return REMIX_ICON_NAMES.some((name) => name === value);
}

// A name read from data that is not type-checked; anything else gives
// `fallback`.
function readRemixIconName(value: unknown, fallback: RemixIconName): RemixIconName;
function readRemixIconName(value: unknown, fallback?: null): RemixIconName | null;
function readRemixIconName(value: unknown, fallback: RemixIconName | null = null): RemixIconName | null {
  const name = typeof value === 'string' ? value.trim() : value;
  return isRemixIconName(name) ? name : fallback;
}

// The class list the icon element carries.
function getRemixIconClassName(spec: RemixIconSpec): string {
  return ['ri-icon', spec.size ? `ri-size-${spec.size}` : '', spec.className || '', spec.name].filter(Boolean).join(' ');
}

// The icon as an element, for code that draws outside React.
function createRemixIconElement(documentObj: Document, spec: RemixIconSpec): HTMLElement {
  const icon = documentObj.createElement('i');
  icon.className = getRemixIconClassName(spec);
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

export {
  REMIX_ICON_NAMES,
  REMIX_ICON_SIZES,
  createRemixIconElement,
  getRemixIconClassName,
  isRemixIconName,
  readRemixIconName
};
export type { RemixIconName, RemixIconSize, RemixIconSpec };
