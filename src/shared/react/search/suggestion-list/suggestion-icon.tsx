// Row icons: favicon candidates with their browser fallbacks, the icon spec
// for each suggestion type, and the utility (delete, pin) action.
import {
  useRef,
  useState,
  useLayoutEffect,
  type RefObject,
  type PointerEvent as ReactPointerEvent
} from 'react';
import type {
  NormalizedOptions,
  FaviconCandidates,
  Suggestion,
  IconSpec,
  SuggestionIconSlotElement,
  SuggestionElement
} from './types';
import { surfaceClass, setSurfaceStyle } from './surface-options';
import { RemixIcon } from '../../remix-icon';
import type { RemixIconName } from '../../../ui/remix-icon';
import { FaviconFallback, OverlayFaviconFallback } from '../../favicon-fallback';

export function getBrowserFallbackIcon(
  options: NormalizedOptions,
  url: string
): RemixIconName | undefined {
  return options.isBrowserNewtabUrl(url) || options.isBrowserInternalUrl(url) ? 'ri-link' : undefined;
}

// The icon each feedback row draws, by the link it opens.
const FEEDBACK_ICONS: Readonly<Record<string, RemixIconName>> = {
  community: 'ri-wechat-line',
  'github-issue': 'ri-github-line',
  'contact-author': 'ri-twitter-x-line'
};

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

export function getSuggestionIconSpec(
  options: NormalizedOptions,
  suggestion: Suggestion
): IconSpec {
  const type = suggestion.type || '';
  const url = String(suggestion.url || '');
  const favicon = String(suggestion.favicon || '');
  const host = url ? options.getHostFromUrl(url) : '';
  if (type === 'directUrl') {
    return {
      kind: 'inline',
      iconName: 'ri-link'
    };
  }
  if (type === 'browserPage') {
    const useBrowserFavicon =
      type === 'browserPage' &&
      options.isBrowserInternalUrl(url);
    if (favicon || useBrowserFavicon) {
      return {
        kind: 'favicon',
        attach: true,
        url,
        host,
        favicon,
        objectFitContain: true,
        fallbackIconName: getBrowserFallbackIcon(options, url)
      };
    }
    return {
      kind: 'inline',
      iconName: 'ri-window-2-line'
    };
  }
  const commandIcons: Record<string, RemixIconName> = {
    commandNewTab: 'ri-add-line',
    commandSettings: 'ri-settings-3-line',
    commandDocumentPip: 'ri-scissors-cut-line',
    webAppearanceSwitch: 'ri-contrast-2-line'
  };
  if (commandIcons[type]) {
    return {
      kind: 'inline',
      iconName: commandIcons[type],
      tone: 'subtext'
    };
  }
  if ((type === 'modeSwitch' || type === 'zenSwitch') && favicon) {
    return {
      kind: 'favicon',
      src: favicon,
      fallbackIconName: 'ri-link'
    };
  }
  if (type === 'newtab' || type === 'googleSuggest') {
    return {
      kind: 'inline',
      iconName: 'ri-search-line',
      tone: 'subtext'
    };
  }
  if (type === 'helpFeedback') {
    return {
      kind: 'inline',
      iconName: FEEDBACK_ICONS[suggestion.feedbackKey || ''] || 'ri-feedback-line',
      tone: 'subtext'
    };
  }
  if (
    favicon &&
    ['siteSearch', 'inlineSiteSearch', 'siteSearchPrompt', 'helpArticle'].includes(
      type
    )
  ) {
    return {
      kind: 'favicon',
      attach: true,
      url,
      host,
      favicon,
      allowRemoteImage: true,
      objectFitContain: true
    };
  }
  if (favicon) {
    if (host && options.shouldBlockFaviconForHost(host)) {
      return { kind: 'inline', iconName: 'ri-link' };
    }
    return {
      kind: 'favicon',
      attach: true,
      url: url || favicon,
      host,
      favicon,
      objectFitContain: true
    };
  }
  return {
    kind: 'inline',
    iconName:
      host && options.shouldBlockFaviconForHost(host)
        ? 'ri-link'
        : 'ri-search-line',
    tone: 'subtext'
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

export function SuggestionIcon({
  spec,
  index,
  options,
  iconSlotRef
}: {
  spec: IconSpec;
  index: number;
  options: NormalizedOptions;
  iconSlotRef: React.RefObject<HTMLSpanElement | null>;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [failed, setFailed] = useState(false);
  const isFavicon = spec.kind === 'favicon' && !failed;

  useLayoutEffect(() => {
    const slot: SuggestionIconSlotElement | null = iconSlotRef.current;
    if (!slot) {
      return;
    }
    const handleFallback = (): void => {
      setFailed(true);
    };
    const handleRetry = (): void => {
      setFailed(false);
    };
    slot.addEventListener(
      'lumno-favicon-fallback',
      handleFallback
    );
    slot.addEventListener('lumno-favicon-retry', handleRetry);
    return () => {
      slot.removeEventListener(
        'lumno-favicon-fallback',
        handleFallback
      );
      slot.removeEventListener(
        'lumno-favicon-retry',
        handleRetry
      );
    };
  }, [iconSlotRef]);

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
      options.attachFaviconWithFallbacks(
        image,
        spec.url || spec.favicon || '',
        spec.host || '',
        getFaviconCandidates(
          options,
          spec.url || '',
          spec.favicon || '',
          spec.host || '',
          spec.allowRemoteImage === true
        )
      );
    }
  }, [
    iconSlotRef,
    isFavicon,
    options,
    spec.attach,
    spec.allowRemoteImage,
    spec.favicon,
    spec.host,
    spec.objectFitContain,
    spec.url
  ]);

  return (
    <span
      ref={iconSlotRef}
      className={surfaceClass(
        options,
        'x-nt-suggestion-icon-slot'
      )}
      data-favicon={isFavicon ? 'true' : 'false'}
      data-favicon-failed={failed ? 'true' : undefined}
    >
      {isFavicon ? (
        <img
          ref={imageRef}
          data-x-nt-suggestion-icon={
            options.surface === 'newtab' ? '1' : undefined
          }
          data-x-ov-suggestion-icon={
            options.surface === 'overlay' ? '1' : undefined
          }
          className={surfaceClass(
            options,
            'x-nt-suggestion-favicon'
          )}
          decoding="async"
          loading="eager"
          referrerPolicy="no-referrer"
          fetchPriority={index < 4 ? 'high' : undefined}
          data-object-fit={
            spec.objectFitContain ? 'contain' : undefined
          }
          data-fallback-icon-name={
            spec.fallbackIconName || undefined
          }
          src={spec.src}
          onError={
            spec.src && !spec.attach
              ? () => setFailed(true)
              : undefined
          }
        />
      ) : null}
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
        <span
          className={surfaceClass(
            options,
            'x-nt-suggestion-number-shortcut'
          )}
          aria-hidden="true"
        >
          {index}
        </span>
      ) : null}
    </span>
  );
}

