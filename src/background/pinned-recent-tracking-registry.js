(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoPinnedRecentTrackingRegistry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const TRACKING_SESSION_STORAGE_KEY = '_x_extension_pinned_recent_tracking_tabs_2026_unique_';
  const TRACKING_TOKEN_STORAGE_KEY = '_x_extension_pinned_recent_tracking_tokens_2026_unique_';
  const DEFAULT_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const DEFAULT_MAX_TOKENS = 120;
  const DEFAULT_MAX_TOKEN_FORKS = 16;

  function getRuntimeError(runtime) {
    return runtime && runtime.lastError ? runtime.lastError : null;
  }

  function storageGet(storage, key, runtime) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.get !== 'function') {
        resolve({});
        return;
      }
      storage.get([key], (result) => {
        resolve(getRuntimeError(runtime) ? null : (result || {}));
      });
    });
  }

  function storageSet(storage, value, runtime) {
    return new Promise((resolve) => {
      if (!storage || typeof storage.set !== 'function') {
        resolve(false);
        return;
      }
      storage.set(value, () => resolve(!getRuntimeError(runtime)));
    });
  }

  function normalizeTrackingToken(value) {
    const token = String(value || '').trim().toLowerCase();
    return /^trk-[a-f0-9]{32}$/.test(token) ? token : '';
  }

  function createTrackingToken(randomUUID) {
    const createUuid = typeof randomUUID === 'function'
      ? randomUUID
      : (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
        ? globalThis.crypto.randomUUID.bind(globalThis.crypto)
        : null);
    if (createUuid) {
      const value = String(createUuid() || '').replace(/[^a-f0-9]/gi, '').toLowerCase();
      if (value.length >= 32) return `trk-${value.slice(0, 32)}`;
    }
    const values = new Uint8Array(16);
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(values);
    } else {
      for (let index = 0; index < values.length; index += 1) {
        values[index] = Math.floor(Math.random() * 256);
      }
    }
    return `trk-${Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function normalizeHttpOrigin(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : '';
    } catch (error) {
      return '';
    }
  }

  function createPinnedRecentTrackingRegistry(options) {
    const config = options && typeof options === 'object' ? options : {};
    const runtime = config.runtime || null;
    const sessionStorage = config.sessionStorage || null;
    const durableStorage = config.durableStorage || null;
    const recentStore = config.recentStore || {};
    const now = typeof config.now === 'function' ? config.now : Date.now;
    const tokenTtlMs = Math.max(60 * 1000, Number(config.tokenTtlMs) || DEFAULT_TOKEN_TTL_MS);
    const maxTokens = Math.max(1, Number(config.maxTokens) || DEFAULT_MAX_TOKENS);
    const maxTokenForks = Math.max(1, Number(config.maxTokenForks) || DEFAULT_MAX_TOKEN_FORKS);
    const sessionBindings = new Map();
    const tokenRecords = new Map();
    let ready = Promise.resolve();
    let mutationQueue = Promise.resolve();
    let sessionWriteQueue = Promise.resolve();
    let durableWriteQueue = Promise.resolve();
    let durableLoaded = false;
    let lastIssuedTimestamp = 0;

    function normalizeCardId(value) {
      return typeof recentStore.normalizePinnedRecentCardId === 'function'
        ? recentStore.normalizePinnedRecentCardId(value)
        : String(value || '').trim();
    }

    function getHostKey(value) {
      if (typeof recentStore.getRecentSiteHostKey !== 'function') return '';
      return recentStore.getRecentSiteHostKey(
        typeof value === 'string' ? { url: value } : value,
        config.storeOptions || {}
      );
    }

    function getTabHost(tab) {
      return getHostKey(String(tab && (tab.url || tab.pendingUrl) || ''));
    }

    function getTabOrigin(tab) {
      return normalizeHttpOrigin(String(tab && (tab.url || tab.pendingUrl) || ''));
    }

    function enqueueMutation(task) {
      const run = mutationQueue.then(() => ready).then(task);
      mutationQueue = run.catch(() => {});
      return run;
    }

    function getIssuedTimestamp() {
      const currentTime = Math.max(0, Number(now()) || 0);
      lastIssuedTimestamp = Math.max(currentTime, lastIssuedTimestamp + 1);
      return lastIssuedTimestamp;
    }

    function getTrackedCards(items) {
      const normalized = typeof recentStore.normalizePinnedRecentSites === 'function'
        ? recentStore.normalizePinnedRecentSites(items, config.storeOptions || {})
        : (Array.isArray(items) ? items : []);
      const cards = new Map();
      normalized.forEach((item) => {
        const cardId = normalizeCardId(item && item.cardId);
        const hostKey = getHostKey(item);
        const origin = normalizeHttpOrigin(item && item.url);
        if (item && item.trackingEnabled === true && cardId && hostKey && origin) {
          cards.set(cardId, { cardId, hostKey, origin });
        }
      });
      return cards;
    }

    function createToken() {
      let token = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        token = createTrackingToken(config.randomUUID);
        if (!tokenRecords.has(token)) return token;
      }
      return '';
    }

    function persistSessionBindings() {
      const snapshot = {};
      sessionBindings.forEach((binding, tabId) => {
        snapshot[String(tabId)] = {
          cardId: binding.cardId,
          token: binding.token || '',
          origin: binding.origin || ''
        };
      });
      sessionWriteQueue = sessionWriteQueue.then(() => storageSet(
        sessionStorage,
        { [TRACKING_SESSION_STORAGE_KEY]: snapshot },
        runtime
      ));
      return sessionWriteQueue;
    }

    function persistTokenRecords() {
      const snapshot = {};
      tokenRecords.forEach((record, token) => {
        snapshot[token] = { ...record };
      });
      durableWriteQueue = durableWriteQueue.then(() => storageSet(
        durableStorage,
        { [TRACKING_TOKEN_STORAGE_KEY]: snapshot },
        runtime
      ));
      return durableWriteQueue;
    }

    function loadSessionBindings(value) {
      sessionBindings.clear();
      const source = value && typeof value === 'object' ? value : {};
      Object.keys(source).forEach((tabIdValue) => {
        const tabId = Number(tabIdValue);
        const rawBinding = source[tabIdValue];
        const cardId = normalizeCardId(
          rawBinding && typeof rawBinding === 'object' ? rawBinding.cardId : rawBinding
        );
        const token = normalizeTrackingToken(
          rawBinding && typeof rawBinding === 'object' ? rawBinding.token : ''
        );
        const origin = normalizeHttpOrigin(
          rawBinding && typeof rawBinding === 'object' ? rawBinding.origin : ''
        );
        if (Number.isInteger(tabId) && tabId >= 0 && cardId && origin) {
          sessionBindings.set(tabId, { cardId, token, origin });
        }
      });
    }

    function loadTokenRecords(value) {
      tokenRecords.clear();
      const source = value && typeof value === 'object' ? value : {};
      Object.keys(source).forEach((tokenValue) => {
        const token = normalizeTrackingToken(tokenValue);
        const record = source[tokenValue];
        const cardId = normalizeCardId(record && record.cardId);
        const hostKey = getHostKey(record && record.hostKey ? `https://${record.hostKey}/` : '');
        const origin = normalizeHttpOrigin(record && record.origin);
        if (!token || !cardId || !hostKey || !origin) return;
        tokenRecords.set(token, {
          cardId,
          hostKey,
          origin,
          createdAt: Math.max(0, Number(record.createdAt) || 0),
          lastSeenAt: Math.max(0, Number(record.lastSeenAt) || 0),
          restoreCount: Math.max(0, Number(record.restoreCount) || 0)
        });
      });
    }

    function pruneTokenOverflow() {
      const overflow = Array.from(tokenRecords.entries())
        .sort((left, right) => right[1].lastSeenAt - left[1].lastSeenAt)
        .slice(maxTokens);
      overflow.forEach(([token]) => tokenRecords.delete(token));
      return overflow.length > 0;
    }

    function ensureDurableLoaded() {
      if (durableLoaded) return Promise.resolve(true);
      return storageGet(durableStorage, TRACKING_TOKEN_STORAGE_KEY, runtime).then((result) => {
        if (result === null) return false;
        loadTokenRecords(result && result[TRACKING_TOKEN_STORAGE_KEY]);
        durableLoaded = true;
        return true;
      });
    }

    function pruneState(items) {
      const cards = getTrackedCards(items);
      const currentTime = Math.max(0, Number(now()) || 0);
      let sessionChanged = false;
      let durableChanged = false;
      sessionBindings.forEach((binding, tabId) => {
        const card = cards.get(binding.cardId);
        if (card && card.origin === binding.origin) return;
        sessionBindings.delete(tabId);
        sessionChanged = true;
      });
      if (durableLoaded) {
        tokenRecords.forEach((record, token) => {
          const card = cards.get(record.cardId);
          const expired = currentTime - record.lastSeenAt > tokenTtlMs;
          if (card && card.hostKey === record.hostKey && card.origin === record.origin && !expired) {
            return;
          }
          tokenRecords.delete(token);
          durableChanged = true;
        });
        durableChanged = pruneTokenOverflow() || durableChanged;
      }
      return Promise.all([
        sessionChanged ? persistSessionBindings() : Promise.resolve(true),
        durableChanged ? persistTokenRecords() : Promise.resolve(true)
      ]).then(() => ({ sessionChanged, durableChanged }));
    }

    function initialize(items) {
      ready = Promise.all([
        storageGet(sessionStorage, TRACKING_SESSION_STORAGE_KEY, runtime),
        storageGet(durableStorage, TRACKING_TOKEN_STORAGE_KEY, runtime)
      ]).then(([sessionResult, durableResult]) => {
        loadSessionBindings(sessionResult && sessionResult[TRACKING_SESSION_STORAGE_KEY]);
        durableLoaded = durableResult !== null;
        if (durableLoaded) {
          loadTokenRecords(durableResult && durableResult[TRACKING_TOKEN_STORAGE_KEY]);
        }
        return pruneState(items);
      }).then(() => true);
      return ready;
    }

    function bindTab(tab, cardId, items, expectedUrl) {
      return enqueueMutation(() => {
        const tabId = Number(tab && tab.id);
        const normalizedCardId = normalizeCardId(cardId);
        const cards = getTrackedCards(items);
        const card = cards.get(normalizedCardId);
        const expectedHost = getHostKey(expectedUrl) || getTabHost(tab);
        const expectedOrigin = normalizeHttpOrigin(expectedUrl) || getTabOrigin(tab);
        if (!Number.isInteger(tabId) || tabId < 0 || !card ||
            !expectedHost || !expectedOrigin || expectedHost !== card.hostKey ||
            expectedOrigin !== card.origin) {
          return { status: 'ignored', cardId: '' };
        }
        sessionBindings.set(tabId, {
          cardId: normalizedCardId,
          token: '',
          origin: expectedOrigin
        });
        return persistSessionBindings().then((saved) => ({
          status: saved ? 'bound' : 'memory-only',
          cardId: normalizedCardId,
          token: ''
        }));
      });
    }

    function syncDocument(tab, presentedToken, items) {
      return enqueueMutation(async () => {
        const tabId = Number(tab && tab.id);
        const hostKey = getTabHost(tab);
        const origin = getTabOrigin(tab);
        const cards = getTrackedCards(items);
        if (!Number.isInteger(tabId) || tabId < 0 || !hostKey || !origin) {
          return { status: 'clear', clear: true };
        }
        const hasDurableState = await ensureDurableLoaded();
        if (hasDurableState) await pruneState(items);
        const currentBinding = sessionBindings.get(tabId);
        if (currentBinding) {
          const card = cards.get(currentBinding.cardId);
          const boundRecord = currentBinding.token && tokenRecords.get(currentBinding.token);
          if (!card || card.hostKey !== hostKey || card.origin !== origin ||
              currentBinding.origin !== origin ||
              (boundRecord && boundRecord.origin !== origin)) {
            sessionBindings.delete(tabId);
            return persistSessionBindings().then(() => ({ status: 'clear', clear: true }));
          }
          if (tab && tab.incognito) {
            if (currentBinding.token) {
              sessionBindings.set(tabId, {
                cardId: currentBinding.cardId,
                token: '',
                origin: currentBinding.origin
              });
              return persistSessionBindings().then(() => ({
                status: 'bound-session-only',
                cardId: currentBinding.cardId,
                clear: true
              }));
            }
            return { status: 'bound-session-only', cardId: currentBinding.cardId, clear: true };
          }
          if (!hasDurableState) {
            return { status: 'bound-session-only', cardId: currentBinding.cardId };
          }
          let token = normalizeTrackingToken(currentBinding.token);
          let record = token && tokenRecords.get(token);
          if (!record || record.cardId !== card.cardId || record.hostKey !== card.hostKey) {
            token = createToken();
            if (!token) return { status: 'bound-session-only', cardId: card.cardId, clear: true };
            const currentTime = getIssuedTimestamp();
            record = {
              cardId: card.cardId,
              hostKey: card.hostKey,
              origin,
              createdAt: currentTime,
              lastSeenAt: currentTime,
              restoreCount: 0
            };
            tokenRecords.set(token, record);
            pruneTokenOverflow();
            sessionBindings.set(tabId, { cardId: card.cardId, token, origin });
            return Promise.all([persistSessionBindings(), persistTokenRecords()])
              .then(([, durableSaved]) => {
                if (durableSaved) return { status: 'bound', cardId: card.cardId, token };
                tokenRecords.delete(token);
                sessionBindings.set(tabId, { cardId: card.cardId, token: '', origin });
                return persistSessionBindings().then(() => ({
                  status: 'bound-session-only',
                  cardId: card.cardId,
                  clear: true
                }));
              });
          }
          record.lastSeenAt = getIssuedTimestamp();
          return persistTokenRecords().then(() => ({ status: 'bound', cardId: card.cardId, token }));
        }

        const token = normalizeTrackingToken(presentedToken);
        if (!hasDurableState) return { status: 'ignored' };
        const record = token && tokenRecords.get(token);
        const card = record && cards.get(record.cardId);
        if (!record || !card || record.hostKey !== hostKey || card.hostKey !== hostKey ||
            card.origin !== origin ||
            record.origin !== origin || record.restoreCount >= maxTokenForks || tab.incognito) {
          return { status: token ? 'clear' : 'ignored', clear: Boolean(token) };
        }
        const successor = createToken();
        if (!successor) return { status: 'clear', clear: true };
        const currentTime = getIssuedTimestamp();
        tokenRecords.set(successor, {
          cardId: card.cardId,
          hostKey: card.hostKey,
          origin,
          createdAt: currentTime,
          lastSeenAt: currentTime,
          restoreCount: record.restoreCount + 1
        });
        record.lastSeenAt = currentTime;
        record.restoreCount += 1;
        sessionBindings.set(tabId, { cardId: card.cardId, token: successor, origin });
        pruneTokenOverflow();
        return Promise.all([persistSessionBindings(), persistTokenRecords()])
          .then(([, durableSaved]) => {
            if (durableSaved) {
              return { status: 'restored', cardId: card.cardId, token: successor };
            }
            tokenRecords.delete(successor);
            sessionBindings.set(tabId, { cardId: card.cardId, token: '', origin });
            return persistSessionBindings().then(() => ({
              status: 'restored-session-only',
              cardId: card.cardId,
              clear: true
            }));
          });
      });
    }

    function inheritTab(sourceTabId, targetTab, items) {
      return enqueueMutation(() => {
        const source = sessionBindings.get(Number(sourceTabId));
        if (!source) return { status: 'ignored', cardId: '' };
        const targetTabId = Number(targetTab && targetTab.id);
        const targetOrigin = getTabOrigin(targetTab);
        const cards = getTrackedCards(items);
        if (!Number.isInteger(targetTabId) || targetTabId < 0 || !cards.has(source.cardId) ||
            !targetOrigin || targetOrigin !== source.origin) {
          return { status: 'ignored', cardId: '' };
        }
        sessionBindings.set(targetTabId, {
          cardId: source.cardId,
          token: '',
          origin: targetOrigin
        });
        return persistSessionBindings().then((saved) => ({
          status: saved ? 'bound' : 'memory-only',
          cardId: source.cardId,
          token: ''
        }));
      });
    }

    function releaseTab(tabId, options) {
      return enqueueMutation(() => {
        const binding = sessionBindings.get(Number(tabId));
        if (!binding) return false;
        sessionBindings.delete(Number(tabId));
        const revokeToken = options && options.revokeToken === true;
        const durableChanged = Boolean(
          revokeToken && binding.token && tokenRecords.delete(binding.token)
        );
        return Promise.all([
          persistSessionBindings(),
          durableChanged ? persistTokenRecords() : Promise.resolve(true)
        ]).then(() => true);
      });
    }

    function replaceTab(removedTabId, addedTabId) {
      return enqueueMutation(() => {
        const removedId = Number(removedTabId);
        const addedId = Number(addedTabId);
        const binding = sessionBindings.get(removedId);
        if (!binding || !Number.isInteger(addedId) || addedId < 0) return false;
        sessionBindings.delete(removedId);
        sessionBindings.set(addedId, { ...binding });
        return persistSessionBindings().then(() => true);
      });
    }

    function prune(items) {
      return enqueueMutation(() => pruneState(items));
    }

    function getCardId(tabId) {
      const binding = sessionBindings.get(Number(tabId));
      return binding ? binding.cardId : '';
    }

    function getActiveCounts() {
      const counts = {};
      sessionBindings.forEach((binding) => {
        counts[binding.cardId] = (counts[binding.cardId] || 0) + 1;
      });
      return counts;
    }

    return Object.freeze({
      initialize,
      bindTab,
      syncDocument,
      inheritTab,
      releaseTab,
      replaceTab,
      prune,
      getCardId,
      getActiveCounts
    });
  }

  return Object.freeze({
    TRACKING_SESSION_STORAGE_KEY,
    TRACKING_TOKEN_STORAGE_KEY,
    DEFAULT_TOKEN_TTL_MS,
    DEFAULT_MAX_TOKENS,
    DEFAULT_MAX_TOKEN_FORKS,
    normalizeTrackingToken,
    normalizeHttpOrigin,
    createTrackingToken,
    createPinnedRecentTrackingRegistry
  });
});
