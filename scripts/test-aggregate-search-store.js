const assert = require('assert');

const store = require('../src/shared/aggregate-search-store.js');

const providers = [
  { key: 'gg', name: 'Google' },
  { key: 'gh', id: 'custom-1', name: 'GitHub custom', _xIsCustom: true },
  { key: 'goog', builtinKey: 'bi', id: 'custom-2', name: 'Bing override', _xIsCustom: true },
  { key: 'legacy', name: 'Legacy custom', _xIsCustom: true }
];

assert.strictEqual(store.getProviderSourceRef(providers[0]), 'builtin:gg');
assert.strictEqual(store.getProviderSourceRef(providers[1]), 'custom:custom-1');
assert.strictEqual(store.getProviderSourceRef(providers[2]), 'builtin:bi');
assert.strictEqual(store.getProviderSourceRef(providers[3]), 'custom-key:legacy');

const definition = store.normalizeAggregateSearch({
  id: 'research',
  key: 'Research',
  name: '  Research   Search ',
  sourceRefs: ['builtin:gg', 'custom:custom-1', 'builtin:gg'],
  autoCreateTabGroup: true
});
assert.deepStrictEqual(definition, {
  id: 'research',
  key: 'research',
  name: 'Research Search',
  sourceRefs: ['builtin:gg', 'custom:custom-1'],
  autoCreateTabGroup: true
});

const resolved = store.resolveAggregateSearchSources(definition, providers);
assert.deepStrictEqual(resolved.providers.map((item) => item.name), [
  'Google',
  'GitHub custom'
]);
assert.deepStrictEqual(resolved.unavailableSourceRefs, []);

const resolvedLegacyCustom = store.resolveAggregateSearchSources({
  id: 'legacy-custom',
  name: 'Legacy custom source',
  sourceRefs: ['builtin:gg', 'custom-key:legacy'],
  autoCreateTabGroup: false
}, providers);
assert.deepStrictEqual(resolvedLegacyCustom.providers.map((item) => item.name), [
  'Google',
  'Legacy custom'
]);
assert.deepStrictEqual(resolvedLegacyCustom.unavailableSourceRefs, []);

const withUnavailable = store.resolveAggregateSearchSources({
  ...definition,
  sourceRefs: ['builtin:gg', 'custom:missing']
}, providers);
assert.deepStrictEqual(withUnavailable.providers.map((item) => item.key), ['gg']);
assert.deepStrictEqual(withUnavailable.unavailableSourceRefs, ['custom:missing']);

const unavailableState = store.getAggregateSearchAvailability({
  ...definition,
  sourceRefs: ['builtin:gg', 'custom:missing']
}, providers);
assert.strictEqual(unavailableState.available, false);
assert.strictEqual(unavailableState.requiredSourceCount, 2);
assert.strictEqual(unavailableState.availableSourceCount, 1);
assert.strictEqual(unavailableState.unavailableSourceCount, 1);
assert.strictEqual(
  store.isAggregateSearchAvailable(definition, providers),
  true,
  'an aggregate is available only when every configured source resolves'
);

const scopeProvider = store.createScopeProvider(definition);
assert.strictEqual(store.isAggregateSearchProvider(scopeProvider), true);
assert.strictEqual(scopeProvider.aggregateId, 'research');
assert.strictEqual(scopeProvider.key, 'research');
assert.strictEqual(
  Object.prototype.hasOwnProperty.call(scopeProvider, 'autoCreateTabGroup'),
  false,
  'scope providers must not cache the global tab-group preference'
);
assert.deepStrictEqual(scopeProvider.sourceRefs, definition.sourceRefs);

const serialized = store.serializeAggregateSearches([
  definition,
  { id: 'invalid', name: 'Only one', sourceRefs: ['builtin:gg'] }
]);
assert.strictEqual(serialized.version, 2);
assert.deepStrictEqual(serialized.items, [definition]);

const legacyDefinition = store.normalizeAggregateSearch({
  id: 'legacy-range-only',
  name: 'Legacy range-only aggregate',
  sourceRefs: ['builtin:gg', 'custom:custom-1']
});
assert.strictEqual(legacyDefinition.key, '');
assert.strictEqual(
  store.createScopeProvider(legacyDefinition).key,
  'aggregate-legacy-range-only',
  'legacy aggregates without a trigger must remain selectable from the range panel'
);

const triggerProviders = store.mergeTriggerProviders(providers, [
  definition,
  { ...definition, id: 'duplicate-normal', key: 'gg' },
  { ...definition, id: 'duplicate-aggregate', key: 'research' },
  legacyDefinition
]);
assert.deepStrictEqual(
  triggerProviders.filter(store.isAggregateSearchProvider).map((item) => item.key),
  ['research'],
  'normal provider keys win and duplicate or missing aggregate triggers are ignored'
);

