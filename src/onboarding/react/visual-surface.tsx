import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import {
  BookmarkFocusDemo,
  type BookmarkFocusModel
} from './bookmark-focus-demo';
import {
  NewtabPreview,
  type NewtabPreviewModel
} from './newtab-preview';
import {
  SiteSearchDemoSurface,
  type SiteSearchCaseModel
} from './site-search-demo';

interface FeatureCardModel {
  art?: string;
  artSize?: {
    height?: number;
    width?: number;
  };
  body?: string;
  title?: string;
  tone?: string;
}

interface FeatureAwardModel {
  lines?: string[];
}

export interface VisualSurfaceRenderModel {
  ariaLabel: string;
  bookmarkFocus?: BookmarkFocusModel;
  butterflyDValues: string;
  butterflyRestPath: string;
  featureAwards?: FeatureAwardModel[];
  featureCardAriaJoiner?: string;
  featureCards?: FeatureCardModel[];
  homepagePipArtSrc?: string;
  kind: string;
  newtabPreview?: NewtabPreviewModel;
  newtabFiltersArtSrc?: string;
  practicalFeaturesAriaLabel?: string;
  principlesAriaLabel?: string;
  siteSearchCases?: SiteSearchCaseModel[];
  siteSearchDemoAriaLabel?: string;
  siteSearchOpenLabel?: string;
  siteSearchSettingsLabel?: string;
  siteSearchTabHintTemplate?: string;
  wordmarkSrc: string;
}

export interface VisualSurfaceController {
  render(model: VisualSurfaceRenderModel): boolean;
  clear(): void;
  destroy(): void;
}

function ButterflyWing({
  begin,
  butterflyDValues,
  butterflyRestPath,
  className,
  transformMotion
}: {
  begin?: string;
  butterflyDValues: string;
  butterflyRestPath: string;
  className: string;
  transformMotion?: boolean;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 23 25"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="logo-butterfly-path"
        d={butterflyRestPath}
        fill="#79C3F2"
        opacity="0.2"
      >
        <animate
          attributeName="d"
          begin={begin}
          calcMode="spline"
          dur="2800ms"
          keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
          keyTimes="0;0.5;1"
          repeatCount="indefinite"
          values={butterflyDValues}
        />
        {transformMotion ? (
          <animateTransform
            attributeName="transform"
            calcMode="spline"
            dur="2800ms"
            keySplines="0.42 0 0.58 1;0.42 0 0.58 1"
            keyTimes="0;0.5;1"
            repeatCount="indefinite"
            type="rotate"
            values="-1.5 5.5 15.5;0 5.5 15.5;-1.5 5.5 15.5"
          />
        ) : null}
      </path>
    </svg>
  );
}

function LumnoWordmarkSurface({
  model
}: {
  model: VisualSurfaceRenderModel;
}) {
  return (
    <>
      <span aria-hidden="true" className="logo-wordmark-wrap">
        <img
          alt=""
          className="logo-wordmark mark-svg"
          draggable={false}
          src={model.wordmarkSrc}
        />
        <span aria-hidden="true" className="logo-butterfly-stage">
          <ButterflyWing
            begin="120ms"
            butterflyDValues={model.butterflyDValues}
            butterflyRestPath={model.butterflyRestPath}
            className="logo-butterfly logo-butterfly-wing logo-butterfly-wing-back mark-svg"
          />
          <ButterflyWing
            butterflyDValues={model.butterflyDValues}
            butterflyRestPath={model.butterflyRestPath}
            className="logo-butterfly logo-butterfly-wing logo-butterfly-wing-front mark-svg"
            transformMotion
          />
        </span>
      </span>
      <span className="seo-wordmark-text">Lumno</span>
    </>
  );
}

