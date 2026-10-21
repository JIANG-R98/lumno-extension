import { Fragment } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { createHelpPassageCard, isHelpPassage } from './help-passage-card';
import type {
  NormalizedOptions,
  SuggestionsViewOptions,
  Suggestion,
  SuggestionsRuntime,
  SuggestionElement,
  SuggestionActionTagElement,
  OpenTabSuggestion,
  SuggestionsViewController,
  SuggestionValueRef,
  SuggestionsRenderPayload,
  ModifierState
} from './suggestion-list/types';
import {
  surfaceClass,
  normalizeOptions,
  createQueryStore
} from './suggestion-list/surface-options';
import { getHighlightedParts } from './suggestion-list/highlight';
import { updateSelectionForRuntime, syncModifierLabels } from './suggestion-list/action-styles';
import { SearchSuggestionRow } from './suggestion-list/search-suggestion-row';
import { OpenTabRow } from './suggestion-list/open-tab-row';
import { EmptyState, getHelpGroupCaptionStart } from './suggestion-list/empty-state';
export type {
  SuggestionsSurface,
  SuggestionUpdateKind,
  Suggestion,
  OpenTabSuggestion,
  SuggestionActionTagElement,
  SuggestionElement,
  SuggestionsRenderPayload,
  SuggestionsViewOptions,
  SuggestionsViewController
} from './suggestion-list/types';

function syncItems(options: NormalizedOptions): void {
  options.items.length = 0;
  options.container
    .querySelectorAll<SuggestionElement>(
      `.${surfaceClass(options, 'x-nt-suggestion-item')}`
    )
    .forEach((item) => options.items.push(item));
}

function createNoopController(
  rawOptions: SuggestionsViewOptions
): SuggestionsViewController {
  const items = Array.isArray(rawOptions.items)
    ? rawOptions.items
    : [];
  return {
    render() {},
    renderTabs() {},
    updateSelection() {},
    setOpenInCurrentTabModifierActive() {},
    setOpenSwitchInNewTabModifierActive() {},
    setOpenInBackgroundTabModifierActive() {},
    clear() {
      items.length = 0;
    },
    destroy() {
      items.length = 0;
    },
    getAutoHighlightIndex() {
      return -1;
    },
    markAutocompleteTop() {},
    getItems() {
      return items;
    }
  };
}

function getStableRenderKeys<T>(
  values: T[],
  getIdentity: (value: T) => string
): string[] {
  const occurrences = new Map<string, number>();
  return values.map((value) => {
    const identity = getIdentity(value);
    const occurrence = occurrences.get(identity) || 0;
    occurrences.set(identity, occurrence + 1);
    return `${identity}:occurrence:${occurrence}`;
  });
}

function updateSuggestionValueRefs(
  previous: Map<string, SuggestionValueRef>,
  renderKeys: string[],
  suggestions: Suggestion[]
): {
  refs: SuggestionValueRef[];
  byKey: Map<string, SuggestionValueRef>;
} {
  const byKey = new Map<string, SuggestionValueRef>();
  const refs = renderKeys.map((key, index) => {
    const valueRef = previous.get(key) || {
      current: suggestions[index]
    };
    valueRef.current = suggestions[index];
    byKey.set(key, valueRef);
    return valueRef;
  });
  return { refs, byKey };
}

function syncLatestSuggestionMetadata(
  options: NormalizedOptions,
  suggestions: Suggestion[]
): void {
  options.items.forEach((item, index) => {
    const suggestion = suggestions[index];
    if (!suggestion) {
      return;
    }
    item._xSuggestion = suggestion;
    item._xActionTags?.forEach((tag) => {
      tag._xSuggestion = suggestion;
    });
  });
}