const quotaBoundaryItems = Array.from(
  { length: store.MAX_AGGREGATE_COUNT + 1 },
  (_unused, index) => ({
    id: `aggregate-${String(index).padStart(2, '0')}-${'a'.repeat(33)}`,
    key: `aggregate-${index}`,
    name: '😀'.repeat(store.MAX_NAME_LENGTH),
    sourceRefs: Array.from(
      { length: store.MAX_SOURCE_COUNT },
      (_source, sourceIndex) => (
        `custom:source-${String(sourceIndex).padStart(2, '0')}-${'b'.repeat(33)}`
      )
    ),
    autoCreateTabGroup: true
  })
);
const quotaBoundary = store.serializeAggregateSearches(quotaBoundaryItems);
assert.strictEqual(quotaBoundary.items.length, store.MAX_AGGREGATE_COUNT);
assert.ok(
  store.getSerializedStorageByteLength(quotaBoundary) < store.SYNC_ITEM_QUOTA_BYTES,
  'the maximum normal UI payload must fit Chrome storage.sync per-item quota'
);

const worstCaseQuotaItems = Array.from(
  { length: store.MAX_AGGREGATE_COUNT },
  (_unused, index) => ({
    id: `${index}${'a'.repeat(store.MAX_ID_BYTES - 1)}`,
    key: '中'.repeat(store.MAX_KEY_LENGTH),
    name: '中'.repeat(store.MAX_NAME_LENGTH),
    sourceRefs: Array.from(
      { length: store.MAX_SOURCE_COUNT },
      (_source, sourceIndex) => (
        `custom:${index}${sourceIndex}${'b'.repeat(store.MAX_SOURCE_REF_BYTES - 9)}`
      )
    ),
    autoCreateTabGroup: true
  })
);
const worstCaseQuotaPayload = store.serializeAggregateSearches(worstCaseQuotaItems);
const worstCaseQuotaBytes = store.getSerializedStorageByteLength(worstCaseQuotaPayload);
assert.ok(
  worstCaseQuotaBytes <= store.SYNC_ITEM_BYTE_BUDGET,
  `every accepted 8-by-10 payload must stay within the sync safety budget (${worstCaseQuotaBytes})`
);
assert.ok(
  worstCaseQuotaBytes < store.SYNC_ITEM_QUOTA_BYTES,
  'the sync safety budget must remain below Chrome storage.sync per-item quota'
);

const escapedQuotaPayload = store.serializeAggregateSearches(
  Array.from({ length: store.MAX_AGGREGATE_COUNT }, (_unused, index) => ({
    id: `${index}${'\\'.repeat(store.MAX_ID_BYTES)}`,
    key: '\\'.repeat(store.MAX_KEY_LENGTH),
    name: '\\'.repeat(store.MAX_NAME_LENGTH),
    sourceRefs: Array.from(
      { length: store.MAX_SOURCE_COUNT },
      (_source, sourceIndex) => `custom:${index}${sourceIndex}${'\\'.repeat(80)}`
    ),
    autoCreateTabGroup: true
  }))
);
assert.ok(
  store.getSerializedStorageByteLength(escapedQuotaPayload) <= store.SYNC_ITEM_BYTE_BUDGET,
  'JSON-escaped imported identifiers must also stay inside the sync safety budget'
);

const migratedIds = store.ensureCustomProviderIds([
  { key: 'legacy', name: 'Legacy' },
  { id: 'kept-id', key: 'kept', name: 'Kept' }
], (_item, index) => `source-${index + 1}`);
assert.strictEqual(migratedIds.changed, true);
assert.strictEqual(migratedIds.items[0].id, 'source-1');
assert.strictEqual(migratedIds.items[1].id, 'kept-id');

const deterministicLegacyItems = [
  {
    key: 'docs',
    name: 'Docs',
    template: 'https://example.test/search?q={query}',
    aliases: ['documentation']
  },
  {
    key: 'docs-copy',
    name: 'Docs copy',
    template: 'https://example.test/search?q={query}'
  }
];
const deterministicIdsA = store.ensureCustomProviderIds(
  deterministicLegacyItems,
  store.createDeterministicCustomProviderId
);
const deterministicIdsB = store.ensureCustomProviderIds(
  deterministicLegacyItems,
  store.createDeterministicCustomProviderId
);
assert.deepStrictEqual(
  deterministicIdsA.items.map((item) => item.id),
  deterministicIdsB.items.map((item) => item.id),
  'legacy provider IDs must migrate identically on every syncing device'
);
assert.strictEqual(new Set(deterministicIdsA.items.map((item) => item.id)).size, 2);
assert.strictEqual(
  store.createDeterministicCustomProviderId(
    { key: 'docs', template: 'https://example.test/search?q={query}', name: 'Docs' },
    0,
    0
  ),
  store.createDeterministicCustomProviderId(
    {
      key: 'docs',
      template: 'https://example.test/search?q={query}',
      name: '文档',
      aliases: ['different locale']
    },
    0,
    0
  ),
  'migration IDs must not depend on localized or user-facing labels'
);

