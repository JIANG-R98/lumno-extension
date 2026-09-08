(function(root, factory) {
  const settingsApi = root.LumnoSettings || (
    typeof module === 'object' && module.exports
      ? require('./settings.js')
      : {}
  );
  const api = factory(settingsApi);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.LumnoAggregateSearchStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(settingsApi) {
  'use strict';

  const STORAGE_KEY = '_x_extension_aggregate_searches_2026_unique_';
  const SCHEMA_VERSION = 2;
  const MIN_SOURCE_COUNT = 2;
  const MAX_SOURCE_COUNT = 10;
  const MAX_AGGREGATE_COUNT = 8;
  const MAX_NAME_LENGTH = 80;
  const MAX_NAME_BYTES = 240;
  const MAX_KEY_LENGTH = 32;
  const MAX_KEY_BYTES = 48;
  const MAX_ID_BYTES = 48;
  const MAX_SOURCE_REF_BYTES = 56;
  const SYNC_ITEM_QUOTA_BYTES = 8192;
  const SYNC_ITEM_BYTE_BUDGET = 8064;

  function toWellFormedText(value) {
    const source = String(value || '');
    let result = '';
    for (let index = 0; index < source.length; index += 1) {
      const code = source.charCodeAt(index);
      if (code >= 0xD800 && code <= 0xDBFF) {
        const next = source.charCodeAt(index + 1);
        if (next >= 0xDC00 && next <= 0xDFFF) {
          result += source[index] + source[index + 1];
          index += 1;
        } else {
          result += '\uFFFD';
        }
        continue;
      }
      result += code >= 0xDC00 && code <= 0xDFFF ? '\uFFFD' : source[index];
    }
    return result;
  }

  function getUtf8ByteLength(value) {
    const source = toWellFormedText(value);
    let bytes = 0;
    for (let index = 0; index < source.length; index += 1) {
      const codePoint = source.codePointAt(index);
      if (codePoint <= 0x7F) {
        bytes += 1;
      } else if (codePoint <= 0x7FF) {
        bytes += 2;
      } else if (codePoint <= 0xFFFF) {
        bytes += 3;
      } else {
        bytes += 4;
        index += 1;
      }
    }
    return bytes;
  }

  function truncateUtf8(value, maxBytes) {
    const source = toWellFormedText(value);
    const limit = Math.max(0, Number(maxBytes) || 0);
    let bytes = 0;
    let result = '';
    for (let index = 0; index < source.length; index += 1) {
      const codePoint = source.codePointAt(index);
      const character = String.fromCodePoint(codePoint);
      const characterBytes = getUtf8ByteLength(character);
      if (bytes + characterBytes > limit) {
        break;
      }
      result += character;
      bytes += characterBytes;
      if (codePoint > 0xFFFF) {
        index += 1;
      }
    }
    return result;
  }

  function getJsonStringContentByteLength(value) {
    const serialized = JSON.stringify(toWellFormedText(value));
    return serialized ? getUtf8ByteLength(serialized.slice(1, -1)) : 0;
  }

  function truncateJsonStringContent(value, maxBytes) {
    const source = toWellFormedText(value);
    const limit = Math.max(0, Number(maxBytes) || 0);
    let bytes = 0;
    let result = '';
    for (let index = 0; index < source.length; index += 1) {
      const codePoint = source.codePointAt(index);
      const character = String.fromCodePoint(codePoint);
      const characterBytes = getJsonStringContentByteLength(character);
      if (bytes + characterBytes > limit) {
        break;
      }
      result += character;
      bytes += characterBytes;
      if (codePoint > 0xFFFF) {
        index += 1;
      }
    }
    return result;
  }

  function normalizeText(value) {
    return toWellFormedText(value).replace(/\s+/g, ' ').trim();
  }

  function normalizeId(value) {
    return truncateJsonStringContent(normalizeText(value), MAX_ID_BYTES);
  }

  function normalizeAggregateSearchKey(value) {
    const key = truncateJsonStringContent(
      toWellFormedText(normalizeText(value).slice(0, MAX_KEY_LENGTH)).toLowerCase(),
      MAX_KEY_BYTES
    );
    return key && !/\s/.test(key) ? key : '';
  }

  function normalizeSourceToken(value, maxBytes) {
    return truncateJsonStringContent(
      normalizeText(value).toLowerCase(),
      Number.isFinite(Number(maxBytes)) ? Number(maxBytes) : MAX_SOURCE_REF_BYTES
    );
  }

  function normalizeSourceRef(value) {
    const source = normalizeText(value).toLowerCase();
    const prefixes = ['custom-key:', 'builtin:', 'custom:', 'key:'];
    const prefix = prefixes.find((candidate) => source.startsWith(candidate)) || '';
    if (!prefix) {
      return truncateJsonStringContent(source, MAX_SOURCE_REF_BYTES);
    }
    const remainingBytes = MAX_SOURCE_REF_BYTES - getUtf8ByteLength(prefix);
    const suffixBytes = prefix === 'custom:'
      ? Math.min(MAX_ID_BYTES, remainingBytes)
      : remainingBytes;
    return prefix + truncateJsonStringContent(
      source.slice(prefix.length),
      suffixBytes
    );
  }

  function normalizeSourceRefs(items) {
    const refs = [];
    const seen = new Set();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const ref = normalizeSourceRef(item);
      if (!ref || seen.has(ref) || refs.length >= MAX_SOURCE_COUNT) {
        return;
      }
      seen.add(ref);
      refs.push(ref);
    });
    return refs;
  }

  function ensureCustomProviderIds(items, createId) {
    const source = Array.isArray(items) ? items : [];
    const generateId = typeof createId === 'function' ? createId : null;
    const used = new Set();
    let changed = false;
    const normalized = source.map((item, index) => {
      const currentId = normalizeText(item && item.id);
      let id = normalizeId(currentId);
      if (!id || used.has(id.toLowerCase())) {
        if (!generateId) {
          return item;
        }
        let attempts = 0;
        do {
          id = normalizeId(generateId(item, index, attempts));
          attempts += 1;
        } while (id && used.has(id.toLowerCase()) && attempts < 20);
        if (!id || used.has(id.toLowerCase())) {
          return item;
        }
        changed = true;
      }
      used.add(id.toLowerCase());
      if (currentId !== id) {
        changed = true;
      }
      return currentId === id ? item : { ...item, id };
    });
    return { changed, items: normalized };
  }

  function hashDeterministicText(value, seed) {
    const source = toWellFormedText(value);
    let hash = Number(seed) >>> 0;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    return hash.toString(36).padStart(7, '0');
  }

  function createDeterministicCustomProviderId(item, _index, attempt) {
    const provider = item && typeof item === 'object' ? item : {};
    const canonical = [
      normalizeText(provider.builtinKey).toLowerCase(),
      normalizeText(provider.key).toLowerCase(),
      normalizeText(provider.template),
      String(Math.max(0, Number(attempt) || 0))
    ].join('\n');
    return normalizeId(
      `source-${hashDeterministicText(canonical, 2166136261)}` +
      `-${hashDeterministicText(canonical, 2246822507)}`
    );
  }

  function readStorageValue(storageArea, chromeApi, key) {
    if (!settingsApi || typeof settingsApi.readStorageValue !== 'function') {
      return Promise.reject(new Error('storage-runtime-unavailable'));
    }
    return settingsApi.readStorageValue(storageArea, chromeApi, key);
  }

  function writeStorageValue(storageArea, chromeApi, key, value) {
    if (!settingsApi || typeof settingsApi.writeStorageValue !== 'function') {
      return Promise.reject(new Error('storage-runtime-unavailable'));
    }
    return settingsApi.writeStorageValue(storageArea, chromeApi, key, value);
  }

  function normalizeAggregateSearch(item) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const id = normalizeId(item.id);
    const key = normalizeAggregateSearchKey(item.key || item.trigger);
    const name = truncateJsonStringContent(
      toWellFormedText(normalizeText(item.name).slice(0, MAX_NAME_LENGTH)),
      MAX_NAME_BYTES
    );
    const sourceRefs = normalizeSourceRefs(
      item.sourceRefs || item.providerRefs || item.memberRefs || item.memberKeys || item.providerKeys
    );
    if (!id || !name || sourceRefs.length < MIN_SOURCE_COUNT) {
      return null;
    }
    return {
      id,
      key,
      name,
      sourceRefs,
      autoCreateTabGroup: item.autoCreateTabGroup === true ||
        item.autoGroup === true || item.groupEnabled === true
    };
  }

  function normalizeAggregateSearches(value) {
    const source = Array.isArray(value)
      ? value
      : (value && Array.isArray(value.items) ? value.items : []);
    const items = [];
    const seen = new Set();
    source.forEach((item) => {
      if (items.length >= MAX_AGGREGATE_COUNT) {
        return;
      }
      const normalized = normalizeAggregateSearch(item);
      const idKey = normalized ? normalized.id.toLowerCase() : '';
      if (!normalized || seen.has(idKey)) {
        return;
      }
      seen.add(idKey);
      items.push(normalized);
    });
    return items;
  }

  function serializeAggregateSearches(items) {
    return {
      version: SCHEMA_VERSION,
      items: normalizeAggregateSearches(items)
    };
  }

  function getSerializedStorageByteLength(value, storageKey) {
    return getUtf8ByteLength(String(storageKey || STORAGE_KEY)) +
      getUtf8ByteLength(JSON.stringify(value));
  }

  function getProviderSourceRef(provider) {
    if (!provider || typeof provider !== 'object') {
      return '';
    }
    const builtinPrefix = 'builtin:';
    const builtinKey = normalizeSourceToken(
      provider.builtinKey,
      MAX_SOURCE_REF_BYTES - getUtf8ByteLength(builtinPrefix)
    );
    if (builtinKey) {
      return builtinPrefix + builtinKey;
    }
    const key = normalizeSourceToken(provider.key);
    if (provider._xIsCustom === true) {
      const id = normalizeId(provider.id).toLowerCase();
      return id
        ? normalizeSourceRef(`custom:${id}`)
        : (key ? normalizeSourceRef(`custom-key:${key}`) : '');
    }
    return key ? normalizeSourceRef(`builtin:${key}`) : '';
  }

  function buildProviderRefMap(providers) {
    const map = new Map();
    (Array.isArray(providers) ? providers : []).forEach((provider) => {
      const ref = getProviderSourceRef(provider);
      if (ref && !map.has(ref)) {
        map.set(ref, provider);
      }
      const key = normalizeSourceRef(provider && provider.key);
      if (key) {
        const legacyRefs = [normalizeSourceRef(`key:${key}`), key];
        if (provider && provider._xIsCustom === true) {
          legacyRefs.push(normalizeSourceRef(`custom-key:${key}`));
        }
        legacyRefs.forEach((legacyRef) => {
          if (!map.has(legacyRef)) {
            map.set(legacyRef, provider);
          }
        });
      }
    });
    return map;
  }

  function resolveAggregateSearchSources(definition, providers) {
    const normalized = normalizeAggregateSearch(definition);
    if (!normalized) {
      return { definition: null, providers: [], unavailableSourceRefs: [] };
    }
    const providerMap = buildProviderRefMap(providers);
    const resolved = [];
    const unavailableSourceRefs = [];
    normalized.sourceRefs.forEach((ref) => {
      const provider = providerMap.get(ref);
      if (provider) {
        resolved.push(provider);
      } else {
        unavailableSourceRefs.push(ref);
      }
    });
    return {
      definition: normalized,
      providers: resolved,
      unavailableSourceRefs
    };
  }

  function getAggregateSearchAvailability(definition, providers) {
    const resolved = resolveAggregateSearchSources(definition, providers);
    const requiredSourceCount = resolved.definition && Array.isArray(resolved.definition.sourceRefs)
      ? resolved.definition.sourceRefs.length
      : 0;
    const availableSourceCount = Array.isArray(resolved.providers)
      ? resolved.providers.length
      : 0;
    const unavailableSourceCount = Array.isArray(resolved.unavailableSourceRefs)
      ? resolved.unavailableSourceRefs.length
      : 0;
    return {
      ...resolved,
      available: Boolean(
        resolved.definition &&
        requiredSourceCount >= MIN_SOURCE_COUNT &&
        availableSourceCount === requiredSourceCount &&
        unavailableSourceCount === 0
      ),
      requiredSourceCount,
      availableSourceCount,
      unavailableSourceCount
    };
  }

  function isAggregateSearchAvailable(definition, providers) {
    return getAggregateSearchAvailability(definition, providers).available;
  }

  function createScopeProvider(definition) {
    const normalized = normalizeAggregateSearch(definition);
    if (!normalized) {
      return null;
    }
    return {
      key: normalized.key || `aggregate-${normalized.id}`,
      aliases: [],
      name: normalized.name,
      template: '',
      action: 'aggregateSearch',
      category: 'aggregateSearch',
      aggregateId: normalized.id,
      sourceRefs: normalized.sourceRefs.slice(),
      _xIsAggregateSearch: true
    };
  }

  function mergeTriggerProviders(providers, definitions) {
    const result = (Array.isArray(providers) ? providers : []).filter(Boolean).slice();
    const usedKeys = new Set(result.map((provider) => (
      String(provider && provider.key || '').trim().toLowerCase()
    )).filter(Boolean));
    (Array.isArray(definitions) ? definitions : []).forEach((definition) => {
      const normalized = normalizeAggregateSearch(definition);
      if (!normalized || !normalized.key || usedKeys.has(normalized.key)) {
        return;
      }
      const provider = createScopeProvider(normalized);
      if (!provider) {
        return;
      }
      usedKeys.add(normalized.key);
      result.push(provider);
    });
    return result;
  }

  function isAggregateSearchProvider(provider) {
    return Boolean(
      provider && (
        provider._xIsAggregateSearch === true ||
        String(provider.action || '') === 'aggregateSearch' ||
        String(provider.category || '') === 'aggregateSearch'
      )
    );
  }

  function loadAggregateSearches(storageArea, storageKey, chromeApi) {
    const key = String(storageKey || STORAGE_KEY);
    return readStorageValue(storageArea, chromeApi, key)
      .then((value) => normalizeAggregateSearches(value));
  }

  return Object.freeze({
    STORAGE_KEY,
    SCHEMA_VERSION,
    MIN_SOURCE_COUNT,
    MAX_SOURCE_COUNT,
    MAX_AGGREGATE_COUNT,
    MAX_NAME_LENGTH,
    MAX_NAME_BYTES,
    MAX_KEY_LENGTH,
    MAX_KEY_BYTES,
    MAX_ID_BYTES,
    MAX_SOURCE_REF_BYTES,
    SYNC_ITEM_QUOTA_BYTES,
    SYNC_ITEM_BYTE_BUDGET,
    buildProviderRefMap,
    createDeterministicCustomProviderId,
    createScopeProvider,
    ensureCustomProviderIds,
    getProviderSourceRef,
    getJsonStringContentByteLength,
    getSerializedStorageByteLength,
    getUtf8ByteLength,
    getAggregateSearchAvailability,
    isAggregateSearchProvider,
    isAggregateSearchAvailable,
    loadAggregateSearches,
    mergeTriggerProviders,
    normalizeAggregateSearchKey,
    normalizeAggregateSearch,
    normalizeAggregateSearches,
    normalizeSourceRefs,
    readStorageValue,
    resolveAggregateSearchSources,
    serializeAggregateSearches,
    writeStorageValue
  });
});
