// An open tab row.
import { useRef, useMemo, useLayoutEffect, type MouseEvent as ReactMouseEvent, type RefObject, memo } from 'react';
import type {
  SuggestionsRuntime,
  OpenTabSuggestion,
  SuggestionElement,
  SuggestionActionTagElement,
  IconSpec,
  NormalizedOptions,
  Suggestion
} from './types';
import { getBrowserFallbackIcon } from './icon-spec';
import { SuggestionIcon } from './suggestion-icon';
import { SuggestionUtilityAction } from './utility-action';
import { isLocalUrlSuggestion, getActionLabel, getModifierAction } from './action-model';
import { surfaceClass, setSurfaceStyle } from './surface-options';
import { bindTextTooltip } from './highlight';
import { setIconEmphasis } from './action-styles';
import { followSiteTheme } from './suggestion-row-theme';
import { queryHtmlTag } from '../../../dom-lookup';
import { RemixIcon } from '../../remix-icon';

interface OpenTabRowProps {
  runtime: SuggestionsRuntime;
  tab: OpenTabSuggestion;
  index: number;
  last: boolean;
  simpleMode: boolean;
}

interface OpenTabRefs {
  item: RefObject<SuggestionElement | null>;
  iconSlot: RefObject<HTMLSpanElement | null>;
  title: RefObject<HTMLSpanElement | null>;
  switchButton: RefObject<HTMLButtonElement | null>;
  switchButtonLabel: RefObject<HTMLSpanElement | null>;
  copySlot: RefObject<HTMLDivElement | null>;
  copyButton: RefObject<HTMLButtonElement | null>;
  actionTags: RefObject<HTMLDivElement | null>;
  switchActionTag: RefObject<SuggestionActionTagElement | null>;
}

function useOpenTabRefs(): OpenTabRefs {
  return {
    item: useRef<SuggestionElement>(null),
    iconSlot: useRef<HTMLSpanElement>(null),
    title: useRef<HTMLSpanElement>(null),
    switchButton: useRef<HTMLButtonElement>(null),
    switchButtonLabel: useRef<HTMLSpanElement>(null),
    copySlot: useRef<HTMLDivElement>(null),
    copyButton: useRef<HTMLButtonElement>(null),
    actionTags: useRef<HTMLDivElement>(null),
    switchActionTag: useRef<SuggestionActionTagElement>(null)
  };
}

