// The theme a search suggestion row takes: the search engine's brand for
// the primary search row, the URL highlight for typed addresses, and
// otherwise its site's theme, shown at once as far as known and replaced
// once the site's icon has been read.
import { useLayoutEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import { isLocalUrlSuggestion, resolveTheme } from './action-model';
import type { Suggestion, SuggestionElement, SuggestionsRuntime, SuggestionValueRef, ThemeValue } from './types';

interface RowThemeInput {
  runtime: SuggestionsRuntime;
  suggestionRef: SuggestionValueRef;
  suggestionFingerprint: string;
  isPrimary: boolean;
  onlyKeywordSuggestions: boolean;
  simpleMode: boolean;
  itemRef: RefObject<SuggestionElement | null>;
}

// Where a row's theme comes from.
interface RowThemeSource {
  // The default search engine's brand.
  searchTheme: boolean;
  // The URL highlight theme of typed addresses and local pages.
  usesUrlFallbackTheme: boolean;
}

function readRowThemeSource(runtime: SuggestionsRuntime, suggestion: Suggestion, isPrimary: boolean,
  onlyKeywordSuggestions: boolean): RowThemeSource {
  const primarySearch = isPrimary && suggestion.type === 'googleSuggest';
  return {
    searchTheme: primarySearch || (onlyKeywordSuggestions && isPrimary && suggestion.type === 'newtab'),
    usesUrlFallbackTheme: suggestion.type === 'directUrl' || suggestion.type === 'browserPage' ||
      isLocalUrlSuggestion(runtime.options, suggestion)
  };
}

// The theme known before the site's icon has been read.
function readImmediateTheme(runtime: SuggestionsRuntime, suggestion: Suggestion, source: RowThemeSource,
  searchEngineUrl: string): ThemeValue {
  const { options } = runtime;
  let theme = options.getImmediateThemeForSuggestion(suggestion) || options.defaultTheme;
  if (source.usesUrlFallbackTheme) {
    theme = options.urlHighlightTheme;
  }
  const accent = source.searchTheme ? options.getBrandAccentForUrl(searchEngineUrl) : null;
  if (accent) {
    theme = options.buildThemeFromAccent(accent, 'brand') || options.defaultTheme;
    if (theme) {
      theme._xIsBrand = true;
    }
  }
  return theme;
}

function useRowTheme(input: RowThemeInput): RowThemeSource {
  const { runtime, suggestionRef, suggestionFingerprint, isPrimary, onlyKeywordSuggestions, simpleMode, itemRef } = input;
  const { options } = runtime;
  const suggestion = suggestionRef.current;
  const source = readRowThemeSource(runtime, suggestion, isPrimary, onlyKeywordSuggestions);
  const searchEngineUrl = options.getDefaultSearchEngineThemeUrl();
  // The memo reads the suggestion through its ref, so it is keyed on what it
  // depends on instead: the suggestion's fingerprint, or what the theme
  // comes from in place of the suggestion.
  const immediateThemeKey = source.searchTheme ? searchEngineUrl : source.usesUrlFallbackTheme ? 1 : suggestionFingerprint;
  const immediateTheme = useMemo(
    () => readImmediateTheme(runtime, suggestionRef.current, source, searchEngineUrl),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on immediateThemeKey
    [options, immediateThemeKey]
  );
  const shouldLoadTheme = !source.searchTheme &&
    (!onlyKeywordSuggestions || suggestion.type !== 'newtab') &&
    !source.usesUrlFallbackTheme;

  useLayoutEffect(() => {
    const item = itemRef.current;
    if (!item) {
      return undefined;
    }
    item._xTheme = immediateTheme;
    options.applyThemeVariables(item, immediateTheme);
    let active = true;
    if (shouldLoadTheme) {
      const latestSuggestion = suggestionRef.current;
      void options.getThemeForSuggestion(latestSuggestion).then((theme) => {
        if (!active || !item.isConnected) {
          return;
        }
        const nextTheme = resolveTheme(options, latestSuggestion, theme);
        item._xTheme = nextTheme;
        options.applyThemeVariables(item, nextTheme);
        runtime.updateSelection(options.getSelectedIndex());
      });
    }
    return () => {
      active = false;
    };
  }, [immediateTheme, itemRef, options, runtime, simpleMode, shouldLoadTheme, suggestionRef]);
  return source;
}

export { useRowTheme };
