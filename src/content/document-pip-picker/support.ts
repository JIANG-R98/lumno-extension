// Whether this page can open a clip window, and the picture-in-picture
// ownership shared with the other tabs.
import type { BackgroundAction, BackgroundReply, BackgroundRequest, OkReply } from '../../domain/messages';
import * as LumnoMessaging from '../../platform/messaging';
import { allowsPictureInPicture, readDocumentPictureInPicture } from '../../platform/document-picture-in-picture';
import { readErrorText } from './dom';
import { getMessage } from './locale';
import { state } from './state';
import type { SupportReason } from './types';

function getDocumentPiPSupportState(): { supported: boolean; reason: SupportReason } {
  if (window.top !== window.self) {
    return { supported: false, reason: 'not-top-level' };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: 'not-secure-context' };
  }
  if (!readDocumentPictureInPicture(window)) {
    return { supported: false, reason: 'api-unavailable' };
  }
  if (!allowsPictureInPicture(document)) {
    return { supported: false, reason: 'blocked-by-policy' };
  }
  return { supported: true, reason: 'ok' };
}

function getSupportFailureMessage(reason: SupportReason): string {
  if (reason === 'blocked-by-policy') {
    return getMessage(
      'document_pip_picker_unsupported_policy',
      'This website disables Picture-in-Picture via site policy.'
    );
  }
  if (reason === 'not-top-level') {
    return getMessage(
      'document_pip_picker_unsupported_iframe',
      'Document Picture-in-Picture only works in the top-level page.'
    );
  }
  if (reason === 'not-secure-context') {
    return getMessage(
      'document_pip_picker_unsupported_insecure',
      'Document Picture-in-Picture requires HTTPS.'
    );
  }
  return getMessage(
    'document_pip_picker_unsupported',
    'This page does not support Document Picture-in-Picture.'
  );
}

function getOpenFailureMessage(error: unknown): string {
  const name = readErrorText(error, 'name');
  if (name === 'NotAllowedError') {
    return getMessage(
      'document_pip_picker_open_failed_not_allowed',
      'The website or browser blocked opening Document Picture-in-Picture.'
    );
  }
  if (name === 'NotSupportedError') {
    return getMessage(
      'document_pip_picker_open_failed_not_supported',
      'This selection cannot be opened in Document Picture-in-Picture on this page.'
    );
  }
  if (name === 'InvalidStateError') {
    return getMessage(
      'document_pip_picker_open_failed_invalid_state',
      'A floating window is already open or the page state changed. Try again.'
    );
  }
  if (name === 'SecurityError') {
    return getMessage(
      'document_pip_picker_open_failed_security',
      'The browser blocked this action for security reasons on this page.'
    );
  }
  return getMessage(
    'document_pip_picker_open_failed',
    'Failed to open the floating content window. Try a different area'
  );
}

function hasActiveVideoPiP(): boolean {
  return Boolean(document.pictureInPictureElement);
}

// Resolves with the reply, or with { ok: false, reason } on any failure.
function sendRuntimeMessage<A extends BackgroundAction>(
  message: BackgroundRequest<A>
): Promise<BackgroundReply<A> | OkReply> {
  return new Promise((resolve) => {
    if (!chrome || !chrome.runtime || typeof chrome.runtime.sendMessage !== 'function') {
      resolve({ ok: false, reason: 'no-runtime-sendMessage' });
      return;
    }
    try {
      LumnoMessaging.sendBackgroundMessage(chrome.runtime, message, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          resolve({
            ok: false,
            reason: chrome.runtime.lastError.message || 'runtime-lastError'
          });
          return;
        }
        resolve(response && typeof response === 'object'
          ? response
          : { ok: false, reason: 'empty-response' });
      });
    } catch (error) {
      resolve({ ok: false, reason: String(error) });
    }
  });
}

async function requestDocumentPipOwnership(): Promise<{ ok: boolean; granted: boolean; reason?: string }> {
  const response = await sendRuntimeMessage({
    action: 'pipRequestOwnership',
    kind: 'document'
  });
  if (response.ok && 'granted' in response && response.granted && response.token) {
    state.ownerToken = String(response.token);
    return { ok: true, granted: true };
  }
  return {
    ok: false,
    granted: false,
    reason: response && response.reason ? String(response.reason) : 'ownership-denied'
  };
}

function releaseDocumentPipOwnership(): void {
  const token = state.ownerToken;
  state.ownerToken = '';
  if (!token) {
    return;
  }
  sendRuntimeMessage({
    action: 'pipReleaseOwnership',
    token: token
  }).catch(() => {});
}

export {
  getDocumentPiPSupportState,
  getOpenFailureMessage,
  getSupportFailureMessage,
  hasActiveVideoPiP,
  releaseDocumentPipOwnership,
  requestDocumentPipOwnership,
  sendRuntimeMessage
};