function readHost(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

// The tab's favicon, or a browser glyph for a blocked host or a browser New
// Tab without one.
function readOpenTabIcon(options: NormalizedOptions, tab: OpenTabSuggestion): IconSpec {
  const url = tab.url || '';
  const host = readHost(tab.url);
  const hasFavicon = Boolean(String(tab.favIconUrl || '').trim());
  if (options.shouldBlockFaviconForHost(host) || (!hasFavicon && options.isBrowserNewtabUrl(url))) {
    return { kind: 'inline', iconName: getBrowserFallbackIcon(options, url) || 'ri-link' };
  }
  return {
    kind: 'favicon',
    attach: true,
    url,
    favicon: tab.favIconUrl || '',
    host,
    fallbackIconName: getBrowserFallbackIcon(options, url)
  };
}

// Puts the row's elements and state on its element, for the selection styles.
function publishOpenTabElements(options: NormalizedOptions, item: SuggestionElement, refs: OpenTabRefs,
  tab: OpenTabSuggestion, facts: { index: number; iconIsFavicon: boolean; tabSuggestion: Suggestion; simpleMode: boolean }): void {
  const switchTag = refs.switchActionTag.current;
  item._xIsSearchSuggestion = false;
  item._xIsAutocompleteTop = options.autoHighlightFirstTab && facts.index === 0;
  item._xIconWrap = refs.iconSlot.current;
  item._xIconIsFavicon = facts.iconIsFavicon;
  item._xTitle = refs.title.current;
  item._xSwitchButton = refs.switchButton.current;
  item._xVisitButton = refs.switchButton.current;
  item._xVisitButtonLabel = refs.switchButtonLabel.current;
  item._xVisitButtonAction = 'switch';
  item._xSuggestion = facts.tabSuggestion;
  item._xTabId = typeof tab.id === 'number' ? tab.id : null;
  item._xSimpleMode = facts.simpleMode;
  item._xUtilityActions = refs.copySlot.current && refs.copyButton.current
    ? [{ slot: refs.copySlot.current, button: refs.copyButton.current }]
    : [];
  item._xTagContainer = refs.actionTags.current;
  item._xActionTags = switchTag ? [switchTag] : [];
  item._xHasActionTags = options.surface === 'overlay';
  if (switchTag) {
    switchTag._xAction = 'switch';
    switchTag._xSuggestion = facts.tabSuggestion;
    switchTag._xActionLabel = queryHtmlTag(switchTag, `.${surfaceClass(options, 'x-nt-suggestion-action-tag__label')}`, 'span');
  }
}

// Hover marks the row, in its brand's hover color where it has one.
function markOpenTabHover(runtime: SuggestionsRuntime, item: SuggestionElement, simpleMode: boolean): void {
  const { options } = runtime;
  item._xIsHovering = true;
  setIconEmphasis(item, true);
  runtime.updateSelection(options.getSelectedIndex());
  const selectedIndex = options.getSelectedIndex();
  if (options.items.indexOf(item) === selectedIndex || (selectedIndex === -1 && item._xIsAutocompleteTop)) {
    return;
  }
  const theme = item._xTheme;
  if (!simpleMode && theme?._xIsBrand) {
    setSurfaceStyle(options, item, '--x-nt-suggestion-hover-bg', options.getHoverColors(theme).bg || '');
  } else if (options.surface === 'overlay') {
    setSurfaceStyle(options, item, '--x-nt-suggestion-hover-bg', 'var(--x-ov-hover-bg, #F3F4F6)');
  }
  item.setAttribute('data-row-state', 'hover');
}

function OpenTabActions({ runtime, tabSuggestion, simpleMode, refs, copyableUrl, activate, onAuxClick }: {
  runtime: SuggestionsRuntime;
  tabSuggestion: Suggestion;
  simpleMode: boolean;
  refs: OpenTabRefs;
  copyableUrl: string;
  activate(event: ReactMouseEvent<HTMLElement>): void;
  onAuxClick(event: ReactMouseEvent<HTMLElement>): void;
}) {
  const { options } = runtime;
  const overlay = options.surface === 'overlay';
  const switchLabel = getActionLabel(runtime, getModifierAction(runtime, 'switch'), tabSuggestion);
  return (
    <div className={surfaceClass(options, 'x-nt-suggestion-right')} data-action-column="true">
      {overlay && (
        <div ref={refs.actionTags} className={surfaceClass(options, 'x-nt-suggestion-action-tags')} data-visible="false">
          <span ref={refs.switchActionTag} className={surfaceClass(options, 'x-nt-suggestion-action-tag')}>
            <span className={surfaceClass(options, 'x-nt-suggestion-action-tag__label')}>{switchLabel}</span>
          </span>
        </div>
      )}
      <button
        ref={refs.switchButton}
        type="button"
        className={surfaceClass(options, 'x-nt-tab-switch-button')}
        data-visible="true"
        onClick={(event) => {
          event.stopPropagation();
          activate(event);
        }}
        onAuxClick={onAuxClick}
      >
        <span ref={refs.switchButtonLabel} className={overlay ? 'x-ov-inline-label' : undefined}>
          {overlay ? switchLabel : options.t('switch_to_tab', '切换到标签页')}
        </span>
        {simpleMode && (
          <>
            {' '}
            <span className={overlay ? 'x-ov-inline-icon' : undefined}>
              <RemixIcon name="ri-arrow-right-line" size={12} />
            </span>
          </>
        )}
      </button>
      {copyableUrl && (
        <SuggestionUtilityAction
          options={options}
          itemRef={refs.item}
          slotRef={refs.copySlot}
          buttonRef={refs.copyButton}
          leading
          tooltip={options.t('search_copy_url_tooltip', '复制链接')}
          iconName="ri-file-copy-line"
          onActivate={() => {
            void options.onCopyUrl(copyableUrl);
          }}
        />
      )}
    </div>
  );
}

function OpenTabRowComponent({ runtime, tab, index, last, simpleMode }: OpenTabRowProps) {
  const { options } = runtime;
  const refs = useOpenTabRefs();
  const itemRef = refs.item;
  const iconSpec = readOpenTabIcon(options, tab);
  // One object per tab, so the row effect below reruns only when the tab
  // or its theme changes, not on every render.
  const themeSuggestion = useMemo<Suggestion>(
    () => ({ url: tab.url || '', favicon: tab.favIconUrl || '' }),
    [tab.favIconUrl, tab.url]
  );
  const localFallback = isLocalUrlSuggestion(options, themeSuggestion);
  const immediateTheme = localFallback
    ? options.urlHighlightTheme
    : options.getImmediateThemeForSuggestion(themeSuggestion) || options.defaultTheme;
  const titleText = options.sanitizeDisplayText(tab.title || options.t('untitled', '无标题'));
  const tabSuggestion = useMemo<Suggestion>(
    () => ({
      type: 'openTab',
      title: titleText,
      url: tab.url || '',
      favicon: tab.favIconUrl || '',
      _xMatchedTabId: typeof tab.id === 'number' ? tab.id : undefined
    }),
    [tab.favIconUrl, tab.id, tab.url, titleText]
  );
  const iconIsFavicon = iconSpec.kind === 'favicon';

  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }
    publishOpenTabElements(options, item, refs, tab, { index, iconIsFavicon, tabSuggestion, simpleMode });
    item._xThemeHost = options.getThemeHostForSuggestion(themeSuggestion);
    bindTextTooltip(options, refs.title.current, titleText);
    return followSiteTheme(runtime, item, themeSuggestion, immediateTheme, !localFallback);
    // The refs are stable; the row republishes when the tab or its theme changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iconIsFavicon, immediateTheme, index, localFallback, options, runtime, simpleMode, tab.id, tabSuggestion, themeSuggestion, titleText]);

  const activate = (event: ReactMouseEvent<HTMLElement>): void => {
    options.onSwitchToTab(tab, event.nativeEvent);
  };
  const handleAuxClick = (event: ReactMouseEvent<HTMLElement>): void => {
    if (event.button !== 1) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    activate(event);
  };

  return (
    <div
      ref={itemRef}
      id={`_x_extension_${options.surface === 'overlay' ? '' : 'newtab_'}suggestion_item_${index}_2024_unique_`}
      className={surfaceClass(options, 'x-nt-suggestion-item')}
      data-last={last ? 'true' : 'false'}
      data-simple-mode={simpleMode ? 'true' : 'false'}
      onMouseEnter={() => {
        if (itemRef.current) {
          markOpenTabHover(runtime, itemRef.current, simpleMode);
        }
      }}
      onMouseLeave={() => {
        if (itemRef.current) {
          itemRef.current._xIsHovering = false;
          runtime.updateSelection(options.getSelectedIndex());
        }
      }}
      onClick={activate}
      onAuxClick={handleAuxClick}
    >
      <div className={surfaceClass(options, 'x-nt-suggestion-left')}>
        <SuggestionIcon spec={iconSpec} index={index} options={options} iconSlotRef={refs.iconSlot} />
        <span ref={refs.title} className={surfaceClass(options, 'x-nt-suggestion-title')}>
          {titleText}
        </span>
        {options.isTabRankScoreDebugEnabled() && (
          <span className={surfaceClass(options, 'x-nt-tab-rank-debug')}>{options.formatTabRankDebugText(tab)}</span>
        )}
      </div>
      <OpenTabActions
        activate={activate}
        copyableUrl={String(tab.url || '').trim()}
        onAuxClick={handleAuxClick}
        refs={refs}
        runtime={runtime}
        simpleMode={simpleMode}
        tabSuggestion={tabSuggestion}
      />
    </div>
  );
}

export const OpenTabRow = memo(OpenTabRowComponent);
