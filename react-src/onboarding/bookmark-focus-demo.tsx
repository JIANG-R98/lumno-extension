import {
  useEffect,
  useState,
  type CSSProperties
} from 'react';
import { RemixIcon as Icon } from '../shared/remix-icon';
import { HighlightedText } from './site-search-demo';

export interface BookmarkFocusResult {
  actionTagLabel?: string;
  detail?: string;
  favicon?: string;
  historyDeletable?: boolean;
  sourceTag?: string;
  sourceTagKind?: string;
  title?: string;
  type?: string;
  visitButtonLabel?: string;
}

export interface BookmarkFocusModel {
  hoverLeadMs: number;
  hoverStartMs: number;
  hoverStepMs: number;
  hoverWrapStepMs: number;
  openLabel: string;
  overlayAriaLabel: string;
  panelId: string;
  query: string;
  reducedMotion: boolean;
  removeHistoryLabel: string;
  results: BookmarkFocusResult[];
  searchAriaLabel: string;
  settingsLabel: string;
}

function SkeletonLine({ className }: { className: string }) {
  return <span aria-hidden="true" className={className} />;
}

function SurfaceRail() {
  return (
    <div className="surface-rail">
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonLine className="surface-rail-dot" key={index} />
      ))}
    </div>
  );
}

function BrowserTabs() {
  return (
    <div className="browser-tabs">
      <SkeletonLine className="browser-tab" />
      <SkeletonLine className="browser-tab browser-tab--muted" />
    </div>
  );
}

function BrowserActions() {
  return (
    <div className="browser-actions">
      {Array.from({ length: 2 }, (_, index) => (
        <span aria-hidden="true" className="browser-action-dot" key={index} />
      ))}
    </div>
  );
}

function BrowserBar() {
  return (
    <div className="browser-bar">
      <SurfaceRail />
      <BrowserTabs />
      <SkeletonLine className="browser-address" />
      <BrowserActions />
    </div>
  );
}

function BrowserPageSection({
  lineClasses
}: {
  lineClasses: string[];
}) {
  return (
    <div className="browser-page-section">
      {lineClasses.map((lineClass, index) => (
        <SkeletonLine
          className={`browser-page-line ${lineClass}`.trim()}
          key={`${lineClass}-${index}`}
        />
      ))}
    </div>
  );
}

function BrowserPageSkeleton() {
  return (
    <div className="browser-page-skeleton">
      <div className="browser-page-main">
        <div className="browser-page-section browser-page-hero">
          <SkeletonLine className="browser-page-title" />
          <SkeletonLine className="browser-page-line browser-page-line--wide" />
          <SkeletonLine className="browser-page-line browser-page-line--mid" />
          <SkeletonLine className="browser-page-line browser-page-line--short" />
        </div>
        <div className="browser-page-section">
          {Array.from({ length: 4 }, (_, index) => (
            <span aria-hidden="true" className="browser-page-row" key={index} />
          ))}
        </div>
      </div>
      <div className="browser-page-sidebar">
        <BrowserPageSection
          lineClasses={[
            'browser-page-line--wide',
            'browser-page-line--mid',
            'browser-page-line--short'
          ]}
        />
        <BrowserPageSection
          lineClasses={[
            'browser-page-line--wide',
            'browser-page-line--mid'
          ]}
        />
      </div>
    </div>
  );
}

function BrowserWindow() {
  return (
    <div className="browser-window-clip">
      <div className="browser-window">
        <BrowserBar />
        <BrowserPageSkeleton />
      </div>
    </div>
  );
}

function SuggestionInlineIcon({
  className,
  iconClass,
  tone
}: {
  className?: string;
  iconClass: string;
  tone?: string;
}) {
  return (
    <span
      className={className || 'x-ov-suggestion-inline-icon'}
      data-tone={tone}
    >
      <Icon className={iconClass} />
    </span>
  );
}

