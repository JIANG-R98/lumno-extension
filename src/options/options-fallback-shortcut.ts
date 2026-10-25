// The editable "open search" shortcut on the Shortcuts tab. The browser
// owns the real command; the page shows its current chord, records a new
// one from a keydown while the field has focus, and stores it under the
// fallback-shortcut key for the background to apply.
import type * as Settings from '../domain/settings';
import type { StorageAreaLike } from '../domain/storage-port';
import { isElementNode } from '../shared/dom-guards';
import type * as ShortcutKeys from './options-shortcut-keys';
import type { GetMessage } from './options-types';
import type { ShortcutHotkeyController } from './react/shortcut-hotkey';

// The parts of chrome the section uses; commands is missing in some browsers.
interface FallbackShortcutChromeApi {
  commands?: {
    getAll(callback: (commands: Array<{ name?: string; shortcut?: string }>) => void): void;
  };
  runtime: { lastError?: { message?: string } | null };
}

interface FallbackShortcutElements {
  fallbackShortcutInput: HTMLInputElement | null;
  fallbackShortcutWrap: HTMLElement | null;
  clearShortcutButton: HTMLElement | null;
  resetShortcutButton: HTMLElement | null;
  shortcutsStatus: HTMLElement | null;
}

interface FallbackShortcutOptions {
  elements: FallbackShortcutElements;
  // React view of the keycaps.
  shortcutHotkeyController: Pick<ShortcutHotkeyController, 'render'> | null;
  chromeApi: FallbackShortcutChromeApi;
  settings: Pick<typeof Settings, 'FALLBACK_SHORTCUT_STORAGE_KEY'>;
  storageArea: StorageAreaLike | null;
  isMacPlatform: boolean;
  shortcutKeys: Pick<typeof ShortcutKeys, 'buildShortcutFromEvent' | 'normalizeFallbackShortcut' | 'getShortcutDisplayTokens'>;
  formatShortcutForDisplay(shortcut: string): string;
  getMessage: GetMessage;
  showToast(message: string, isError?: boolean): void;
  documentObj: Document;
  windowObj: Window;
}

