import {
  useEffect,
  useState,
  type CSSProperties
} from 'react';
import { RemixIcon as Icon } from '../shared/remix-icon';

type PreviewHoverTarget = 'idle' | 'recent' | 'bookmark';
type Rgb = [number, number, number];

export interface NewtabPreviewItem {
  accentRgb?: readonly number[];
  alt?: boolean;
  iconClass?: string;
  iconSrc?: string;
  previewUrls?: readonly string[];
  siteName?: string;
  title?: string;
  type?: string;
  url?: string;
  urlText?: string;
}

export interface NewtabPreviewModel {
  ariaLabel: string;
  bookmarkManagerLabel: string;
  bookmarks: NewtabPreviewItem[];
  bookmarksSectionTitle: string;
  hoverHoldMs: number;
  hoverMoveMs: number;
  hoverSettleMs: number;
  hoverStartMs: number;
  nextLabelTemplate: string;
  openItemAriaTemplate: string;
  previousLabelTemplate: string;
  query: string;
  recentSectionTitle: string;
  recentSites: NewtabPreviewItem[];
  reducedMotion: boolean;
  searchAriaLabel: string;
  searchPlaceholder: string;
  sectionModeBookmarksLabel: string;
  sectionModeRecentLabel: string;
  settingsLabel: string;
  visitLabel: string;
  wordmarkSrc: string;
}

function formatTemplate(
  template: string,
  values: Record<string, string>
): string {
  return String(template || '').replace(
    /\{([a-zA-Z0-9_]+)\}/g,
    (match, key: string) => (
      Object.prototype.hasOwnProperty.call(values, key)
        ? String(values[key])
        : match
    )
  );
}

function faviconUrl(url: string): string {
  const value = String(url || '').trim();
  return value
    ? `https://t2.gstatic.cn/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE%2CSIZE%2CURL&url=${encodeURIComponent(value)}&size=64`
    : '';
}

function normalizeRgb(value: readonly number[] | undefined): Rgb {
  if (!Array.isArray(value) || value.length !== 3) {
    return [59, 130, 246];
  }
  return [
    Number(value[0]) || 0,
    Number(value[1]) || 0,
    Number(value[2]) || 0
  ];
}

function mixColor(color: Rgb, target: Rgb, amount: number): Rgb {
  return [
    Math.round(color[0] + (target[0] - color[0]) * amount),
    Math.round(color[1] + (target[1] - color[1]) * amount),
    Math.round(color[2] + (target[2] - color[2]) * amount)
  ];
}

