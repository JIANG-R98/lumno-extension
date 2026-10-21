const CHANNEL = 'lumno.codex.debug';
const VERSION = 1;
const SURFACE_PORT_NAME = 'lumno-codex-debug-surface-v1';
const DEFAULT_REQUEST_TIMEOUT_MS = 4000;
const OFFICIAL_CODEX_EXTENSION_IDS = Object.freeze([
  'hehggadaopoacecdllhhajmbjkdcmajg',
  'lfkehkpjohcoelkpembgemeipeppanef'
]);
const SURFACE_METHODS = Object.freeze([
  'surface.snapshot',
  'surface.query',
  'surface.action',
  'surface.profileAction',
  'surface.performance',
  'surface.performancePanel',
  'surface.performanceRecording',
  'surface.startupSamples',
  'surface.waitFor',
  'surface.logs'
]);

function getManifest(chromeApi) {
  try {
    if (chromeApi && chromeApi.runtime && typeof chromeApi.runtime.getManifest === 'function') {
      return chromeApi.runtime.getManifest() || {};
    }
  } catch (error) {
    return {};
  }
  return {};
}

function getAllowedClientIds(manifest) {
  const externallyConnectable = manifest && manifest.externally_connectable;
  const ids = externallyConnectable && Array.isArray(externallyConnectable.ids)
    ? externallyConnectable.ids
    : [];
  return ids.filter((id) => OFFICIAL_CODEX_EXTENSION_IDS.includes(String(id || '')));
}

function isDevelopmentBridgeEnabled(chromeApi) {
  const manifest = getManifest(chromeApi);
  return Boolean(String(manifest.key || '').trim() && getAllowedClientIds(manifest).length > 0);
}

