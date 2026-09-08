const assert = require('assert');
const fs = require('fs');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should exist`);
  const openBrace = source.indexOf('{', start);
  assert.ok(openBrace >= 0, `${name} should have a body`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`${name} should have a closing brace`);
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function createLoadHarness(source) {
  const beginLoadSource = extractFunction(source, 'beginSiteSearchProviderLoad');
  return new Function(`
    let siteSearchProvidersCache = null;
    let siteSearchProvidersLoadPromise = null;
    let siteSearchProvidersLoadVersion = 0;
    ${beginLoadSource}
    return {
      begin: beginSiteSearchProviderLoad,
      getCache() { return siteSearchProvidersCache; },
      getPromise() { return siteSearchProvidersLoadPromise; },
      getVersion() { return siteSearchProvidersLoadVersion; }
    };
  `)();
}

async function verifyLoadGuard(surface, source) {
  assert.match(
    source,
    /let siteSearchProvidersLoadPromise = null;\s*let siteSearchProvidersLoadVersion = 0;/,
    `${surface} should track an in-flight provider load and its generation`
  );
  assert.match(
    source,
    /function getSiteSearchProviders\(\) \{\s*if \(siteSearchProvidersLoadPromise\) \{\s*return siteSearchProvidersLoadPromise;/,
    `${surface} should reuse the current provider load`
  );
  assert.match(
    source,
    /function reloadSiteSearchProvidersFromStorage\(\)[\s\S]*?beginSiteSearchProviderLoad\([\s\S]*?\{ invalidate: true \}\)/,
    `${surface} storage reloads should invalidate older provider loads`
  );
  assert.match(
    source,
    /const providerReload = reloadSiteSearchProvidersFromStorage\(\);[\s\S]*?providerReload\.version !== siteSearchProvidersLoadVersion[\s\S]*?return;/,
    `${surface} should ignore UI work from superseded storage reloads`
  );

  const firstHarness = createLoadHarness(source);
  const staleAfter = createDeferred();
  const freshFirst = createDeferred();
  const staleAfterTask = firstHarness.begin(() => staleAfter.promise);
  const freshFirstTask = firstHarness.begin(() => freshFirst.promise, { invalidate: true });
  freshFirst.resolve([{ id: 'fresh' }]);
  assert.deepStrictEqual(await freshFirstTask.promise, [{ id: 'fresh' }]);
  staleAfter.resolve([{ id: 'stale' }]);
  assert.deepStrictEqual(await staleAfterTask.promise, [{ id: 'fresh' }]);
  assert.deepStrictEqual(
    firstHarness.getCache(),
    [{ id: 'fresh' }],
    `${surface} must not let a stale startup load overwrite a newer storage reload`
  );

  const secondHarness = createLoadHarness(source);
  const staleFirst = createDeferred();
  const freshAfter = createDeferred();
  const staleFirstTask = secondHarness.begin(() => staleFirst.promise);
  const freshAfterTask = secondHarness.begin(() => freshAfter.promise, { invalidate: true });
  staleFirst.resolve([{ id: 'stale' }]);
  assert.deepStrictEqual(await staleFirstTask.promise, []);
  assert.strictEqual(secondHarness.getCache(), null);
  freshAfter.resolve([{ id: 'fresh' }]);
  assert.deepStrictEqual(await freshAfterTask.promise, [{ id: 'fresh' }]);
  assert.deepStrictEqual(secondHarness.getCache(), [{ id: 'fresh' }]);

  const identityHarness = createLoadHarness(source);
  const olderSameGeneration = createDeferred();
  const currentSameGeneration = createDeferred();
  const olderTask = identityHarness.begin(() => olderSameGeneration.promise);
  const currentTask = identityHarness.begin(() => currentSameGeneration.promise);
  currentSameGeneration.resolve([{ id: 'current' }]);
  await currentTask.promise;
  olderSameGeneration.resolve([{ id: 'older' }]);
  await olderTask.promise;
  assert.deepStrictEqual(
    identityHarness.getCache(),
    [{ id: 'current' }],
    `${surface} must require in-flight promise identity before publishing providers`
  );
}

async function main() {
  const surfaces = [
    ['newtab', fs.readFileSync('src/newtab/newtab.js', 'utf8')],
    ['overlay', fs.readFileSync('src/overlay/search-panel.js', 'utf8')]
  ];
  for (const [surface, source] of surfaces) {
    await verifyLoadGuard(surface, source);
  }
  console.log('site search provider load race tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