export function isTopSite(suggestion: Suggestion): boolean {
  return Boolean(
    suggestion.type === 'topSite' || suggestion.isTopSite
  );
}

export function canDeleteHistory(suggestion: Suggestion): boolean {
  return Boolean(
    suggestion.url &&
    (suggestion.type === 'history' || isTopSite(suggestion))
  );
}

export function SuggestionUtilityAction({
  options,
  itemRef,
  slotRef,
  buttonRef,
  leading = false,
  tooltip,
  iconName,
  onActivate
}: {
  options: NormalizedOptions;
  itemRef: RefObject<SuggestionElement | null>;
  slotRef: RefObject<HTMLDivElement | null>;
  buttonRef: RefObject<HTMLButtonElement | null>;
  leading?: boolean;
  tooltip: string;
  iconName: RemixIconName;
  onActivate: () => void;
}) {
  const showTooltip = (): void => {
    if (buttonRef.current) {
      options.showTopActionTooltip(buttonRef.current, tooltip);
    }
  };

  const applyHover = (): void => {
    const item = itemRef.current;
    const button = buttonRef.current;
    if (!item || !button) {
      return;
    }
    const itemIndex = options.items.indexOf(item);
    const selectedIndex = options.getSelectedIndex();
    const theme = item._xTheme || options.defaultTheme;
    const useTheme =
      !item._xSimpleMode && (
        itemIndex === selectedIndex ||
        (selectedIndex === -1 && item._xIsAutocompleteTop) ||
        (item._xIsHovering && Boolean(theme?._xIsBrand))
      );
    const modeTheme = options.getThemeForMode(theme);
    const hover = useTheme
      ? options.getHoverColors(theme)
      : options.getNeutralHoverActionColors();
    showTooltip();
    button.style.removeProperty('transform');
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-hover-bg',
      hover.bg || ''
    );
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-hover-border',
      hover.border || ''
    );
    setSurfaceStyle(
      options,
      button,
      '--x-nt-suggestion-utility-hover-color',
      useTheme
        ? modeTheme.buttonText || ''
        : 'text' in hover
          ? hover.text || ''
          : ''
    );
    button.setAttribute('data-hover', 'true');
  };

  const reset = (): void => {
    options.hideTopActionTooltip();
    buttonRef.current?.removeAttribute('data-hover');
    buttonRef.current?.style.removeProperty('transform');
  };

  return (
    <div
      ref={slotRef}
      className={surfaceClass(options, 'x-nt-suggestion-utility-slot')}
      data-leading={leading ? 'true' : undefined}
      data-visible="false"
    >
      <button
        ref={buttonRef}
        type="button"
        className={surfaceClass(
          options,
          'x-nt-suggestion-utility-button'
        )}
        data-visible="false"
        aria-label={tooltip}
        onMouseEnter={applyHover}
        onMouseLeave={reset}
        onFocus={applyHover}
        onBlur={reset}
        onPointerUp={(
          event: ReactPointerEvent<HTMLButtonElement>
        ) => {
          event.currentTarget.style.setProperty('transform', 'none');
        }}
        onPointerCancel={(
          event: ReactPointerEvent<HTMLButtonElement>
        ) => {
          event.currentTarget.style.setProperty('transform', 'none');
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          reset();
          onActivate();
        }}
      >
        <RemixIcon name={iconName} />
      </button>
    </div>
  );
}