function create(options) {
  const bridgeOptions = options && typeof options === 'object' ? options : {};
  const chromeApi = bridgeOptions.chromeApi || null;
  const requestTimeoutMs = Math.max(
    250,
    Number(bridgeOptions.requestTimeoutMs) || DEFAULT_REQUEST_TIMEOUT_MS
  );
  const setTimer = typeof bridgeOptions.setTimeoutImpl === 'function'
    ? bridgeOptions.setTimeoutImpl
    : setTimeout;
  const clearTimer = typeof bridgeOptions.clearTimeoutImpl === 'function'
    ? bridgeOptions.clearTimeoutImpl
    : clearTimeout;
  const surfaces = new Map();
  const pendingRequests = new Map();
  let requestSequence = 0;
  let attached = false;

  function isEnabled() {
    return isDevelopmentBridgeEnabled(chromeApi);
  }

  function isAllowedSender(sender) {
    if (!sender || !sender.id) {
      return false;
    }
    return getAllowedClientIds(getManifest(chromeApi)).includes(String(sender.id));
  }

  function getSurfaceSummary(record) {
    return {
      surfaceId: record.surfaceId,
      type: record.type,
      tabId: record.tabId,
      frameId: record.frameId,
      documentId: record.documentId,
      url: record.url,
      title: record.title,
      readyState: record.readyState,
      connectedAt: record.connectedAt,
      updatedAt: record.updatedAt
    };
  }

  function listSurfaces() {
    return Array.from(surfaces.values())
      .map(getSurfaceSummary)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  function normalizeRegistration(port, message) {
    const sender = port && port.sender ? port.sender : {};
    const senderTab = sender.tab && typeof sender.tab === 'object' ? sender.tab : {};
    const surfaceId = String(message && message.surfaceId || '').trim();
    if (!surfaceId) {
      return null;
    }
    const now = Date.now();
    return {
      surfaceId,
      type: String(message.pageType || message.surfaceType || 'unknown').slice(0, 64),
      tabId: typeof senderTab.id === 'number' ? senderTab.id : null,
      frameId: typeof sender.frameId === 'number' ? sender.frameId : 0,
      documentId: typeof sender.documentId === 'string' ? sender.documentId : '',
      url: String(message.url || sender.url || senderTab.url || '').slice(0, 4096),
      title: String(message.title || senderTab.title || '').slice(0, 1024),
      readyState: String(message.readyState || '').slice(0, 32),
      connectedAt: now,
      updatedAt: now,
      port
    };
  }

  function clearPendingRequest(requestId, response) {
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    pendingRequests.delete(requestId);
    if (pending.timer) {
      clearTimer(pending.timer);
    }
    pending.sendResponse(response);
  }

  function rejectPendingForSurface(surfaceId, code) {
    Array.from(pendingRequests.entries()).forEach(([requestId, pending]) => {
      if (!pending || pending.surfaceId !== surfaceId) {
        return;
      }
      clearPendingRequest(requestId, {
        ok: false,
        error: {
          code: code || 'surface_disconnected',
          message: 'The target Lumno debug surface is no longer connected.'
        }
      });
    });
  }

  function removePortSurfaces(port) {
    Array.from(surfaces.entries()).forEach(([surfaceId, record]) => {
      if (record.port !== port) {
        return;
      }
      surfaces.delete(surfaceId);
      rejectPendingForSurface(surfaceId, 'surface_disconnected');
    });
  }

  function handleSurfacePortMessage(port, message) {
    if (!message || typeof message !== 'object' || message.channel !== CHANNEL || message.version !== VERSION) {
      return;
    }
    if (message.type === 'surface.register' || message.type === 'surface.update') {
      const nextRecord = normalizeRegistration(port, message);
      if (!nextRecord) {
        return;
      }
      const previous = surfaces.get(nextRecord.surfaceId);
      if (previous && previous.port !== port) {
        rejectPendingForSurface(nextRecord.surfaceId, 'surface_replaced');
      }
      if (previous && previous.port === port) {
        nextRecord.connectedAt = previous.connectedAt;
      }
      surfaces.set(nextRecord.surfaceId, nextRecord);
      return;
    }
    if (message.type !== 'surface.response') {
      return;
    }
    const requestId = String(message.requestId || '');
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    const surface = surfaces.get(pending.surfaceId);
    if (!surface || surface.port !== port) {
      return;
    }
    clearPendingRequest(requestId, message.response && typeof message.response === 'object'
      ? message.response
      : {
        ok: false,
        error: {
          code: 'invalid_surface_response',
          message: 'The Lumno debug surface returned an invalid response.'
        }
      });
  }

  function handleConnect(port) {
    if (!isEnabled() || !port || port.name !== SURFACE_PORT_NAME) {
      return;
    }
    if (!port.onMessage || typeof port.onMessage.addListener !== 'function' ||
        !port.onDisconnect || typeof port.onDisconnect.addListener !== 'function') {
      return;
    }
    port.onMessage.addListener((message) => {
      handleSurfacePortMessage(port, message);
    });
    port.onDisconnect.addListener(() => {
      removePortSurfaces(port);
    });
  }

  function matchesTarget(record, target) {
    const normalizedTarget = target && typeof target === 'object' ? target : {};
    if (normalizedTarget.surfaceId && record.surfaceId !== String(normalizedTarget.surfaceId)) {
      return false;
    }
    if (typeof normalizedTarget.tabId === 'number' && record.tabId !== normalizedTarget.tabId) {
      return false;
    }
    if (typeof normalizedTarget.frameId === 'number' && record.frameId !== normalizedTarget.frameId) {
      return false;
    }
    if (normalizedTarget.type && record.type !== String(normalizedTarget.type)) {
      return false;
    }
    return true;
  }

  function resolveSurface(target) {
    const matches = Array.from(surfaces.values()).filter((record) => matchesTarget(record, target));
    if (matches.length === 1) {
      return { record: matches[0] };
    }
    if (matches.length === 0) {
      return {
        error: {
          code: 'surface_not_found',
          message: 'No connected Lumno debug surface matches the requested target.'
        }
      };
    }
    return {
      error: {
        code: 'surface_ambiguous',
        message: 'More than one Lumno debug surface matches the requested target.',
        matches: matches.map(getSurfaceSummary)
      }
    };
  }

  function createExternalResponse(request, payload) {
    return {
      channel: CHANNEL,
      version: VERSION,
      requestId: request && request.requestId != null ? request.requestId : null,
      ...payload
    };
  }

  function forwardSurfaceRequest(request, sendResponse) {
    const resolved = resolveSurface(request.target);
    if (!resolved.record) {
      sendResponse(createExternalResponse(request, { ok: false, error: resolved.error }));
      return false;
    }
    const record = resolved.record;
    const requestId = `debug-${Date.now()}-${++requestSequence}`;
    const timer = setTimer(() => {
      clearPendingRequest(requestId, createExternalResponse(request, {
        ok: false,
        error: {
          code: 'surface_timeout',
          message: 'The Lumno debug surface did not respond before the request timed out.'
        }
      }));
    }, requestTimeoutMs);
    pendingRequests.set(requestId, {
      surfaceId: record.surfaceId,
      sendResponse: (response) => {
        sendResponse(createExternalResponse(request, response));
      },
      timer
    });
    try {
      record.port.postMessage({
        channel: CHANNEL,
        version: VERSION,
        type: 'surface.request',
        requestId,
        method: request.method,
        params: request.params && typeof request.params === 'object' ? request.params : {}
      });
    } catch (error) {
      clearPendingRequest(requestId, createExternalResponse(request, {
        ok: false,
        error: {
          code: 'surface_post_failed',
          message: error && error.message ? error.message : 'Failed to send the debug request.'
        }
      }));
    }
    return true;
  }

  function handleExternalMessage(request, sender, sendResponse) {
    if (!isEnabled() || !isAllowedSender(sender) ||
        !request || typeof request !== 'object' || request.channel !== CHANNEL) {
      return false;
    }
    if (request.version !== VERSION) {
      sendResponse(createExternalResponse(request, {
        ok: false,
        error: {
          code: 'unsupported_version',
          message: `Lumno Codex debug bridge only supports protocol version ${VERSION}.`
        }
      }));
      return false;
    }
    if (request.method === 'bridge.describe') {
      sendResponse(createExternalResponse(request, {
        ok: true,
        result: {
          extensionId: chromeApi && chromeApi.runtime ? chromeApi.runtime.id || '' : '',
          developmentOnly: true,
          methods: ['bridge.describe', 'surfaces.list', ...SURFACE_METHODS]
        }
      }));
      return false;
    }
    if (request.method === 'surfaces.list') {
      sendResponse(createExternalResponse(request, {
        ok: true,
        result: { surfaces: listSurfaces() }
      }));
      return false;
    }
    if (!SURFACE_METHODS.includes(String(request.method || ''))) {
      sendResponse(createExternalResponse(request, {
        ok: false,
        error: {
          code: 'unknown_method',
          message: 'The requested Lumno Codex debug method is not supported.'
        }
      }));
      return false;
    }
    return forwardSurfaceRequest(request, sendResponse);
  }

  function attach() {
    if (attached || !isEnabled() || !chromeApi || !chromeApi.runtime) {
      return false;
    }
    const runtime = chromeApi.runtime;
    if (!runtime.onConnect || typeof runtime.onConnect.addListener !== 'function' ||
        !runtime.onMessageExternal || typeof runtime.onMessageExternal.addListener !== 'function') {
      return false;
    }
    attached = true;
    runtime.onConnect.addListener(handleConnect);
    runtime.onMessageExternal.addListener(handleExternalMessage);
    return true;
  }

  return Object.freeze({
    attach,
    handleConnect,
    handleExternalMessage,
    isEnabled,
    listSurfaces
  });
}

export {
  CHANNEL,
  VERSION,
  SURFACE_PORT_NAME,
  OFFICIAL_CODEX_EXTENSION_IDS,
  SURFACE_METHODS,
  create,
  getAllowedClientIds,
  isDevelopmentBridgeEnabled
};
