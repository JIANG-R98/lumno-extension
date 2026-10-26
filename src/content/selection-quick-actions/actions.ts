// What the toolbar shows for a selection and the actions it sends.
import type { SelectionAction } from '../../domain/selection-intent';
import * as LumnoMessaging from '../../platform/messaging';
import { ACTION_FAILURE_DISMISS_MS, ACTION_SUCCESS_DISMISS_MS, ENTRY_DISMISS_MS, TOOLBAR_DISMISS_MS, TOOLBAR_FALLBACK_ACTIONS } from './constants';
import { isSelectionStillCurrent, resolveEntryContrastTone } from './detection';
import { applyNoTranslateDeep, clearSelectionActionHideTimer, setHostColorScheme, setHostHidden } from './host';
import { buildActionIcon, getActionLabel, getCurrentLocale, getMessage } from './locale';
import { animateToolbarEntrance, cancelToolbarEntranceAnimation, hideSurface } from './motion';
import { writeRuntimeDebugState } from './ownership';
import { state } from './state';
import { ensureSurface, positionSurface } from './surface';
import { showSelectionToast } from './toast';
import type { SelectionCandidate, SelectionSurface } from './types';

function updateSelectionMark(): void {
  if (state.selectionSurface) {
    state.selectionSurface.selectionLogo.src = chrome.runtime.getURL('assets/images/lumno-selection-mark.svg');
    state.selectionSurface.host.dataset.selectionMark = 'lumno';
    writeRuntimeDebugState(state.selectionSurface.host);
  }
}

function scheduleDismiss(delay: number): void {
  if (state.dismissTimer) {
    window.clearTimeout(state.dismissTimer);
  }
  state.dismissTimer = window.setTimeout(() => hideSurface({ immediate: false }), delay);
}

function renderCandidate(candidate: SelectionCandidate): void {
  cancelToolbarEntranceAnimation();
  const ui = ensureSurface(bindSurfaceInteractions);
  if (!ui) {
    return;
  }
  const { host, surface, mainButton, mainLabel, primaryDivider, actionsViewport, menu } = ui;
  state.currentCandidate = candidate;
  const action = candidate.classification.action;
  const label = getActionLabel(action);
  setHostHidden(host, false);
  host.dataset.iconSet = 'remix';
  const entryContrast = resolveEntryContrastTone(candidate.snapshot.element);
  host.dataset.entryContrast = entryContrast;
  setHostColorScheme(host, entryContrast === 'mixed' ? 'light dark' : entryContrast);
  host.dataset.visible = 'false';
  surface.dataset.iconOnly = 'true';
  delete surface.dataset.toolbarEntranceMode;
  updateSelectionMark();
  mainButton.hidden = false;
  mainButton.disabled = false;
  mainButton.dataset.iconOnly = 'true';
  mainButton.setAttribute('aria-label', getMessage('selection_quick_action_open_menu', '使用 Lumno 处理所选文字'));
  mainButton.setAttribute('aria-expanded', 'false');
  mainLabel.textContent = label;
  primaryDivider.hidden = true;
  actionsViewport.hidden = true;
  menu.hidden = true;
  menu.replaceChildren();
  positionSurface(candidate.rect, 'inline');
  const renderedCandidate = state.currentCandidate;
  window.requestAnimationFrame(() => {
    if (state.selectionSurface && state.currentCandidate === renderedCandidate) {
      state.selectionSurface.host.dataset.visible = 'true';
    }
  });
  scheduleDismiss(ENTRY_DISMISS_MS);
}

function buildMenuAction(action: SelectionAction): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.intent = action;
  const icon = buildActionIcon(action);
  const label = document.createElement('span');
  label.className = 'lumno-selection-action-label';
  label.textContent = getActionLabel(action);
  if (icon) {
    button.appendChild(icon);
  }
  button.appendChild(label);
  button.addEventListener('click', () => sendSelectionAction(action));
  return button;
}

function getToolbarActions(primary: SelectionAction): SelectionAction[] {
  return [primary, ...TOOLBAR_FALLBACK_ACTIONS]
    .filter((action, index, actions) => actions.indexOf(action) === index)
    .slice(0, 3);
}

function openLabsSettings(): void {
  try {
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
      action: 'openOptionsPage',
      hash: 'labs'
    });
  } catch (_error) {
    // The entry disappears even if an extension update interrupts navigation.
  }
  hideSurface();
}

