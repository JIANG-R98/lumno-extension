// @ts-nocheck
// Firefox's "Website appearance" setting (browserSettings.
// overrideContentColorScheme): the color scheme web pages see through
// prefers-color-scheme. "auto" follows the browser theme. Chromium has no
// such setting, so the /appearance command stays hidden there.
const MODES = Object.freeze(['auto', 'light', 'dark']);

function normalizeMode(value) {
  return MODES.includes(value) ? value : '';
}

function getNextMode(mode) {
  const index = MODES.indexOf(mode);
  return MODES[(index + 1) % MODES.length];
}

function create(options) {
  const settings = options && typeof options === 'object' ? options : {};
  // Firefox's promise-based namespace; the setting's methods take no callback.
  const browserApi = settings.browserApi ||
    (typeof browser !== 'undefined' ? browser : null);

  function getSetting() {
    const setting = browserApi && browserApi.browserSettings &&
      browserApi.browserSettings.overrideContentColorScheme;
    return setting && typeof setting.get === 'function' && typeof setting.set === 'function'
      ? setting
      : null;
  }

  function readMode(setting) {
    return Promise.resolve(setting.get({})).then((details) => ({
      mode: normalizeMode(details && details.value) || 'auto',
      // Another extension holding the setting, or a policy, blocks changes.
      controllable: Boolean(details && (
        details.levelOfControl === 'controllable_by_this_extension' ||
        details.levelOfControl === 'controlled_by_this_extension'
      ))
    }));
  }

  function getState() {
    const setting = getSetting();
    if (!setting) {
      return Promise.resolve({ supported: false, mode: 'auto', controllable: false });
    }
    return readMode(setting)
      .then((state) => ({ supported: true, ...state }))
      .catch(() => ({ supported: false, mode: 'auto', controllable: false }));
  }

  // "auto" first releases the setting: in the usual case the user's own
  // choice is "auto" too, and Lumno then no longer shows as controlling it
  // in Firefox's settings. It only sets "auto" when that choice differs.
  function setMode(value) {
    const mode = normalizeMode(value);
    const setting = getSetting();
    if (!mode || !setting) {
      return Promise.resolve({ ok: false, reason: mode ? 'unsupported' : 'invalid-mode' });
    }
    const apply = mode === 'auto' && typeof setting.clear === 'function'
      ? Promise.resolve(setting.clear({}))
        .then(() => readMode(setting))
        .then((state) => (state.mode === 'auto' ? true : setting.set({ value: mode })))
      : Promise.resolve(setting.set({ value: mode }));
    return apply
      .then(() => readMode(setting))
      .then((state) => ({ ok: state.mode === mode, mode: state.mode, controllable: state.controllable }))
      .catch((error) => ({
        ok: false,
        reason: error && error.message ? error.message : 'set-failed'
      }));
  }

  const messageHandlers = Object.freeze({
    getWebAppearance(request, sender, sendResponse) {
      getState().then(sendResponse);
      return true;
    },
    setWebAppearance(request, sender, sendResponse) {
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
