import { useState, type ReactNode } from 'react';
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
  lines?: readonly string[];
}

export interface VisualSurfaceRenderModel {
  ariaLabel: string;
  bookmarkFocus?: BookmarkFocusModel;
  butterflyDValues: string;
  butterflyRestPath: string;
  featureAwards?: readonly FeatureAwardModel[];
  featureCardAriaJoiner?: string;
  featureCards?: readonly FeatureCardModel[];
  homepagePipArtSrc?: string;
  kind: string;
  newtabPreview?: NewtabPreviewModel;
  newtabFiltersArtSrc?: string;
  practicalFeaturesAriaLabel?: string;
  principlesAriaLabel?: string;
  siteSearchCases?: readonly SiteSearchCaseModel[];
  siteSearchDemoAriaLabel?: string;
  siteSearchOpenLabel?: string;
  siteSearchSettingsLabel?: string;
  siteSearchTabHintTemplate?: string;
  wordmarkSrc: string;
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
  };

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
  };
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

// How each kind of surface is framed: its class, accessible name and the
// name tests and styles know it by.
function getSurfaceLook(model: VisualSurfaceRenderModel): { className: string; ariaLabel?: string; name: string } | null {
  switch (model.kind) {
    case 'lumno-web-wordmark-surface':
      return {
        className: 'lumno-web-wordmark-surface',
        ariaLabel: String(model.ariaLabel || 'Lumno'),
        name: 'onboarding-lumno-wordmark-surface'
      };
    case 'feature-cards-surface':
      return {
        className: 'feature-cards-surface',
        ariaLabel: String(model.practicalFeaturesAriaLabel || 'Lumno practical features'),
        name: 'onboarding-feature-cards-surface'
      };
    case 'site-search-demo-surface':
      return {
        className: 'site-search-demo-surface',
        ariaLabel: String(model.siteSearchDemoAriaLabel || 'Lumno site search demo'),
        name: 'onboarding-site-search-demo-surface'
      };
    case 'newtab-preview-surface':
      return model.newtabPreview
        ? {
          className: 'newtab-preview-surface',
          ariaLabel: String(model.newtabPreview.ariaLabel || 'Lumno new tab preview'),
          name: 'onboarding-newtab-preview-surface'
        }
        : null;
    case 'bookmark-focus-surface':
      return { className: 'bookmark-focus-ui', name: 'onboarding-bookmark-focus-surface' };
    default:
      return null;
  }
}

function SurfaceContent({ model, surface }: { model: VisualSurfaceRenderModel; surface: HTMLElement }): ReactNode {
  switch (model.kind) {
    case 'lumno-web-wordmark-surface':
      return <LumnoWordmarkSurface model={model} />;
    case 'feature-cards-surface':
      return <FeatureCardsSurface model={model} />;
    case 'site-search-demo-surface':
      return (
        <SiteSearchDemoSurface
          model={{
            cases: Array.isArray(model.siteSearchCases) ? model.siteSearchCases : [],
            openLabel: String(model.siteSearchOpenLabel || 'Open'),
            settingsLabel: String(model.siteSearchSettingsLabel || 'Settings'),
            tabHintTemplate: String(model.siteSearchTabHintTemplate || 'Search with {provider}')
          }}
        />
      );
    case 'newtab-preview-surface':
      return model.newtabPreview ? <NewtabPreview model={model.newtabPreview} surface={surface} /> : null;
    default:
      return model.bookmarkFocus ? <BookmarkFocusDemo model={model.bookmarkFocus} /> : null;
  }
}

// The demo a slide shows beside its copy; nothing for a kind it does not know.
export function VisualSurface({ model }: { model: VisualSurfaceRenderModel }) {
  const [surface, setSurface] = useState<HTMLDivElement | null>(null);
  const look = getSurfaceLook(model);
  if (!look) {
    return null;
  }
  return (
    <div aria-label={look.ariaLabel} className={look.className} data-visual-surface={look.name} ref={setSurface}>
      {surface ? <SurfaceContent model={model} surface={surface} /> : null}
    </div>
  );
}
