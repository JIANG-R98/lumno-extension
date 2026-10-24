// Firefox's "Website appearance" setting (browserSettings.
// overrideContentColorScheme): the color scheme web pages see through
// prefers-color-scheme. "auto" follows the browser theme. Chromium has no
// such setting, so the /appearance command stays hidden there.
import type { OkReply, WebAppearanceMode, WebAppearanceState } from '../domain/messages';
import type { BackgroundHandler } from './message-router';

// A Firefox browserSettings setting (types.BrowserSetting), which chrome.*
// has no counterpart for.
interface FirefoxBrowserSetting {
  get(details: Record<never, never>): Promise<{ value?: unknown; levelOfControl?: string }>;
  set(details: { value: string }): Promise<boolean>;
  clear?(details: Record<never, never>): Promise<boolean>;
}

interface WebAppearanceOptions {
  // Firefox's browser namespace.
  browserApi?: object | null;
}

interface WebAppearanceModeState {
  mode: WebAppearanceMode;
  controllable: boolean;
}

type SetModeReply = OkReply & { mode?: WebAppearanceMode; controllable?: boolean };

interface WebAppearance {
  getState(): Promise<WebAppearanceState>;
  setMode(value: unknown): Promise<SetModeReply>;
  messageHandlers: Readonly<{
    getWebAppearance: BackgroundHandler<'getWebAppearance'>;
    setWebAppearance: BackgroundHandler<'setWebAppearance'>;
  }>;
}

const MODES: readonly WebAppearanceMode[] = Object.freeze(['auto', 'light', 'dark']);

function normalizeMode(value: unknown): WebAppearanceMode | '' {
  return MODES.find((mode) => mode === value) || '';
}

function getNextMode(mode: WebAppearanceMode): WebAppearanceMode {
  const index = MODES.indexOf(mode);
  return MODES[(index + 1) % MODES.length];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isBrowserSetting(value: unknown): value is FirefoxBrowserSetting {
  return isRecord(value) && typeof value.get === 'function' && typeof value.set === 'function';
}

function create(options?: WebAppearanceOptions | null): Readonly<WebAppearance> {
  const settings = options && typeof options === 'object' ? options : {};
  // Firefox's promise-based namespace; the setting's methods take no callback.
  const browserApi = settings.browserApi ||
    (typeof browser !== 'undefined' ? browser : null);

  function getSetting(): FirefoxBrowserSetting | null {
    const browserSettings = browserApi && 'browserSettings' in browserApi ? browserApi.browserSettings : null;
    const setting = isRecord(browserSettings) ? browserSettings.overrideContentColorScheme : null;
    return isBrowserSetting(setting) ? setting : null;
  }

  function readMode(setting: FirefoxBrowserSetting): Promise<WebAppearanceModeState> {
    return Promise.resolve(setting.get({})).then((details) => ({
      mode: normalizeMode(details && details.value) || 'auto',
      // Another extension holding the setting, or a policy, blocks changes.
      controllable: Boolean(details && (
        details.levelOfControl === 'controllable_by_this_extension' ||
        details.levelOfControl === 'controlled_by_this_extension'
      ))
    }));
  }

  function getState(): Promise<WebAppearanceState> {
    const setting = getSetting();
    if (!setting) {
      return Promise.resolve({ supported: false, mode: 'auto', controllable: false });
    }
    return readMode(setting)
      .then((state): WebAppearanceState => ({ supported: true, ...state }))
      .catch((): WebAppearanceState => ({ supported: false, mode: 'auto', controllable: false }));
  }

  // "auto" first releases the setting: in the usual case the user's own
  // choice is "auto" too, and Lumno then no longer shows as controlling it
  // in Firefox's settings. It only sets "auto" when that choice differs.
  function setMode(value: unknown): Promise<SetModeReply> {
    const mode = normalizeMode(value);
    const setting = getSetting();
    if (!mode || !setting) {
      return Promise.resolve({ ok: false, reason: mode ? 'unsupported' : 'invalid-mode' });
    }
    const clear = setting.clear;
    const apply: Promise<boolean> = mode === 'auto' && typeof clear === 'function'
      ? Promise.resolve(clear.call(setting, {}))
        .then(() => readMode(setting))
        .then((state) => (state.mode === 'auto' ? true : setting.set({ value: mode })))
      : Promise.resolve(setting.set({ value: mode }));
    return apply
      .then(() => readMode(setting))
      .then((state): SetModeReply => ({ ok: state.mode === mode, mode: state.mode, controllable: state.controllable }))
      .catch((error: unknown): SetModeReply => ({
        ok: false,
        reason: error instanceof Error && error.message ? error.message : 'set-failed'
      }));
  }

  const messageHandlers: WebAppearance['messageHandlers'] = Object.freeze({
    getWebAppearance(_request, _sender, sendResponse): boolean {
      getState().then(sendResponse);
      return true;
    },
    setWebAppearance(request, _sender, sendResponse): boolean {
      setMode(request.mode).then(sendResponse);
      return true;
    }
  });

  return Object.freeze({
    getState,
    setMode,
    messageHandlers
  });
}

export { MODES, normalizeMode, getNextMode, create };
export type { WebAppearance, WebAppearanceOptions };
