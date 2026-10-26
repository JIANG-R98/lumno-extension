// The toolbar's copy in the reader's language, and its action icons.
import * as ACTION_ICON_LIBRARY from '../../domain/selection-action-icons';
import * as LocaleSettings from '../../domain/settings/locale';
import type { SelectionAction } from '../../domain/selection-intent';
import { ACTION_COPY } from './constants';
import { state } from './state';
import type { IconDefinition } from './types';

function createInlineIcon(definition: IconDefinition | undefined, className: string): SVGSVGElement | null {
  if (!definition || !definition.path) {
    return null;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add(...String(className).split(/\s+/).filter(Boolean));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('viewBox', definition.viewBox || '0 0 24 24');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', definition.path);
  svg.appendChild(path);
  return svg;
}

function buildActionIcon(action: SelectionAction): SVGSVGElement | null {
  const definitions = ACTION_ICON_LIBRARY.remix;
  return createInlineIcon(definitions[action] || definitions.ask, 'lumno-selection-action-icon');
}

function getMessage(key: string, fallback: string): string {
  const entry = state.localeMessages ? state.localeMessages[key] : undefined;
  if (entry && entry.message) {
    return entry.message;
  }
  try {
    const value = chrome.i18n && chrome.i18n.getMessage
      ? chrome.i18n.getMessage(key)
      : '';
    return value || fallback;
  } catch (_error) {
    return fallback;
  }
}

function normalizeLocale(value: unknown): string {
  return LocaleSettings.localeToHtmlLang(value);
}

function getCurrentLocale(): string {
  if (state.languageMode && state.languageMode !== 'system') {
    return normalizeLocale(state.languageMode);
  }
  try {
    if (chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
      return normalizeLocale(chrome.i18n.getUILanguage());
    }
  } catch (_error) {
    // Fall through to navigator language.
  }
  return normalizeLocale(navigator.language || 'en');
}

function getActionLabel(action: SelectionAction): string {
  const copy = ACTION_COPY[action] || ACTION_COPY.ask;
  return getMessage(copy[0], copy[1]);
}

export {
  buildActionIcon,
  createInlineIcon,
  getActionLabel,
  getCurrentLocale,
  getMessage,
  normalizeLocale
};