const deterministicDuplicates = store.ensureCustomProviderIds([
  { key: 'duplicate', name: 'Duplicate' },
  { key: 'duplicate', name: 'Duplicate' }
], store.createDeterministicCustomProviderId);
assert.strictEqual(
  new Set(deterministicDuplicates.items.map((item) => item.id)).size,
  2,
  'deterministic migration must resolve colliding legacy records without random IDs'
);

const overlongProviderId = 'x'.repeat(200);
const normalizedOverlong = store.ensureCustomProviderIds([
  { id: overlongProviderId, key: 'overlong', name: 'Overlong' }
], store.createDeterministicCustomProviderId);
assert.strictEqual(normalizedOverlong.changed, true);
assert.ok(
  store.getJsonStringContentByteLength(normalizedOverlong.items[0].id) <= store.MAX_ID_BYTES,
  'overlong imported provider IDs must be normalized and persisted'
);
assert.strictEqual(
  store.getProviderSourceRef({ ...normalizedOverlong.items[0], _xIsCustom: true }),
  store.normalizeSourceRefs([`custom:${overlongProviderId}`])[0],
  'provider IDs and stored aggregate refs must use the same canonical truncation'
);

const renamedIds = store.ensureCustomProviderIds([
  { ...migratedIds.items[0], key: 'renamed', name: 'Renamed' },
  migratedIds.items[1]
], () => 'should-not-be-used');
assert.strictEqual(renamedIds.changed, false);
assert.strictEqual(renamedIds.items[0].id, 'source-1');
assert.strictEqual(
  store.resolveAggregateSearchSources({
    id: 'stable-reference',
    name: 'Stable reference',
    sourceRefs: ['custom:source-1', 'custom:kept-id']
  }, renamedIds.items.map((item) => ({ ...item, _xIsCustom: true }))).providers.length,
  2,
  'renaming a custom source must not break its aggregate reference'
);

(async () => {
  const readValue = await store.readStorageValue({
    get(_keys, callback) {
      callback({ providers: migratedIds.items });
    }
  }, { runtime: { lastError: null } }, 'providers');
  assert.deepStrictEqual(readValue, migratedIds.items);

  const chromeWithReadError = {
    runtime: { lastError: null }
  };
  await assert.rejects(
    store.readStorageValue({
      get(_keys, callback) {
        chromeWithReadError.runtime.lastError = { message: 'read failed' };
        callback(undefined);
      }
    }, chromeWithReadError, 'providers'),
    /read failed/
  );
  await assert.rejects(
    store.loadAggregateSearches({
      get() {
        return Promise.reject(new Error('temporary sync failure'));
      }
    }, store.STORAGE_KEY, { runtime: { lastError: null } }),
    /temporary sync failure/,
    'storage failures must remain distinguishable from a genuinely empty aggregate list'
  );

  let savedPayload = null;
  const savedValue = await store.writeStorageValue({
    set(payload, callback) {
      savedPayload = payload;
      callback();
    }
  }, { runtime: { lastError: null } }, 'providers', migratedIds.items);
  assert.deepStrictEqual(savedValue, migratedIds.items);
  assert.deepStrictEqual(savedPayload, { providers: migratedIds.items });

  const promiseOnlyValue = await store.writeStorageValue({
    set(payload) {
      savedPayload = payload;
      return Promise.resolve();
    }
  }, { runtime: { lastError: null } }, 'providers', renamedIds.items);
  assert.deepStrictEqual(promiseOnlyValue, renamedIds.items);
  assert.deepStrictEqual(savedPayload, { providers: renamedIds.items });

  await assert.rejects(
    store.writeStorageValue({
      set() {
        throw new Error('synchronous storage failure');
      }
    }, { runtime: { lastError: null } }, 'providers', migratedIds.items),
    /synchronous storage failure/
  );

  const chromeWithWriteError = {
    runtime: { lastError: null }
  };
  await assert.rejects(
    store.writeStorageValue({
      set(_payload, callback) {
        chromeWithWriteError.runtime.lastError = { message: 'quota exceeded' };
        callback();
      }
    }, chromeWithWriteError, 'providers', migratedIds.items),
    /quota exceeded/
  );

  await assert.rejects(
    store.writeStorageValue({
      set() {
        return Promise.reject(new Error('sync unavailable'));
      }
    }, { runtime: { lastError: null } }, 'providers', migratedIds.items),
    /sync unavailable/
  );

  console.log('aggregate search store tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
