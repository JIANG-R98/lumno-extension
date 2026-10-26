// A row's icon: its favicon with the browser's fallbacks, or an inline
// glyph, and the number shortcut over the first ten rows.
import { useRef, useState, useLayoutEffect, type RefObject } from 'react';
import type { NormalizedOptions, FaviconCandidates, IconSpec, SuggestionIconSlotElement } from './types';
import { surfaceClass } from './surface-options';
import { RemixIcon } from '../../remix-icon';
import type { RemixIconName } from '../../../ui/remix-icon';
import { FaviconFallback, OverlayFaviconFallback } from '../../favicon-fallback';

function getFaviconCandidates(
  options: NormalizedOptions,
  url: string,
  favicon: string,
  host: string,
  allowRemoteImage = false
): FaviconCandidates {
  return {
    ...options.getPageFaviconRenderCandidates(url, favicon, {
      allowRemoteImage,
      includeChromeFallback:
        Boolean(url && !/^https?:\/\//i.test(url)) ||
        Boolean(host && options.isLocalNetworkHost(host))
    }),
    allowRemoteImage
  };
}

function InlineIcon({
  options,
  name,
  tone
}: {
  options: NormalizedOptions;
  name: RemixIconName;
  tone?: string;
}) {
  return (
    <span
      className={surfaceClass(
        options,
        'x-nt-suggestion-inline-icon'
      )}
      data-tone={tone || undefined}
    >
      <RemixIcon name={name} size={16} />
    </span>
  );
}

// Whether the slot's favicon failed; the favicon loader reports failures
// and retries on the slot.
function useFaviconFailure(iconSlotRef: RefObject<HTMLSpanElement | null>): [boolean, (failed: boolean) => void] {
  const [failed, setFailed] = useState(false);
  useLayoutEffect(() => {
    const slot: SuggestionIconSlotElement | null = iconSlotRef.current;
    if (!slot) {
      return undefined;
    }
    const handleFallback = (): void => setFailed(true);
    const handleRetry = (): void => setFailed(false);
    slot.addEventListener('lumno-favicon-fallback', handleFallback);
    slot.addEventListener('lumno-favicon-retry', handleRetry);
    return () => {
      slot.removeEventListener('lumno-favicon-fallback', handleFallback);
      slot.removeEventListener('lumno-favicon-retry', handleRetry);
    };
  }, [iconSlotRef]);
  return [failed, setFailed];
}

// Aligns the favicon and, for an attached one, starts loading it through
// its candidates.
function useFaviconAttach(options: NormalizedOptions, spec: IconSpec, isFavicon: boolean,
  iconSlotRef: RefObject<HTMLSpanElement | null>, imageRef: RefObject<HTMLImageElement | null>): void {
  useLayoutEffect(() => {
    const image = imageRef.current;
    const slot: SuggestionIconSlotElement | null = iconSlotRef.current;
    if (slot) {
      slot._xIsFavicon = isFavicon;
    }
    if (!image || !isFavicon) {
      return;
    }
    options.applyFaviconOpticalAlignment(image);
    if (spec.attach) {
      const url = spec.url || '';
      const host = spec.host || '';
      const candidates = getFaviconCandidates(options, url, spec.favicon || '', host, spec.allowRemoteImage === true);
      options.attachFaviconWithFallbacks(image, url || spec.favicon || '', host, candidates);
    }
  }, [iconSlotRef, imageRef, isFavicon, options, spec.attach, spec.allowRemoteImage, spec.favicon, spec.host, spec.objectFitContain, spec.url]);
}

function FaviconImage({ options, spec, index, imageRef, onFailed }: {
  options: NormalizedOptions;
  spec: IconSpec;
  index: number;
  imageRef: RefObject<HTMLImageElement | null>;
  onFailed(): void;
}) {
  return (
    <img
      ref={imageRef}
      data-x-nt-suggestion-icon={options.surface === 'newtab' ? '1' : undefined}
      data-x-ov-suggestion-icon={options.surface === 'overlay' ? '1' : undefined}
      className={surfaceClass(options, 'x-nt-suggestion-favicon')}
      decoding="async"
      loading="eager"
      referrerPolicy="no-referrer"
      fetchPriority={index < 4 ? 'high' : undefined}
      data-object-fit={spec.objectFitContain ? 'contain' : undefined}
      data-fallback-icon-name={spec.fallbackIconName || undefined}
      src={spec.src}
      onError={spec.src && !spec.attach ? onFailed : undefined}
    />
  );
}

export function SuggestionIcon({
  spec,
  index,
  options,
  iconSlotRef
}: {
  spec: IconSpec;
  index: number;
  options: NormalizedOptions;
  iconSlotRef: RefObject<HTMLSpanElement | null>;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useFaviconFailure(iconSlotRef);
  const isFavicon = spec.kind === 'favicon' && !failed;
  useFaviconAttach(options, spec, isFavicon, iconSlotRef, imageRef);

  return (
    <span
      ref={iconSlotRef}
      className={surfaceClass(options, 'x-nt-suggestion-icon-slot')}
      data-favicon={isFavicon ? 'true' : 'false'}
      data-favicon-failed={failed ? 'true' : undefined}
    >
      {isFavicon ? <FaviconImage imageRef={imageRef} index={index} onFailed={() => setFailed(true)} options={options} spec={spec} /> : null}
      {isFavicon && spec.attach ? (
        options.surface === 'overlay'
          ? <OverlayFaviconFallback />
          : <FaviconFallback iconName={spec.fallbackIconName || 'ri-link'} tone="suggestion" />
      ) : null}
      {isFavicon ? null : (
        <InlineIcon
          options={options}
          name={spec.fallbackIconName || spec.iconName || 'ri-link'}
          tone={spec.tone || (failed ? 'subtext' : undefined)}
        />
      )}
      {index < 10 ? (
        <span className={surfaceClass(options, 'x-nt-suggestion-number-shortcut')} aria-hidden="true">
          {index}
        </span>
      ) : null}
    </span>
  );
}