function FeatureCardArtwork({
  item,
  model
}: {
  item: FeatureCardModel;
  model: VisualSurfaceRenderModel;
}) {
  const art = String(item.art || '');
  if (art === 'homepage-pip' || art === 'newtab-filters') {
    const isPip = art === 'homepage-pip';
    return (
      <div
        aria-hidden="true"
        className={`feature-card__art ${
          isPip ? 'feature-card__art--pip' : 'feature-card__art--newtab'
        }`}
        data-art={art}
      >
        <img
          alt=""
          className="feature-card__art-image"
          decoding="async"
          draggable={false}
          loading="eager"
          src={
            isPip
              ? String(model.homepagePipArtSrc || '')
              : String(model.newtabFiltersArtSrc || '')
          }
        />
      </div>
    );
  }

  const width = Number(item.artSize?.width) > 0
    ? Number(item.artSize?.width)
    : 298;
  const height = Number(item.artSize?.height) > 0
    ? Number(item.artSize?.height)
    : 120;
  return (
    <div
      aria-hidden="true"
      className="feature-card__art feature-card__art--blank"
      data-art="blank"
      data-art-height={String(height)}
      data-art-width={String(width)}
    />
  );
}

function FeatureCard({
  index,
  item,
  model
}: {
  index: number;
  item: FeatureCardModel;
  model: VisualSurfaceRenderModel;
}) {
  const title = String(item.title || '').trim();
  const body = String(item.body || '').trim();
  const tone = String(item.tone || '').trim();
  const ariaLabel = title || body
    ? (
        body
          ? `${title}${String(model.featureCardAriaJoiner || ', ')}${body}`
          : title
      )
    : undefined;
  const style = {
    '--feature-card-delay': `${260 + index * 90}ms`,
    '--feature-card-index': String(index)
  } as CSSProperties;

  return (
    <article
      aria-label={ariaLabel}
      className="feature-card"
      data-tone={tone || undefined}
      style={style}
    >
      <header className="feature-card__copy">
        <h2 className="feature-card__title">{title}</h2>
        <p className="feature-card__body">{body}</p>
      </header>
      <FeatureCardArtwork item={item} model={model} />
    </article>
  );
}

