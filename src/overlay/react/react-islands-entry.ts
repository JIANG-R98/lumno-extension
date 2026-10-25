import { createSearchInputApi } from '../../shared/react/search-input';
import { createSuggestionsViewApi } from '../../shared/react/search/suggestions';
import { createLinkPreviewViewApi } from '../../shared/react/link-preview-view';
import { createPipDockViewApi } from '../../shared/react/pip-dock-view';
import { createTabSwitcherViewApi } from '../../shared/react/tab-switcher';
import { createOverlayShellApi } from './shell';
import { createFeatureHintViewApi } from '../../shared/react/feature-hint-view';
import { createTooltipViewApi } from '../../shared/react/tooltip-view';

declare global {
  var LumnoOverlayReactBootstrap: {
      reactReady: boolean;
    } | undefined;
  var LumnoOverlayReactIslands: {
      searchInput: ReturnType<typeof createSearchInputApi>;
      shell: ReturnType<typeof createOverlayShellApi>;
      suggestions: ReturnType<typeof createSuggestionsViewApi>;
      tabSwitcher: ReturnType<typeof createTabSwitcherViewApi>;
    } | undefined;
}

const runtime = globalThis;

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
runtime.LumnoSearchInputUI = searchInputApi;
runtime.LumnoFeatureHintView = featureHintViewApi;
runtime.LumnoTooltipView = tooltipViewApi;
runtime._x_extension_createSearchInput_2024_unique_ =
  searchInputApi.createSearchInput;
runtime.LumnoOverlayShell = shellApi;
runtime.LumnoOverlaySuggestionsView = suggestionsApi;
runtime.LumnoOverlayTabSwitcherView = tabSwitcherApi;
runtime.LumnoLinkPreviewView = runtime.LumnoLinkPreviewView || createLinkPreviewViewApi();
runtime.LumnoPipDockView = runtime.LumnoPipDockView || createPipDockViewApi();
runtime.LumnoOverlayReactIslands = Object.freeze({
  searchInput: searchInputApi,
  shell: shellApi,
  suggestions: suggestionsApi,
  tabSwitcher: tabSwitcherApi
});
runtime.LumnoOverlayReactBootstrap = Object.freeze({
  reactReady: true
});