function ResultFavicon({
  active,
  result
}: {
  active: boolean;
  result: BookmarkFocusResult;
}) {
  const [failed, setFailed] = useState(false);
  const type = String(result.type || '');
  const favicon = String(result.favicon || '').trim();
  const usesInlineIcon = [
    'newtab',
    'googleSuggest',
    'browserPage',
    'commandNewTab',
    'commandSettings'
  ].includes(type);
  const hasImage = Boolean(!usesInlineIcon && favicon && !failed);
  let content = (
    <SuggestionInlineIcon iconClass="ri-link" />
  );
  if (type === 'newtab' || type === 'googleSuggest') {
    content = (
      <SuggestionInlineIcon iconClass="ri-search-line" tone="subtext" />
    );
  } else if (type === 'browserPage') {
    content = <SuggestionInlineIcon iconClass="ri-link" />;
  } else if (type === 'commandNewTab') {
    content = (
      <SuggestionInlineIcon iconClass="ri-add-line" tone="subtext" />
    );
  } else if (type === 'commandSettings') {
    content = (
      <SuggestionInlineIcon iconClass="ri-settings-3-line" tone="subtext" />
    );
  } else if (hasImage) {
    content = (
      <img
        alt=""
        className="x-ov-suggestion-favicon"
        decoding="async"
        loading="eager"
        onError={() => setFailed(true)}
        referrerPolicy="no-referrer"
        src={favicon}
      />
    );
  }

  return (
    <span
      className="x-ov-suggestion-icon-slot"
      data-emphasis={active ? 'true' : 'false'}
      data-favicon={hasImage ? 'true' : 'false'}
    >
      {content}
    </span>
  );
}

function SourceTag({
  active,
  result
}: {
  active: boolean;
  result: BookmarkFocusResult;
}) {
  if (!result.sourceTag) {
    return null;
  }
  const sourceTagStyle = {
    '--x-ov-suggestion-source-tag-bg': active
      ? 'transparent'
      : 'var(--x-ov-tag-bg, #F3F4F6)',
    '--x-ov-suggestion-source-tag-text': active
      ? 'var(--x-ext-tag-text, #1E3A8A)'
      : 'var(--x-ov-tag-text, #667085)',
    '--x-ov-suggestion-source-tag-border': 'transparent'
  } as CSSProperties;
  return (
    <span
      className="x-ov-suggestion-source-tag"
      data-visible="true"
      style={sourceTagStyle}
    >
      {String(result.sourceTag)}
    </span>
  );
}