function FeatureAward({
  index,
  item
}: {
  index: number;
  item: FeatureAwardModel;
}) {
  const style = {
    '--feature-award-delay': `${180 + index * 80}ms`,
    '--feature-award-index': String(index)
  } as CSSProperties;
  const lines = Array.isArray(item.lines) ? item.lines : [];

  return (
    <section className="feature-award" style={style}>
      <span
        aria-hidden="true"
        className="feature-award__wheat feature-award__wheat--left"
      />
      <div className="feature-award__label">
        {lines.map((line, lineIndex) => (
          <span key={`${line}-${lineIndex}`}>{String(line || '')}</span>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="feature-award__wheat feature-award__wheat--right"
      />
    </section>
  );
}

function FeatureCardsSurface({
  model
}: {
  model: VisualSurfaceRenderModel;
}) {
  const awards = Array.isArray(model.featureAwards)
    ? model.featureAwards
    : [];
  const cards = Array.isArray(model.featureCards) ? model.featureCards : [];

  return (
    <>
      <div
        aria-label={String(
          model.principlesAriaLabel || 'Lumno principles'
        )}
        className="feature-cards-surface__awards"
      >
        {awards.map((item, index) => (
          <FeatureAward index={index} item={item} key={index} />
        ))}
      </div>
      <div className="feature-cards-surface__stack">
        {cards.map((item, index) => (
          <FeatureCard
            index={index}
            item={item}
            key={`${String(item.title || '')}-${index}`}
            model={model}
          />
        ))}
      </div>
    </>
  );
}

export function createVisualSurfaceController(
  stage: HTMLElement | null
): VisualSurfaceController {
  let currentHost: HTMLElement | null = null;
  let currentRoot: Root | null = null;
  let destroyed = false;

  function clear(): void {
    if (currentRoot) {
      flushSync(() => {
        currentRoot?.unmount();
      });
      currentRoot = null;
    }
    currentHost?.remove();
    currentHost = null;
  }

  function render(model: VisualSurfaceRenderModel): boolean {
    if (destroyed || !stage) {
      return false;
    }
    if (
      model.kind !== 'lumno-web-wordmark-surface' &&
      model.kind !== 'feature-cards-surface' &&
      model.kind !== 'site-search-demo-surface' &&
      model.kind !== 'bookmark-focus-surface' &&
      model.kind !== 'newtab-preview-surface'
    ) {
      clear();
      return false;
    }
    if (
      model.kind === 'newtab-preview-surface' &&
      !model.newtabPreview
    ) {
      clear();
      return false;
    }
    clear();
    const hostElement = document.createElement('div');
    currentHost = hostElement;
    const isWordmark = model.kind === 'lumno-web-wordmark-surface';
    const isFeatureCards = model.kind === 'feature-cards-surface';
    const isSiteSearch = model.kind === 'site-search-demo-surface';
    const isNewtabPreview = model.kind === 'newtab-preview-surface';
    hostElement.className = isWordmark
      ? 'lumno-web-wordmark-surface'
      : (
          isFeatureCards
            ? 'feature-cards-surface'
            : (
                isSiteSearch
                  ? 'site-search-demo-surface'
                  : (
                      isNewtabPreview
                        ? 'newtab-preview-surface'
                        : 'bookmark-focus-ui'
                    )
              )
        );
    if (isWordmark || isFeatureCards || isSiteSearch || isNewtabPreview) {
      hostElement.setAttribute(
        'aria-label',
        isWordmark
          ? String(model.ariaLabel || 'Lumno')
          : (
              isFeatureCards
                ? String(
                    model.practicalFeaturesAriaLabel ||
                      'Lumno practical features'
                  )
                : (
                    isSiteSearch
                      ? String(
                          model.siteSearchDemoAriaLabel ||
                            'Lumno site search demo'
                        )
                      : String(
                          model.newtabPreview?.ariaLabel ||
                            'Lumno new tab preview'
                        )
                  )
            )
      );
    }
    hostElement.setAttribute(
      'data-react-island',
      isWordmark
        ? 'onboarding-lumno-wordmark-surface'
        : (
            isFeatureCards
              ? 'onboarding-feature-cards-surface'
              : (
                  isSiteSearch
                    ? 'onboarding-site-search-demo-surface'
                    : (
                        isNewtabPreview
                          ? 'onboarding-newtab-preview-surface'
                          : 'onboarding-bookmark-focus-surface'
                      )
                )
          )
    );
    stage.appendChild(hostElement);
    currentRoot = createRoot(hostElement);
    flushSync(() => {
      currentRoot?.render(
        isWordmark
          ? <LumnoWordmarkSurface model={model} />
          : (
              isFeatureCards
                ? <FeatureCardsSurface model={model} />
                : (
                    isSiteSearch
                      ? (
                          <SiteSearchDemoSurface
                            model={{
                              cases: Array.isArray(model.siteSearchCases)
                                ? model.siteSearchCases
                                : [],
                              openLabel: String(
                                model.siteSearchOpenLabel || 'Open'
                              ),
                              settingsLabel: String(
                                model.siteSearchSettingsLabel || 'Settings'
                              ),
                              tabHintTemplate: String(
                                model.siteSearchTabHintTemplate ||
                                  'Search with {provider}'
                              )
                            }}
                          />
                        )
                      : isNewtabPreview && model.newtabPreview
                        ? (
                            <NewtabPreview
                              model={model.newtabPreview}
                              surface={hostElement}
                            />
                          )
                        : (
                            model.bookmarkFocus
                              ? (
                                  <BookmarkFocusDemo
                                    model={model.bookmarkFocus}
                                  />
                                )
                              : null
                          )
                  )
            )
      );
    });
    return true;
  }

  return Object.freeze({
    render,
    clear,
    destroy() {
      if (destroyed) {
        return;
      }
      clear();
      destroyed = true;
    }
  });
}

export function createVisualSurfaceApi() {
  return Object.freeze({
    implementation: 'react',
    createVisualSurfaceController
  });
}
