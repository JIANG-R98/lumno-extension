// Clips a page element into a Document Picture-in-Picture window: the user
// picks the element, and a live copy of it floats above other windows.
import type { OkReply } from '../domain/messages';
import { readPipPickerCommand } from '../domain/injected-commands';
import type { DocumentPipPickerApi } from '../types/content-apis';
import { isRecord } from './document-pip-picker/dom';
import { stopSelection, toggle } from './document-pip-picker/selection';
import { restoreSession } from './document-pip-picker/session';
import { state } from './document-pip-picker/state';
import { showVideoPiPConflictToast } from './document-pip-picker/toast';

function bindRuntimeMessageListener(): void {
  if (state.runtimeMessageHandlerBound) {
    return;
  }
  if (!chrome || !chrome.runtime || !chrome.runtime.onMessage ||
      typeof chrome.runtime.onMessage.addListener !== 'function') {
    return;
  }
  // Another tab took picture-in-picture over.
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse: (reply: OkReply) => void) => {
    if (!isRecord(message) || message.action !== 'lumno:pip-force-surrender') {
      return false;
    }
    if (state.active) {
      stopSelection({});
    }
    restoreSession({ closeWindow: true });
    sendResponse({ ok: true });
    return true;
  });
  state.runtimeMessageHandlerBound = true;
}

bindRuntimeMessageListener();

const pickerApi: Readonly<DocumentPipPickerApi> = {
  toggle: toggle,
  restore: () => restoreSession({ closeWindow: true }),
  notifyVideoPiPConflict: () => {
    if (state.active) {
      stopSelection({});
    }
    showVideoPiPConflictToast();
    return { ok: false, state: 'blocked-by-video-pip' };
  }
};

// The worker loads this module once per page (src/platform/injection.ts)
// and calls run() for each page clip command.
function run(command: unknown): unknown {
  const request = readPipPickerCommand(command);
  if (!request) {
    return { ok: false, reason: 'invalid-command' };
  }
  return request.type === 'conflict-toast' ? pickerApi.notifyVideoPiPConflict() : pickerApi.toggle();
}

export { run };