function rgb(color: Rgb): string {
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function rgbParts(color: Rgb): string {
  return `${color[0]}, ${color[1]}, ${color[2]}`;
}

function recentCardStyle(item: NewtabPreviewItem): CSSProperties {
  const accent = normalizeRgb(item.accentRgb);
  const emphasized = mixColor(accent, [0, 0, 0], 0.18);
  const base = mixColor(accent, [255, 255, 255], 0.82);
  const border = mixColor(base, [0, 0, 0], 0.1);
  const innerTint = mixColor(accent, [255, 255, 255], 0.82);
  return {
    '--x-nt-recent-accent-border': rgba(accent, 0.18),
    '--x-nt-recent-accent-color': rgb(emphasized),
    '--x-nt-recent-accent-soft': rgba(accent, 0.12),
    '--x-nt-recent-card-border-color': rgb(border),
    '--x-nt-recent-card-color': rgb(base),
    '--x-nt-recent-inner-tint-rgb': rgbParts(innerTint)
  } as CSSProperties;
}

function bookmarkCardStyle(item: NewtabPreviewItem): CSSProperties {
  if (item.type === 'folder') {
    return {
      '--x-nt-bookmark-shadow-rgb': '86, 138, 220'
    } as CSSProperties;
  }
  const accent = normalizeRgb(item.accentRgb);
  const base = mixColor(accent, [255, 255, 255], 0.94);
  const border = mixColor(base, [0, 0, 0], 0.07);
  const icon = mixColor(accent, [255, 255, 255], 0.96);
  const hover = mixColor(accent, [255, 255, 255], 0.9);
  const shadow = mixColor(accent, [138, 146, 160], 0.46);
  return {
    '--x-nt-bookmark-card-border-color': rgb(border),
    '--x-nt-bookmark-card-color': rgb(base),
    '--x-nt-bookmark-card-hover-color': rgba(hover, 0.86),
    '--x-nt-bookmark-icon-color': rgb(icon),
    '--x-nt-bookmark-shadow-rgb': rgbParts(shadow)
  } as CSSProperties;
}

function BrowserBar() {
  return (
    <div className="browser-bar">
      <div className="surface-rail">
        {Array.from({ length: 3 }, (_, index) => (
          <span aria-hidden="true" className="surface-rail-dot" key={index} />
        ))}
      </div>
      <div className="browser-tabs">
        <span aria-hidden="true" className="browser-tab" />
        <span
          aria-hidden="true"
          className="browser-tab browser-tab--muted"
        />
      </div>
      <span aria-hidden="true" className="browser-address" />
      <div className="browser-actions">
        {Array.from({ length: 2 }, (_, index) => (
          <span aria-hidden="true" className="browser-action-dot" key={index} />
        ))}
      </div>
    </div>
  );
}

function FolderGlyph({ idSuffix }: { idSuffix: string }) {
  const suffix = String(idSuffix || 'preview').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const lowerGradientId = `x-nt-preview-folder-lower-${suffix}`;
  const upperGradientId = `x-nt-preview-folder-upper-${suffix}`;
  return (
    <svg
      aria-hidden="true"
      fill="none"
      focusable="false"
      viewBox="0 0 31 29"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g data-folder-layer="lower">
        <path
          d="M7.24 2C6.082 2 5.503 2 5.064 2.232C4.71 2.42 4.42 2.71 4.232 3.064C4 3.503 4 4.082 4 5.24V19.76C4 20.918 4 21.497 4.232 21.936C4.42 22.29 4.71 22.58 5.064 22.768C5.503 23 6.082 23 7.24 23H23.76C24.918 23 25.497 23 25.936 22.768C26.29 22.58 26.58 22.29 26.768 21.936C27 21.497 27 20.918 27 19.76V8.24C27 7.082 27 6.503 26.768 6.064C26.58 5.71 26.29 5.42 25.936 5.232C25.497 5 24.918 5 23.76 5H16.287C15.767 5 15.507 5 15.263 4.938C15.065 4.887 14.875 4.806 14.701 4.698C14.488 4.565 14.308 4.377 13.948 4.002L12.986 2.998C12.626 2.623 12.446 2.435 12.233 2.302C12.059 2.194 11.869 2.113 11.671 2.062C11.427 2 11.167 2 10.647 2H7.24Z"
          fill={`url(#${lowerGradientId})`}
        />
        <path
          d="M7.24 2.5H10.647C11.192 2.5 11.379 2.504 11.547 2.547C11.696 2.585 11.838 2.645 11.969 2.727C12.116 2.818 12.248 2.95 12.625 3.344L13.587 4.348C13.929 4.705 14.158 4.949 14.438 5.123C14.655 5.258 14.892 5.359 15.14 5.422C15.458 5.503 15.792 5.5 16.287 5.5H23.76C24.347 5.5 24.757 5.5 25.075 5.527C25.388 5.554 25.567 5.603 25.702 5.675C25.968 5.815 26.185 6.032 26.325 6.298C26.397 6.433 26.446 6.612 26.473 6.925C26.5 7.243 26.5 7.653 26.5 8.24V19.76C26.5 20.347 26.5 20.757 26.473 21.075C26.446 21.388 26.397 21.567 26.325 21.702C26.185 21.968 25.968 22.185 25.702 22.325C25.567 22.397 25.388 22.446 25.075 22.473C24.757 22.5 24.347 22.5 23.76 22.5H7.24C6.653 22.5 6.243 22.5 5.925 22.473C5.612 22.446 5.433 22.397 5.298 22.325C5.032 22.185 4.815 21.968 4.675 21.702C4.603 21.567 4.554 21.388 4.527 21.075C4.5 20.757 4.5 20.347 4.5 19.76V5.24C4.5 4.653 4.5 4.243 4.527 3.925C4.554 3.612 4.603 3.433 4.675 3.298C4.815 3.032 5.032 2.815 5.298 2.675C5.433 2.603 5.612 2.554 5.925 2.527C6.243 2.5 6.653 2.5 7.24 2.5Z"
          stroke="#5393FF"
        />
      </g>
      <g data-folder-layer="file">
        <path
          d="M7 10C7 9.448 7.448 9 8 9H23C23.552 9 24 9.448 24 10V17C24 17.552 23.552 18 23 18H8C7.448 18 7 17.552 7 17V10Z"
          fill="white"
        />
        <path d="M13 11H18" stroke="#DDE8FB" strokeLinecap="round" />
      </g>
      <g data-folder-layer="upper">
        <path
          d="M7.24 5C6.082 5 5.503 5 5.064 5.232C4.71 5.42 4.42 5.71 4.232 6.064C4 6.503 4 7.082 4 8.24V19.76C4 20.918 4 21.497 4.232 21.936C4.42 22.29 4.71 22.58 5.064 22.768C5.503 23 6.082 23 7.24 23H23.76C24.918 23 25.497 23 25.936 22.768C26.29 22.58 26.58 22.29 26.768 21.936C27 21.497 27 20.918 27 19.76V8.24C27 7.082 27 6.503 26.768 6.064C26.58 5.71 26.29 5.42 25.936 5.232C25.497 5 24.918 5 23.76 5H7.24Z"
          fill={`url(#${upperGradientId})`}
        />
        <path
          d="M7.24 5.5H23.76C24.347 5.5 24.757 5.5 25.075 5.527C25.388 5.554 25.567 5.603 25.702 5.675C25.968 5.815 26.185 6.032 26.325 6.298C26.397 6.433 26.446 6.612 26.473 6.925C26.5 7.243 26.5 7.653 26.5 8.24V19.76C26.5 20.347 26.5 20.757 26.473 21.075C26.446 21.388 26.397 21.567 26.325 21.702C26.185 21.968 25.968 22.185 25.702 22.325C25.567 22.397 25.388 22.446 25.075 22.473C24.757 22.5 24.347 22.5 23.76 22.5H7.24C6.653 22.5 6.243 22.5 5.925 22.473C5.612 22.446 5.433 22.397 5.298 22.325C5.032 22.185 4.815 21.968 4.675 21.702C4.603 21.567 4.554 21.388 4.527 21.075C4.5 20.757 4.5 20.347 4.5 19.76V8.24C4.5 7.653 4.5 7.243 4.527 6.925C4.554 6.612 4.603 6.433 4.675 6.298C4.815 6.032 5.032 5.815 5.298 5.675C5.433 5.603 5.612 5.554 5.925 5.527C6.243 5.5 6.653 5.5 7.24 5.5Z"
          stroke="#5393FF"
        />
      </g>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={lowerGradientId}
          x1="15.5"
          x2="15.5"
          y1="2"
          y2="23"
        >
          <stop stopColor="#93BBFF" />
          <stop offset="0.884515" stopColor="#81B0FF" />
          <stop offset="0.884615" stopColor="#4389FF" />
          <stop offset="1" stopColor="#97BEFF" />
        </linearGradient>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={upperGradientId}
          x1="15.5"
          x2="15.5"
          y1="2"
          y2="23"
        >
          <stop stopColor="#CCDFFF" />
          <stop offset="0.884515" stopColor="#B2CEFF" />
          <stop offset="0.884615" stopColor="#89B5FF" />
          <stop offset="1" stopColor="#97BEFF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PreviewFavicon({
  className,
  fallbackIconClass,
  idSuffix,
  item
}: {
  className: string;
  fallbackIconClass: string;
  idSuffix: string;
  item: NewtabPreviewItem;
}) {
  if (item.type === 'folder') {
    return (
      <span className={className}>
        <FolderGlyph idSuffix={idSuffix} />
      </span>
    );
  }
  const source = String(item.iconSrc || faviconUrl(item.url || '')).trim();
  if (source) {
    return (
      <img
        alt=""
        className={className}
        decoding="async"
        draggable={false}
        loading="eager"
        referrerPolicy="no-referrer"
        src={source}
      />
    );
  }
  return (
    <span className={`${className} newtab-preview-glyph-favicon`.trim()}>
      <Icon className={item.iconClass || fallbackIconClass || 'ri-link'} />
    </span>
  );
}

function PreviewWordmark({ src }: { src: string }) {
  return (
    <div
      aria-hidden="true"
      className="newtab-preview-wordmark"
      data-enter="done"
      id="_x_extension_newtab_wordmark_2026_unique_"
    >
      <button tabIndex={-1} type="button">
        <img
          alt=""
          decoding="async"
          draggable={false}
          src={src}
        />
      </button>
    </div>
  );
}

function PreviewSearchPanel({ model }: { model: NewtabPreviewModel }) {
  return (
    <div
      className="newtab-preview-search-panel"
      id="_x_extension_newtab_root_2024_unique_"
    >
      <div
        className="newtab-preview-search-layer"
        id="_x_extension_newtab_search_layer_2024_unique_"
      >
        <div
          className="x-lumno-search-input x-lumno-search-input__container"
          id="_x_extension_newtab_input_container_2024_unique_"
        >
          <span
            className="x-lumno-search-input__icon"
            id="_x_extension_newtab_search_icon_2024_unique_"
          >
            <Icon className="ri-search-line" />
          </span>
          <input
            aria-label={model.searchAriaLabel}
            className="x-lumno-search-input__field"
            id="_x_extension_newtab_search_input_2024_unique_"
            placeholder={model.searchPlaceholder}
            readOnly
            tabIndex={-1}
            type="text"
            value={model.query}
          />
          <button
            aria-label={model.settingsLabel}
            className="x-lumno-search-input__right-icon"
            tabIndex={-1}
            type="button"
          >
            <Icon className="ri-settings-3-line" />
          </button>
          <span
            className="x-lumno-search-input__divider"
            data-visible="false"
          />
          <div
            className="x-lumno-search-input-mode__badge"
            data-surface="newtab"
            data-visible="false"
            id="_x_extension_newtab_mode_badge_2024_unique_"
          />
        </div>
      </div>
    </div>
  );
}

function SuggestionsStack() {
  return (
    <div className="newtab-preview-suggestions-stack">
      <div
        data-visible="false"
        id="_x_extension_newtab_suggestions_surface_2026_unique_"
      />
      <div
        data-visible="false"
        id="_x_extension_newtab_suggestions_outline_2026_unique_"
      />
      <div
        data-visible="false"
        id="_x_extension_newtab_suggestions_container_2024_unique_"
      />
    </div>
  );
}

function SectionModeSelect({
  label
}: {
  label: string;
}) {
  return (
    <div
      className="x-nt-section-mode-select _x_extension_select_wrap_2024_unique_"
      data-icon-only="true"
      data-menu-align="left"
      data-menu-width="content"
    >
      <button
        aria-label={label}
        className="_x_extension_select_trigger_2024_unique_"
        data-tooltip={label}
        tabIndex={-1}
        type="button"
      >
        <span className="_x_extension_select_label_2024_unique_">{label}</span>
        <span className="_x_extension_select_icon_2024_unique_">
          <Icon className="ri-more-line" />
        </span>
      </button>
    </div>
  );
}

function SectionPager({
  label,
  model
}: {
  label: string;
  model: NewtabPreviewModel;
}) {
  const buttons = [
    {
      ariaLabel: formatTemplate(model.previousLabelTemplate, { label }),
      disabled: true,
      iconClass: 'ri-arrow-left-s-line'
    },
    {
      ariaLabel: formatTemplate(model.nextLabelTemplate, { label }),
      disabled: false,
      iconClass: 'ri-arrow-right-s-line'
    },
    {
      ariaLabel: model.bookmarkManagerLabel,
      disabled: false,
      iconClass: 'ri-bookmark-line'
    }
  ];
  return (
    <div className="x-nt-bookmarks-pager">
      {buttons.map((button) => (
        <button
          aria-disabled={button.disabled ? 'true' : 'false'}
          aria-label={button.ariaLabel}
          className="x-nt-bookmarks-pager-btn"
          key={button.iconClass}
          tabIndex={-1}
          type="button"
        >
          <Icon className={button.iconClass} />
        </button>
      ))}
    </div>
  );
}

function RecentCard({
  hovered,
  index,
  item,
  model
}: {
  hovered: boolean;
  index: number;
  item: NewtabPreviewItem;
  model: NewtabPreviewModel;
}) {
  const title = String(item.title || '');
  return (
    <div
      aria-label={formatTemplate(model.openItemAriaTemplate, { title })}
      className={[
        'x-nt-recent-card',
        item.alt ? 'x-nt-recent-card--alt' : '',
        hovered ? 'x-nt-recent-card--hover' : ''
      ].filter(Boolean).join(' ')}
      role="button"
      style={recentCardStyle(item)}
      tabIndex={-1}
    >
      <div className="x-nt-recent-inner">
        <div className="x-nt-recent-header">
          <PreviewFavicon
            className="x-nt-recent-favicon"
            fallbackIconClass="ri-global-line"
            idSuffix={`recent-${index}`}
            item={item}
          />
          <div className="x-nt-recent-name">{String(item.siteName || '')}</div>
        </div>
        <span className="x-nt-recent-title">{title}</span>
      </div>
      <div className="x-nt-recent-url">
        <div className="x-nt-recent-action">
          <span>{model.visitLabel}</span>
          <Icon className="ri-arrow-right-line" />
        </div>
        <span className="x-nt-recent-url-text">
          {String(item.urlText || '')}
        </span>
        <button className="x-nt-recent-pin" tabIndex={-1} type="button">
          <Icon className="ri-pushpin-line" />
        </button>
      </div>
    </div>
  );
}

function BookmarkCard({
  hovered,
  index,
  item,
  model
}: {
  hovered: boolean;
  index: number;
  item: NewtabPreviewItem;
  model: NewtabPreviewModel;
}) {
  const title = String(item.title || '');
  const folder = item.type === 'folder';
  const previewUrls = Array.isArray(item.previewUrls)
    ? item.previewUrls.slice(0, 4)
    : [];
  return (
    <button
      aria-label={formatTemplate(model.openItemAriaTemplate, { title })}
      className={[
        'x-nt-bookmark-card',
        folder ? 'x-nt-bookmark-card--folder' : '',
        folder && hovered ? 'x-nt-bookmark-card--hover' : ''
      ].filter(Boolean).join(' ')}
      data-cursor-tooltip={title}
      style={bookmarkCardStyle(item)}
      tabIndex={-1}
      title={title}
      type="button"
    >
      <PreviewFavicon
        className={
          folder
            ? 'x-nt-bookmark-icon x-nt-bookmark-icon--figma newtab-preview-folder-glyph'
            : 'x-nt-bookmark-icon'
        }
        fallbackIconClass="ri-bookmark-3-line"
        idSuffix={`bookmark-${title}-${index}`}
        item={item}
      />
      <span className="x-nt-bookmark-title">{title}</span>
      {folder && previewUrls.length > 0 ? (
        <span className="x-nt-folder-preview">
          {previewUrls.map((url, previewIndex) => (
            <img
              alt=""
              aria-hidden="true"
              className="x-nt-folder-preview-favicon"
              decoding="async"
              key={`${url}-${previewIndex}`}
              loading="eager"
              src={faviconUrl(url)}
              style={{
                '--x-nt-folder-favicon-rot':
                  `${(previewIndex - 1.5) * 2}deg`
              } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
    </button>
  );
}

function PreviewSection({
  hoverTarget,
  kind,
  model
}: {
  hoverTarget: PreviewHoverTarget;
  kind: 'bookmarks' | 'recent';
  model: NewtabPreviewModel;
}) {
  const recent = kind === 'recent';
  const items = recent ? model.recentSites : model.bookmarks;
  const title = recent
    ? model.recentSectionTitle
    : model.bookmarksSectionTitle;
  return (
    <section
      className={`newtab-preview-section newtab-preview-section--${kind}`}
      data-visible="true"
      id={
        recent
          ? '_x_extension_newtab_recent_sites_2024_unique_'
          : '_x_extension_newtab_bookmarks_2024_unique_'
      }
    >
      <div className={recent ? 'x-nt-recent-header-bar' : 'x-nt-bookmarks-header'}>
        {recent ? (
          <>
            <span className="x-nt-recent-heading">{title}</span>
            <SectionModeSelect label={model.sectionModeRecentLabel} />
          </>
        ) : (
          <>
            <div className="x-nt-bookmarks-title-wrap">
              <span className="x-nt-bookmarks-heading">{title}</span>
              <SectionModeSelect label={model.sectionModeBookmarksLabel} />
              <div className="x-nt-bookmarks-breadcrumb" style={{ display: 'none' }} />
            </div>
            <SectionPager label={title} model={model} />
          </>
        )}
      </div>
      <div
        className={`newtab-preview-grid newtab-preview-grid--${kind}`}
        id={
          recent
            ? '_x_extension_newtab_recent_sites_grid_2024_unique_'
            : '_x_extension_newtab_bookmarks_grid_2024_unique_'
        }
      >
        {items.map((item, index) => (
          recent ? (
            <RecentCard
              hovered={hoverTarget === 'recent' && index === 0}
              index={index}
              item={item}
              key={`${String(item.title || '')}-${index}`}
              model={model}
            />
          ) : (
            <BookmarkCard
              hovered={hoverTarget === 'bookmark' && index === 0}
              index={index}
              item={item}
              key={`${String(item.title || '')}-${index}`}
              model={model}
            />
          )
        ))}
      </div>
    </section>
  );
}

function PreviewViewport({
  hoverTarget,
  model
}: {
  hoverTarget: PreviewHoverTarget;
  model: NewtabPreviewModel;
}) {
  return (
    <div
      className="newtab-preview-viewport x-nt-bottom-layout"
      data-nt-ready="1"
      data-nt-suggestions-open="false"
      data-wallpaper-active="false"
    >
      <PreviewWordmark src={model.wordmarkSrc} />
      <PreviewSearchPanel model={model} />
      <SuggestionsStack />
      <div
        className="newtab-preview-bottom-dock"
        id="_x_extension_newtab_bottom_dock_2024_unique_"
      >
        <div id="_x_extension_newtab_bottom_dock_scroller_2024_unique_">
          <PreviewSection
            hoverTarget={hoverTarget}
            kind="bookmarks"
            model={model}
          />
          <div id="_x_extension_newtab_section_safe_corridor_2026_unique_" />
          <PreviewSection
            hoverTarget={hoverTarget}
            kind="recent"
            model={model}
          />
        </div>
      </div>
    </div>
  );
}

export function NewtabPreview({
  model,
  surface
}: {
  model: NewtabPreviewModel;
  surface: HTMLElement;
}) {
  const [hoverTarget, setHoverTarget] =
    useState<PreviewHoverTarget>('idle');

  useEffect(() => {
    surface.dataset.previewHover = hoverTarget;
  }, [hoverTarget, surface]);

  useEffect(() => {
    setHoverTarget('idle');
    if (model.reducedMotion) {
      return undefined;
    }
    const steps: Array<{
      duration: number;
      target: PreviewHoverTarget;
    }> = [
      { target: 'recent', duration: model.hoverHoldMs },
      { target: 'idle', duration: model.hoverMoveMs },
      { target: 'bookmark', duration: model.hoverHoldMs },
      { target: 'idle', duration: model.hoverSettleMs }
    ];
    let stepIndex = 0;
    let timeoutId = 0;
    const runStep = () => {
      const step = steps[stepIndex % steps.length];
      setHoverTarget(step.target);
      stepIndex += 1;
      timeoutId = window.setTimeout(runStep, step.duration);
    };
    timeoutId = window.setTimeout(runStep, model.hoverStartMs);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    model.hoverHoldMs,
    model.hoverMoveMs,
    model.hoverSettleMs,
    model.hoverStartMs,
    model.reducedMotion
  ]);

  return (
    <>
      <div className="browser-window-clip newtab-preview-browser-backdrop-clip">
        <div className="browser-window newtab-preview-browser-backdrop">
          <BrowserBar />
        </div>
      </div>
      <div className="browser-window-clip newtab-preview-browser-foreground-clip">
        <div className="newtab-preview-browser-foreground">
          <div className="newtab-preview-browser-page">
            <PreviewViewport hoverTarget={hoverTarget} model={model} />
          </div>
        </div>
      </div>
    </>
  );
}
