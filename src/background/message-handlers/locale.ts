// Locale messages and the file access permission.
import { getExtensionDetailsUrl } from '../extension-pages';
import { checkFileSchemeAccess } from '../newtab-fallback';
import { loadLocaleMessages } from '../worker-context';
import type { HandlersFor } from '../message-router';
import type { LocaleMessage } from '../../domain/messages';

type LocaleAction = 'getLocaleMessages' | 'getFileSchemeAccessStatus';

// A page script that names the few strings it shows gets only those.
function pickLocaleMessages(messages: Record<string, LocaleMessage>, keys: unknown): Record<string, LocaleMessage> {
  if (!Array.isArray(keys)) {
    return messages;
  }
  const picked: Record<string, LocaleMessage> = {};
  const keyList: unknown[] = keys;
  keyList.forEach((key) => {
    if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(messages, key)) {
      picked[key] = messages[key];
    }
  });
  return picked;
}

// Locale messages and permission probes.
const LOCALE_AND_PERMISSION_MESSAGE_HANDLERS: HandlersFor<LocaleAction> = Object.freeze({
  getLocaleMessages(request, sender, sendResponse) {
    void loadLocaleMessages(request.locale).then((messages) => {
      sendResponse({ messages: pickLocaleMessages(messages, request.keys) });
    });
    return true;
  },
  getFileSchemeAccessStatus(request, sender, sendResponse) {
    checkFileSchemeAccess((isAllowed) => {
      sendResponse({
        ok: true,
        allowed: isAllowed === true,
        supported: isAllowed !== null,
        detailsUrl: getExtensionDetailsUrl()
      });
    });
    return true;
  }
});

export {
  LOCALE_AND_PERMISSION_MESSAGE_HANDLERS,
  pickLocaleMessages
};
export type {
  LocaleAction
};
