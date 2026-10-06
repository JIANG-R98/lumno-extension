import { createSearchInputApi } from '../shared/search-input';
import { createSuggestionsViewApi } from '../search/suggestions';
import { createTabSwitcherViewApi } from './tab-switcher';
import { createOverlayShellApi } from './shell';
import { createFeatureHintViewApi } from '../shared/feature-hint-view';
import { createTooltipViewApi } from '../shared/tooltip-view';

const runtime = globalThis as typeof globalThis & {
  LumnoOverlayReactBootstrap?: {
    reactReady: boolean;
  };
  LumnoOverlayReactIslands?: {
    searchInput: ReturnType<typeof createSearchInputApi>;
    shell: ReturnType<typeof createOverlayShellApi>;
    suggestions: ReturnType<typeof createSuggestionsViewApi>;
    tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
  };
  LumnoOverlayShell?: ReturnType<typeof createOverlayShellApi>;
  LumnoOverlayShellReact?: ReturnType<typeof createOverlayShellApi>;
  LumnoSearchInputUI?: ReturnType<typeof createSearchInputApi>;
  LumnoSearchInputUIReact?: ReturnType<typeof createSearchInputApi>;
  LumnoFeatureHintView?: ReturnType<typeof createFeatureHintViewApi>;
  LumnoFeatureHintViewReact?: ReturnType<typeof createFeatureHintViewApi>;
  LumnoTooltipView?: ReturnType<typeof createTooltipViewApi>;
  LumnoTooltipViewReact?: ReturnType<typeof createTooltipViewApi>;
  LumnoOverlaySuggestionsView?: ReturnType<
    typeof createSuggestionsViewApi
  >;
  LumnoOverlaySuggestionsViewReact?: ReturnType<
    typeof createSuggestionsViewApi
  >;
  LumnoOverlayTabSwitcherView?: ReturnType<
    typeof createTabSwitcherViewApi
  >;
  LumnoOverlayTabSwitcherViewReact?: ReturnType<
    typeof createTabSwitcherViewApi
  >;
  _x_extension_createSearchInput_2024_unique_?: ReturnType<
    typeof createSearchInputApi
  >['createSearchInput'];
};

const existingIslands = runtime.LumnoOverlayReactIslands;
const searchInputApi =
  existingIslands?.searchInput || createSearchInputApi();
const shellApi =
  existingIslands?.shell ||
  createOverlayShellApi();
const suggestionsApi =
  existingIslands?.suggestions || createSuggestionsViewApi();
const tabSwitcherApi =
  existingIslands?.tabSwitcher || createTabSwitcherViewApi();
const featureHintViewApi = createFeatureHintViewApi();
const tooltipViewApi = createTooltipViewApi();
runtime.LumnoSearchInputUIReact = searchInputApi;
runtime.LumnoSearchInputUI = searchInputApi;
runtime.LumnoFeatureHintViewReact = featureHintViewApi;
runtime.LumnoFeatureHintView = featureHintViewApi;
runtime.LumnoTooltipViewReact = tooltipViewApi;
runtime.LumnoTooltipView = tooltipViewApi;
runtime._x_extension_createSearchInput_2024_unique_ =
  searchInputApi.createSearchInput;
runtime.LumnoOverlayShellReact = shellApi;
runtime.LumnoOverlayShell = shellApi;
runtime.LumnoOverlaySuggestionsViewReact = suggestionsApi;
runtime.LumnoOverlaySuggestionsView = suggestionsApi;
runtime.LumnoOverlayTabSwitcherViewReact = tabSwitcherApi;
runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
runtime.LumnoOverlayReactIslands = Object.freeze({
  searchInput: searchInputApi,
  shell: shellApi,
  suggestions: suggestionsApi,
  tabSwitcher: tabSwitcherApi
});
runtime.LumnoOverlayReactBootstrap = Object.freeze({
  reactReady: true
});