function OverlayResult({
  active,
  index,
  model,
  result
}: {
  active: boolean;
  index: number;
  model: BookmarkFocusModel;
  result: BookmarkFocusResult;
}) {
  const hasActionTags = Boolean(result.actionTagLabel);
  const showActionTag = active && hasActionTags;
  const style = { '--result-index': String(index) } as CSSProperties;

  return (
    <div
      className="x-ov-suggestion-item lumno-overlay-result"
      data-active={active ? 'true' : 'false'}
      data-demo-index={String(index)}
      data-has-action-tags={hasActionTags ? 'true' : 'false'}
      data-history-deletable={result.historyDeletable ? 'true' : 'false'}
      data-last={index === model.results.length - 1 ? 'true' : 'false'}
      data-simple-mode="false"
      data-type={String(result.type || '')}
      style={style}
    >
      <div className="x-ov-suggestion-left" data-motion="true">
        <ResultFavicon active={active} result={result} />
        <div className="x-ov-suggestion-text">
          <span className="x-ov-suggestion-title">
            <HighlightedText
              query={model.query}
              text={String(result.title || '')}
              themed={active}
            />
          </span>
          {result.detail ? (
            <span
              className={
                result.type === 'bookmark'
                  ? 'x-ov-suggestion-bookmark-path'
                  : 'x-ov-suggestion-url-line'
              }
            >
              {String(result.detail)}
            </span>
          ) : null}
          <SourceTag active={active} result={result} />
        </div>
      </div>
      <div className="x-ov-suggestion-right" data-action-column="true">
        <div
          className="x-ov-suggestion-action-tags"
          data-visible={showActionTag ? 'true' : 'false'}
        >
          {hasActionTags ? (
            <span className="x-ov-action-tag">
              <span className="x-ov-action-tag__label">
                {String(result.actionTagLabel || model.openLabel)}
              </span>
            </span>
          ) : null}
        </div>
        <button
          className="x-ov-suggestion-action-button x-ov-suggestion-visit-button"
          data-visible={showActionTag ? 'false' : 'true'}
          type="button"
        >
          <span className="x-ov-inline-label">
            {String(result.visitButtonLabel || model.openLabel)}
          </span>
        </button>
        {result.historyDeletable ? (
          <div
            className="x-ov-suggestion-utility-slot"
            data-leading="true"
            data-visible="false"
          >
            <button
              aria-label={model.removeHistoryLabel}
              className="x-ov-suggestion-utility-button"
              data-visible="false"
              type="button"
            >
              <Icon className="ri-delete-bin-6-line" />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function QueryText({ query }: { query: string }) {
  const characters = Array.from(String(query || ''));
  const stepMs = 1040 / Math.max(1, characters.length);
  return (
    <span className="lumno-overlay-query-text">
      {characters.map((character, index) => {
        const style = {
          '--typing-char-delay': `${Math.round((index + 1) * stepMs)}ms`
        } as CSSProperties;
        return (
          <span
            className="onboarding-typing-char"
            key={`${character}-${index}`}
            style={style}
          >
            {character}
          </span>
        );
      })}
    </span>
  );
}

function OverlayPanel({
  activeIndex,
  model
}: {
  activeIndex: number;
  model: BookmarkFocusModel;
}) {
  return (
    <div
      aria-label={model.overlayAriaLabel}
      className="lumno-overlay-panel"
      id={model.panelId}
    >
      <div className="x-lumno-search-input x-lumno-search-input__container">
        <span className="x-lumno-search-input__icon">
          <Icon className="ri-search-line ri-size-16" />
        </span>
        <div
          aria-label={model.searchAriaLabel}
          className="x-lumno-search-input__field lumno-overlay-query"
          role="searchbox"
        >
          <QueryText query={model.query} />
          <span aria-hidden="true" className="lumno-overlay-query-caret" />
        </div>
        <span className="x-lumno-search-input__divider" />
        <button
          aria-label={model.settingsLabel}
          className="x-lumno-search-input__right-icon"
          type="button"
        >
          <Icon className="ri-settings-line ri-size-16" />
        </button>
        <div
          className="x-lumno-search-input-mode__badge"
          data-surface="overlay"
          data-visible="false"
        />
      </div>
      <div className="x-ov-suggestions-container lumno-overlay-results">
        {model.results.map((result, index) => (
          <OverlayResult
            active={index === activeIndex}
            index={index}
            key={`${String(result.type || '')}-${index}`}
            model={model}
            result={result}
          />
        ))}
      </div>
    </div>
  );
}

export function BookmarkFocusDemo({ model }: { model: BookmarkFocusModel }) {
  const resultCount = model.results.length;
  const [activeIndex, setActiveIndex] = useState(
    model.reducedMotion && resultCount > 0 ? 0 : -1
  );

  useEffect(() => {
    if (model.reducedMotion) {
      setActiveIndex(resultCount > 0 ? 0 : -1);
      return undefined;
    }
    setActiveIndex(-1);
    if (resultCount <= 0) {
      return undefined;
    }

    let startTimeout = 0;
    let stepTimeout = 0;
    const scheduleStep = (
      currentIndex: number,
      firstStepDelay?: number
    ): void => {
      const wrapping = currentIndex >= resultCount - 1;
      const delay = Number(firstStepDelay) > 0
        ? Number(firstStepDelay)
        : (
            wrapping
              ? model.hoverStepMs + model.hoverWrapStepMs
              : model.hoverStepMs
          );
      stepTimeout = window.setTimeout(() => {
        const nextIndex = wrapping ? 0 : currentIndex + 1;
        setActiveIndex(nextIndex);
        scheduleStep(nextIndex);
      }, delay);
    };

    startTimeout = window.setTimeout(() => {
      setActiveIndex(0);
      scheduleStep(0, model.hoverStepMs + model.hoverLeadMs);
    }, model.hoverStartMs);

    return () => {
      if (startTimeout) {
        window.clearTimeout(startTimeout);
      }
      if (stepTimeout) {
        window.clearTimeout(stepTimeout);
      }
    };
  }, [
    model.hoverLeadMs,
    model.hoverStartMs,
    model.hoverStepMs,
    model.hoverWrapStepMs,
    model.reducedMotion,
    resultCount
  ]);

  return (
    <>
      <BrowserWindow />
      <OverlayPanel activeIndex={activeIndex} model={model} />
    </>
  );
}
