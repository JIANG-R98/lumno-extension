// The link icon a favicon <img> gives way to while its icon loads or when
// none loads. Each view draws it beside the image, hidden until then; the
// favicon runtime finds it there, sizes it to the image and shows or hides it.
import type { CSSProperties } from 'react';
import { RemixIcon } from './remix-icon';

// How the New Tab icon sits on its surface: a tag-colored tile, the bookmark
// card's icon color, or bare beside a suggestion.
export type FaviconFallbackTone = 'tag' | 'bookmark' | 'suggestion';

const TONE_STYLES: Record<FaviconFallbackTone, CSSProperties> = {
  tag: {
    '--x-nt-favicon-fallback-radius': '6px',
    '--x-nt-favicon-fallback-bg': 'var(--x-nt-tag-bg, #F3F4F6)',
    '--x-nt-favicon-fallback-color': 'var(--x-nt-tag-text, #6B7280)',
    '--x-nt-favicon-fallback-padding': '3px'
  },
  bookmark: {
    '--x-nt-favicon-fallback-radius': '6px',
    '--x-nt-favicon-fallback-bg': 'var(--x-nt-bookmark-icon-color, var(--x-nt-bookmark-icon-bg, rgba(241, 245, 249, 0.92)))',
    '--x-nt-favicon-fallback-color': 'var(--x-nt-tag-text, #6B7280)',
    '--x-nt-favicon-fallback-padding': '3px'
  },
  suggestion: {
    '--x-nt-favicon-fallback-radius': '2px',
    '--x-nt-favicon-fallback-bg': 'transparent',
    '--x-nt-favicon-fallback-color': 'var(--x-nt-subtext, #6B7280)',
    '--x-nt-favicon-fallback-padding': '0px'
  }
};

export function FaviconFallback({
  iconName = 'ri-link',
  tone = 'tag',
  visible = false
}: {
  iconName?: string;
  tone?: FaviconFallbackTone;
  visible?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className="x-nt-favicon-fallback _x_extension_favicon_fallback_2024_unique_"
      data-visible={visible ? 'true' : 'false'}
      style={TONE_STYLES[tone]}
    >
      <RemixIcon className={`ri-size-16 ${iconName}`} />
    </span>
  );
}

// A folder card's preview favicon, drawn in the image's place in the stack.
export function FolderPreviewFaviconFallback() {
  return (
    <span
      aria-hidden="true"
      className="x-nt-folder-preview-favicon x-nt-folder-preview-favicon--fallback _x_extension_favicon_fallback_2024_unique_"
      data-visible="false"
    >
      <RemixIcon className="ri-size-12 ri-link" />
    </span>
  );
}

export function OverlayFaviconFallback() {
  return (
    <span
      aria-hidden="true"
      className="x-ov-suggestion-inline-icon x-ov-suggestion-favicon-fallback _x_extension_overlay_favicon_fallback_2026_unique_"
      data-visible="false"
    >
      <RemixIcon className="ri-size-16 ri-link" />
    </span>
  );
}