function createFallbackShortcutSection(options: FallbackShortcutOptions) {
  const {
    fallbackShortcutInput,
    fallbackShortcutWrap,
    clearShortcutButton,
    resetShortcutButton,
    shortcutsStatus
  } = options.elements;
  const {
    formatShortcutForDisplay,
    getMessage,
    isMacPlatform,
    shortcutHotkeyController,
    showToast,
    storageArea
  } = options;
  const SHORTCUT_KEYS = options.shortcutKeys;
  const { buildShortcutFromEvent, normalizeFallbackShortcut } = SHORTCUT_KEYS;
  const chrome = options.chromeApi;
  const FALLBACK_SHORTCUT_STORAGE_KEY = options.settings.FALLBACK_SHORTCUT_STORAGE_KEY;
  const documentObj = options.documentObj;
  const windowObj = options.windowObj;
  let currentShortcutLabel: string | null = null;
  let isCapturingFallbackShortcut = false;
  let cancelCaptureOnMouseLeave = false;
  let fallbackCaptureStopTimer: number | null = null;

  function refreshShortcutsStatus(): void {
    if (!shortcutsStatus) return;
    shortcutsStatus.textContent = currentShortcutLabel
      ? (formatShortcutForDisplay(currentShortcutLabel) || currentShortcutLabel)
      : getMessage('settings_shortcuts_unset', '未设置');
  }

  function getDefaultFallbackShortcut(): string {
    return isMacPlatform ? 'Command+Shift+K' : 'Ctrl+Shift+K';
  }

  function renderFallbackShortcutTokens(shortcut: string, animate?: boolean): void {
    if (!shortcutHotkeyController) {
      return;
    }
    const tokens = SHORTCUT_KEYS.getShortcutDisplayTokens(shortcut, { macSymbols: isMacPlatform });
    const emptyPlaceholder = isCapturingFallbackShortcut
      ? (fallbackShortcutInput ? (fallbackShortcutInput.getAttribute('placeholder') || '') : '')
      : getMessage('settings_shortcuts_empty_state', '无');
    shortcutHotkeyController.render({
      animate: Boolean(animate),
      placeholder: emptyPlaceholder,
      tokens
    });
  }

  function setFallbackShortcutLabel(value: string, animate?: boolean): void {
    currentShortcutLabel = value || '';
    if (fallbackShortcutInput) {
      fallbackShortcutInput.value = '';
    }
    renderFallbackShortcutTokens(currentShortcutLabel, animate);
    updateFallbackShortcutResetVisibility();
    refreshShortcutsStatus();
  }

  function updateFallbackShortcutResetVisibility(): void {
    if (!resetShortcutButton) {
      return;
    }
    const normalizedCurrent = normalizeFallbackShortcut(currentShortcutLabel || '');
    const normalizedDefault = normalizeFallbackShortcut(getDefaultFallbackShortcut());
    const canReset = normalizedCurrent !== normalizedDefault;
    resetShortcutButton.setAttribute('data-can-reset', canReset ? 'true' : 'false');
    if (canReset) {
      resetShortcutButton.removeAttribute('disabled');
    } else {
      resetShortcutButton.setAttribute('disabled', 'disabled');
    }
  }

  function stopFallbackShortcutCapture(): void {
    if (fallbackCaptureStopTimer) {
      windowObj.clearTimeout(fallbackCaptureStopTimer);
      fallbackCaptureStopTimer = null;
    }
    isCapturingFallbackShortcut = false;
    cancelCaptureOnMouseLeave = false;
    if (fallbackShortcutWrap) {
      fallbackShortcutWrap.removeAttribute('data-capturing');
    }
    if (fallbackShortcutInput && documentObj.activeElement === fallbackShortcutInput) {
      fallbackShortcutInput.blur();
    }
    if (!currentShortcutLabel) {
      renderFallbackShortcutTokens('');
    }
  }

  function stopFallbackShortcutCaptureDeferred(delayMs: number): void {
    if (fallbackCaptureStopTimer) {
      windowObj.clearTimeout(fallbackCaptureStopTimer);
      fallbackCaptureStopTimer = null;
    }
    fallbackCaptureStopTimer = windowObj.setTimeout(() => {
      fallbackCaptureStopTimer = null;
      stopFallbackShortcutCapture();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function persistFallbackShortcut(value: string, onDone: (ok: boolean) => void): void {
    if (!storageArea) {
      onDone(true);
      return;
    }
    storageArea.set({ [FALLBACK_SHORTCUT_STORAGE_KEY]: value }, () => {
      onDone(!chrome.runtime.lastError);
    });
  }

  function loadCurrentShortcut(): void {
    const defaultShortcut = getDefaultFallbackShortcut();
    if (!chrome.commands || typeof chrome.commands.getAll !== 'function') {
      setFallbackShortcutLabel(defaultShortcut);
      return;
    }
    chrome.commands.getAll((commands) => {
      if (chrome.runtime.lastError) {
        setFallbackShortcutLabel(defaultShortcut);
        return;
      }
      const items = Array.isArray(commands) ? commands : [];
      const command = items.find((item) => item && item.name === 'show-search');
      const shortcut = command && typeof command.shortcut === 'string'
        ? command.shortcut.trim()
        : '';
      const effectiveShortcut = shortcut || defaultShortcut;
      setFallbackShortcutLabel(effectiveShortcut);
    });
  }

  // Records a chord from keydown while the field is focused; Escape cancels.
  function bindControls(): void {
    if (fallbackShortcutInput) {
      const handleFallbackShortcutKeydown = (event: KeyboardEvent): void => {
        if (event.key === 'Tab') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (event.key === 'Escape') {
          fallbackShortcutInput.value = '';
          renderFallbackShortcutTokens(currentShortcutLabel || getDefaultFallbackShortcut());
          stopFallbackShortcutCapture();
          return;
        }
        const nextShortcut = buildShortcutFromEvent(event);
        if (nextShortcut) {
          fallbackShortcutInput.value = '';
          const normalized = normalizeFallbackShortcut(nextShortcut);
          if (!normalized) {
            return;
          }
          if (normalized === currentShortcutLabel) {
            renderFallbackShortcutTokens(normalized, true);
            stopFallbackShortcutCaptureDeferred(260);
            return;
          }
          setFallbackShortcutLabel(normalized, true);
          persistFallbackShortcut(normalized, (ok) => {
            if (!ok) {
              showToast(getMessage('toast_error', '操作失败，请重试。'), true);
            }
          });
          stopFallbackShortcutCaptureDeferred(260);
        }
      };
      const captureWindowKeydown = (event: KeyboardEvent): void => {
        if (!isCapturingFallbackShortcut) {
          return;
        }
        handleFallbackShortcutKeydown(event);
      };
      windowObj.addEventListener('keydown', captureWindowKeydown, true);
      if (fallbackShortcutWrap) {
        fallbackShortcutWrap.addEventListener('pointerdown', (event) => {
          const target = event.target;
          if (isElementNode(target) && target.closest('button')) {
            return;
          }
          event.preventDefault();
          fallbackShortcutInput.focus();
        });
        fallbackShortcutWrap.addEventListener('mouseleave', () => {
          if (!cancelCaptureOnMouseLeave) {
            return;
          }
          cancelCaptureOnMouseLeave = false;
          stopFallbackShortcutCapture();
        });
      }
      fallbackShortcutInput.addEventListener('focus', () => {
        isCapturingFallbackShortcut = true;
        if (fallbackShortcutWrap) {
          fallbackShortcutWrap.setAttribute('data-capturing', 'true');
        }
        fallbackShortcutInput.value = '';
        if (!currentShortcutLabel) {
          renderFallbackShortcutTokens('');
        }
      });
      fallbackShortcutInput.addEventListener('blur', () => {
        stopFallbackShortcutCapture();
      });
      fallbackShortcutInput.addEventListener('input', () => {
        fallbackShortcutInput.value = '';
      });
      fallbackShortcutInput.addEventListener('keydown', handleFallbackShortcutKeydown);
    }

    if (clearShortcutButton) {
      clearShortcutButton.addEventListener('click', () => {
        setFallbackShortcutLabel('');
        persistFallbackShortcut('', (ok) => {
          if (!ok) {
            showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          }
        });
        cancelCaptureOnMouseLeave = true;
        if (fallbackShortcutInput) {
          fallbackShortcutInput.focus();
        }
      });
    }

    if (resetShortcutButton) {
      resetShortcutButton.addEventListener('click', () => {
        const defaultShortcut = getDefaultFallbackShortcut();
        setFallbackShortcutLabel(defaultShortcut, true);
        persistFallbackShortcut(defaultShortcut, (ok) => {
          if (!ok) {
            showToast(getMessage('toast_error', '操作失败，请重试。'), true);
          }
        });
        cancelCaptureOnMouseLeave = true;
        if (fallbackShortcutInput) {
          fallbackShortcutInput.focus();
        }
      });
    }
  }

  return Object.freeze({
    bindControls,
    loadCurrentShortcut,
    refreshShortcutsStatus,
    // Re-renders the keycaps, for example after a language change.
    renderTokens: () => renderFallbackShortcutTokens(currentShortcutLabel || '')
  });
}

export { createFallbackShortcutSection };
export type { FallbackShortcutChromeApi, FallbackShortcutElements, FallbackShortcutOptions };