function renderMenu(): void {
  const ui = state.selectionSurface;
  if (!state.currentCandidate || !ui) {
    return;
  }
  const { host, surface, mainButton, primaryDivider, actionsViewport, menu } = ui;
  const originRect = surface.dataset.iconOnly === 'true'
    ? mainButton.getBoundingClientRect()
    : null;
  const primary = state.currentCandidate.classification.action;
  const actions = getToolbarActions(primary);
  const actionButtons = actions.map(buildMenuAction);
  surface.dataset.iconOnly = 'false';
  mainButton.hidden = false;
  mainButton.dataset.iconOnly = 'false';
  mainButton.setAttribute('aria-label', getMessage('settings_tab_labs', '实验室功能'));
  mainButton.setAttribute('aria-expanded', 'true');
  menu.replaceChildren(...actionButtons);
  applyNoTranslateDeep(menu);
  host.dataset.iconSet = 'remix';
  primaryDivider.hidden = false;
  actionsViewport.hidden = false;
  menu.hidden = false;
  positionSurface(state.currentCandidate.rect, 'panel', originRect);
  menu.focus({ preventScroll: true });
  animateToolbarEntrance(originRect);
  scheduleDismiss(TOOLBAR_DISMISS_MS);
}

function renderSendingStatus(): void {
  if (!state.selectionSurface || !state.currentCandidate) {
    return;
  }
  cancelToolbarEntranceAnimation();
  state.selectionSurface.host.dataset.visible = 'false';
  setHostHidden(state.selectionSurface.host, true);
  showSelectionToast(
    getMessage('selection_quick_action_sending', '正在后台打开…'),
    { duration: ACTION_SUCCESS_DISMISS_MS }
  );
}

function renderFailureStatus(): void {
  if (state.selectionSurface) {
    state.selectionSurface.host.dataset.visible = 'false';
    setHostHidden(state.selectionSurface.host, true);
  }
  showSelectionToast(
    getMessage('selection_quick_action_failed', '发送失败，请重试。'),
    { error: true, duration: ACTION_FAILURE_DISMISS_MS }
  );
  scheduleDismiss(ACTION_FAILURE_DISMISS_MS);
}

function sendSelectionAction(action: SelectionAction): void {
  const candidate = state.currentCandidate;
  if (!candidate || !isSelectionStillCurrent(candidate)) {
    hideSurface();
    return;
  }
  const sequence = ++state.requestSequence;
  renderSendingStatus();
  clearSelectionActionHideTimer();
  const hideTimer = window.setTimeout(() => {
    if (state.selectionActionHideTimer !== hideTimer) {
      return;
    }
    state.selectionActionHideTimer = null;
    if (sequence === state.requestSequence && state.currentCandidate === candidate) {
      hideSurface({ immediate: false });
    }
  }, ACTION_SUCCESS_DISMISS_MS);
  state.selectionActionHideTimer = hideTimer;
  const renderCurrentFailure = (): void => {
    if (sequence !== state.requestSequence || state.currentCandidate !== candidate) {
      return;
    }
    clearSelectionActionHideTimer();
    renderFailureStatus();
  };
  try {
    LumnoMessaging.sendBackgroundMessage(chrome.runtime, {
      action: 'runSelectionQuickAction',
      intent: action,
      locale: getCurrentLocale(),
      text: candidate.classification.text
    }, (response) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        renderCurrentFailure();
        return;
      }
      if (!response || response.ok === false) {
        renderCurrentFailure();
      }
    });
  } catch (_error) {
    renderCurrentFailure();
  }
}

function bindSurfaceInteractions(ui: SelectionSurface): void {
  const { surface, mainButton, menu } = ui;
  surface.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  surface.addEventListener('pointerenter', () => {
    if (state.dismissTimer) {
      window.clearTimeout(state.dismissTimer);
      state.dismissTimer = null;
    }
  });
  surface.addEventListener('pointerleave', () => {
    if (state.currentCandidate) {
      scheduleDismiss(!menu.hidden ? TOOLBAR_DISMISS_MS : ENTRY_DISMISS_MS);
    }
  });
  mainButton.addEventListener('click', () => {
    if (!state.currentCandidate) {
      return;
    }
    if (surface.dataset.iconOnly === 'true') {
      renderMenu();
      return;
    }
    openLabsSettings();
  });
}

function refreshLocaleMessages(): void {
  if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
    return;
  }
  LumnoMessaging.sendBackgroundMessage(chrome.runtime, { action: 'getLocaleMessages', locale: getCurrentLocale() }, (response) => {
    if (chrome.runtime && chrome.runtime.lastError) {
      return;
    }
    state.localeMessages = response && response.messages ? response.messages : null;
    if (state.selectionSurface && !state.selectionSurface.menu.hidden && state.currentCandidate) {
      renderMenu();
    }
  });
}

export {
  refreshLocaleMessages,
  buildMenuAction,
  getToolbarActions,
  openLabsSettings,
  renderCandidate,
  renderFailureStatus,
  renderMenu,
  renderSendingStatus,
  scheduleDismiss,
  sendSelectionAction,
  updateSelectionMark
};