export function createSuggestionsView(
  rawOptions: SuggestionsViewOptions = {}
): SuggestionsViewController {
  const normalizedOptions = normalizeOptions(rawOptions);
  if (!normalizedOptions) {
    return createNoopController(rawOptions);
  }
  const options: NormalizedOptions = normalizedOptions;
  if (
    typeof options.actionModel.getSuggestionStructureIdentity !== 'function' ||
    typeof options.actionModel.getSuggestionPresentationFingerprint !== 'function'
  ) {
    return createNoopController(rawOptions);
  }
  const getSuggestionStructureIdentity =
    options.actionModel.getSuggestionStructureIdentity;
  const getSuggestionPresentationFingerprint =
    options.actionModel.getSuggestionPresentationFingerprint;
  const root: Root = createRoot(options.container);
  const queryStore = createQueryStore();
  options.container.setAttribute(
    'data-react-island',
    'suggestions'
  );
  let destroyed = false;
  let lastRenderWasSuggestions = false;
  let lastSimpleModeEnabled = options.isSimpleModeEnabled();
  let suggestionValueRefs = new Map<string, SuggestionValueRef>();
  let pendingTabRenderTask: {
    id: number;
    kind: 'idle' | 'timeout';
  } | null = null;
  let tabRenderGeneration = 0;
  const helpPassage = createHelpPassageCard({
    document: options.document,
    getHost: rawOptions.getHelpPassageHost || (() => options.document.body),
    getList: () => options.container,
    highlight: (text) => getHighlightedParts(options, text, queryStore.getSnapshot())
  });
  // A help center result shows its passage while it is hovered, or picked with the arrow keys.
  function syncHelpPassage(selectedIndex?: number): void {
    const hovered = options.items.find((item) => item._xIsHovering);
    const row = hovered || (Number.isInteger(selectedIndex) ? options.items[Number(selectedIndex)] : undefined);
    const suggestion = row?._xSuggestion;
    if (!row || suggestion?.type !== 'helpArticle' || !isHelpPassage(suggestion.context)) {
      helpPassage.hide();
      return;
    }
    helpPassage.show(row, suggestion.context, { delay: Boolean(hovered) });
  }
  options.container.addEventListener('scroll', () => helpPassage.place(), { passive: true });
  const runtime: SuggestionsRuntime = {
    options,
    queryStore,
    modifiers: {
      openInCurrentTab: false,
      openSwitchInNewTab: false,
      openInBackgroundTab: false
    },
    updateSelection(index) {
      updateSelectionForRuntime(runtime, index);
      syncHelpPassage(index);
    }
  };

  function cancelPendingTabRender(): void {
    tabRenderGeneration += 1;
    if (pendingTabRenderTask === null) {
      return;
    }
    const windowRef = options.document.defaultView;
    if (windowRef) {
      if (
        pendingTabRenderTask.kind === 'idle' &&
        typeof windowRef.cancelIdleCallback === 'function'
      ) {
        windowRef.cancelIdleCallback(pendingTabRenderTask.id);
      } else {
        windowRef.clearTimeout(pendingTabRenderTask.id);
      }
    }
    pendingTabRenderTask = null;
  }

  function clear(): void {
    if (destroyed) {
      return;
    }
    cancelPendingTabRender();
    options.hideTopActionTooltip();
    helpPassage.hide();
    flushSync(() => root.render(null));
    lastRenderWasSuggestions = false;
    suggestionValueRefs.clear();
    options.items.length = 0;
    options.onSetSelectedIndex(-1);
    options.setSuggestionsVisible(false);
  }

  function render(
    payload: SuggestionsRenderPayload = {}
  ): void {
    if (destroyed) {
      return;
    }
    cancelPendingTabRender();
    const suggestions = Array.isArray(payload.suggestions)
      ? payload.suggestions
      : [];
    const query = payload.query || '';
    const simpleMode = options.isSimpleModeEnabled();
    const renderKeys = getStableRenderKeys(
      suggestions,
      getSuggestionStructureIdentity
    );
    const nextValueRefs = updateSuggestionValueRefs(
      suggestionValueRefs,
      renderKeys,
      suggestions
    );
    suggestionValueRefs = nextValueRefs.byKey;
    if (
      payload.updateKind === 'highlight' &&
      lastRenderWasSuggestions &&
      simpleMode === lastSimpleModeEnabled
    ) {
      flushSync(() => queryStore.set(query));
      syncLatestSuggestionMetadata(options, suggestions);
      return;
    }
    queryStore.set(query);
    const primaryHighlightIndex =
      Number.isInteger(payload.primaryHighlightIndex)
        ? Number(payload.primaryHighlightIndex)
        : -1;
    const preserveSelection = payload.updateKind
      ? payload.updateKind !== 'structure'
      : Boolean(payload.canAppend);
    if (!preserveSelection) {
      options.onSetSelectedIndex(-1);
    }
    if (suggestions.length === 0 && payload.emptyMessage) {
      flushSync(() => {
        root.render(
          <EmptyState
            key="empty"
            options={options}
            message={payload.emptyMessage || ''}
          />
        );
      });
      options.items.length = 0;
      lastRenderWasSuggestions = false;
      options.onSetSelectedIndex(-1);
      options.setSuggestionsVisible(true);
      return;
    }
    flushSync(() => {
      root.render(
        suggestions.map((suggestion, index) => {
          const caption = getHelpGroupCaptionStart(suggestions, index);
          return (
          <Fragment key={renderKeys[index]}>
            {caption && (
              <div
                className={surfaceClass(options, 'x-nt-suggestion-caption')}
                role="presentation"
              >
                {options.t(caption[0], caption[1])}
              </div>
            )}
            <SearchSuggestionRow
              runtime={runtime}
              suggestionRef={nextValueRefs.refs[index]}
              suggestionFingerprint={getSuggestionPresentationFingerprint(
                suggestion,
                {
                  includeDebugReasons: options.isTabRankScoreDebugEnabled()
                }
              )}
              index={index}
              isPrimary={index === primaryHighlightIndex}
              primaryHighlightReason={
                payload.primaryHighlightReason || 'none'
              }
              isMergedHighlight={Boolean(
                payload.mergedProvider &&
                payload.primarySuggestion === suggestion &&
                index === primaryHighlightIndex
              )}
              onlyKeywordSuggestions={Boolean(
                payload.onlyKeywordSuggestions
              )}
              last={index === suggestions.length - 1}
              simpleMode={simpleMode}
            />
          </Fragment>
          );
        })
      );
    });
    syncItems(options);
    syncLatestSuggestionMetadata(options, suggestions);
    lastRenderWasSuggestions = true;
    lastSimpleModeEnabled = simpleMode;
    runtime.updateSelection(options.getSelectedIndex());
  }

  function renderTabs(
    tabList: OpenTabSuggestion[] = []
  ): void {
    if (destroyed) {
      return;
    }
    cancelPendingTabRender();
    suggestionValueRefs.clear();
    const tabs = Array.isArray(tabList)
      ? tabList.slice(
          0,
          Math.max(1, options.openTabSuggestionLimit)
        )
      : [];
    const simpleMode = options.isSimpleModeEnabled();
    const renderKeys = getStableRenderKeys(
      tabs,
      (tab) =>
        typeof tab.id === 'number'
          ? `tab:id:${tab.id}`
          : `tab:url:${String(tab.url || '')}:title:${String(
              tab.title || ''
            )}`
    );
    const windowRef = options.document.defaultView;
    const initialRenderLimit = options.getOpenTabInitialRenderLimit();
    const initialRenderCount = windowRef
      ? Math.min(
          tabs.length,
          Math.max(1, initialRenderLimit)
        )
      : tabs.length;
    let renderedCount = initialRenderCount;
    const preloadTabRange = (start: number, end: number): void => {
      tabs.slice(start, end).forEach((tab) => {
        if (tab.favIconUrl) {
          options.preloadIcon(
            String(tab.favIconUrl),
            String(tab.url || '')
          );
        }
      });
    };
    const commitTabRows = (count: number): void => {
      flushSync(() => {
        root.render(
          tabs.slice(0, count).map((tab, index) => (
            <OpenTabRow
              key={renderKeys[index]}
              runtime={runtime}
              tab={tab}
              index={index}
              last={index === count - 1 && count === tabs.length}
              simpleMode={simpleMode}
            />
          ))
        );
      });
      syncItems(options);
      runtime.updateSelection(options.getSelectedIndex());
    };
    options.onSetSelectedIndex(-1);
    preloadTabRange(0, initialRenderCount);
    commitTabRows(initialRenderCount);
    lastRenderWasSuggestions = false;
    lastSimpleModeEnabled = simpleMode;
    options.setSuggestionsVisible(tabs.length > 0);
    if (renderedCount >= tabs.length || !windowRef) {
      return;
    }
    const generation = tabRenderGeneration;
    const scheduleNextBatch = (): void => {
      if (generation !== tabRenderGeneration || destroyed) {
        return;
      }
      const renderNextBatch = (): void => {
        pendingTabRenderTask = null;
        if (generation !== tabRenderGeneration || destroyed) {
          return;
        }
        const nextCount = Math.min(
          tabs.length,
          renderedCount + Math.max(1, options.getOpenTabRenderBatchSize())
        );
        preloadTabRange(renderedCount, nextCount);
        renderedCount = nextCount;
        commitTabRows(renderedCount);
        if (renderedCount < tabs.length) {
          scheduleNextBatch();
        }
      };
      // Rows below the visible viewport are non-critical. Scheduling their
      // synchronous React commits on animation frames competes directly with
      // the host page while it is loading, so only fill them when Chromium
      // reports idle time. The timeout fallback still yields multiple frames
      // in browsers without requestIdleCallback.
      if (typeof windowRef.requestIdleCallback === 'function') {
        pendingTabRenderTask = {
          id: windowRef.requestIdleCallback(renderNextBatch, {
            timeout: 500
          }),
          kind: 'idle'
        };
      } else {
        pendingTabRenderTask = {
          id: windowRef.setTimeout(renderNextBatch, 48),
          kind: 'timeout'
        };
      }
    };
    scheduleNextBatch();
  }

  function setModifier(
    key: keyof ModifierState,
    active: boolean
  ): void {
    const next = Boolean(active);
    if (runtime.modifiers[key] === next) {
      return;
    }
    runtime.modifiers[key] = next;
    syncModifierLabels(runtime);
  }

  return {
    render,
    renderTabs,
    updateSelection(index) {
      runtime.updateSelection(index);
    },
    setOpenInCurrentTabModifierActive(active) {
      setModifier('openInCurrentTab', active);
    },
    setOpenSwitchInNewTabModifierActive(active) {
      setModifier('openSwitchInNewTab', active);
    },
    setOpenInBackgroundTabModifierActive(active) {
      setModifier('openInBackgroundTab', active);
    },
    clear,
    destroy() {
      if (destroyed) {
        return;
      }
      cancelPendingTabRender();
      options.hideTopActionTooltip();
      helpPassage.destroy();
      flushSync(() => root.unmount());
      destroyed = true;
      lastRenderWasSuggestions = false;
      options.items.length = 0;
      options.onSetSelectedIndex(-1);
      options.setSuggestionsVisible(false);
    },
    getAutoHighlightIndex() {
      return options.items.findIndex(
        (item) => Boolean(item?._xIsAutocompleteTop)
      );
    },
    markAutocompleteTop(index) {
      options.items.forEach((item, itemIndex) => {
        item._xIsAutocompleteTop = itemIndex === index;
      });
    },
    getItems() {
      return options.items;
    }
  };
}

export function createSuggestionsViewApi() {
  return Object.freeze({
    implementation: 'react',
    createSuggestionsView(options?: SuggestionsViewOptions) {
      return createSuggestionsView(options);
    }
  });
}
