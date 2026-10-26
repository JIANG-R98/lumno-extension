// The selection toolbar: offers actions for text the reader selects on a
// page. A classic content script the worker registers while the feature is
// on; the modules beside it hold its parts.
import * as FeatureSettings from '../domain/settings/features';
import * as LocaleSettings from '../domain/settings/locale';
import { claimContentScript } from '../platform/content-registry';
import { updateSelectionMark } from './selection-quick-actions/actions';
import { cancelSelectionGesture } from './selection-quick-actions/gesture';
import { setFeatureActive } from './selection-quick-actions/listeners';
import { refreshLocaleMessages } from './selection-quick-actions/actions';
import { clearOwnedSurface, updateRuntimeDebugState } from './selection-quick-actions/ownership';
import { settingsStore, state } from './selection-quick-actions/state';

function applySettings(): void {
  state.enabled = settingsStore.get(FeatureSettings.selectionQuickActionsEnabled);
  state.languageMode = settingsStore.get(LocaleSettings.language);
  refreshLocaleMessages();
  if (!state.enabled) {
    cancelSelectionGesture();
    clearOwnedSurface();
  }
  setFeatureActive(state.enabled);
  if (state.currentCandidate && state.selectionSurface && !state.selectionSurface.host.hidden) {
    updateSelectionMark();
  } else {
    updateRuntimeDebugState();
  }
}


if (claimContentScript('selection-quick-actions')) {
  const settings = [FeatureSettings.selectionQuickActionsEnabled, LocaleSettings.language];
  settingsStore.subscribe(settings, applySettings);
  void settingsStore.include(settings).then(applySettings);
}
