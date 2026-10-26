import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RegisteredScript, RegistrationChromeApi } from './content-script-registration';
import { SCRIPT_FILES, SCRIPT_ID, createPipPageBridgeRegistration, readAutoPipMatches } from './pip-page-bridge-registration';

function isManifest(value: unknown): value is chrome.runtime.Manifest {
  return Boolean(value) && typeof value === 'object' && value !== null && 'manifest_version' in value;
}

function readRepositoryManifest(): chrome.runtime.Manifest {
  const parsed: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'manifest.json'), 'utf8'));
  if (!isManifest(parsed)) {
    throw new Error('manifest.json is not a manifest');
  }
  return parsed;
}

function createScriptingStub(initial: RegisteredScript[] = []): {
  chromeApi: RegistrationChromeApi;
  registered: () => RegisteredScript[];
  calls: string[];
} {
  let registered = initial.slice();
  const calls: string[] = [];
  const chromeApi: RegistrationChromeApi = {
    runtime: { lastError: null },
    scripting: {
      getRegisteredContentScripts(filter, callback) {
        calls.push('get');
        callback(registered.filter((script) => filter.ids.includes(script.id)));
      },
      registerContentScripts(scripts, callback) {
        calls.push('register');
        registered = registered.concat(scripts);
        callback();
      },
      updateContentScripts(scripts, callback) {
        calls.push('update');
        registered = registered.map((script) => scripts.find((next) => next.id === script.id) || script);
        callback();
      },
      unregisterContentScripts(filter, callback) {
        calls.push('unregister');
        registered = registered.filter((script) => !filter.ids.includes(script.id));
        callback();
      }
    }
  };
  return { chromeApi, registered: () => registered, calls };
}

describe('pip page bridge registration', () => {
  const manifest = readRepositoryManifest();

  it('covers exactly the sites of both automatic picture-in-picture scripts', () => {
    const expected = (manifest.content_scripts || [])
      .filter((entry) => (entry.js || []).some((file) => /\/(site|youtube)-auto-pip\.js$/.test(file)))
      .flatMap((entry) => entry.matches || []);
    const matches = readAutoPipMatches(manifest);

    expect(matches.length).toBeGreaterThan(0);
    expect(new Set(matches)).toEqual(new Set(expected));
    expect(matches).toContain('*://*.youtube.com/*');
    expect(matches).not.toContain('<all_urls>');
  });

  it('registers the bridge in the main world at document start, top frame only', async () => {
    const stub = createScriptingStub();
    const registration = createPipPageBridgeRegistration({ chromeApi: stub.chromeApi, manifest });

    expect(await registration.sync(true)).toBe(true);

    expect(stub.registered()).toEqual([{
      id: SCRIPT_ID,
      matches: readAutoPipMatches(manifest),
      js: Array.from(SCRIPT_FILES),
      runAt: 'document_start',
      allFrames: false,
      world: 'MAIN',
      persistAcrossSessions: true
    }]);
  });

  it('updates a registration that runs in the isolated world', async () => {
    const stub = createScriptingStub([{
      id: SCRIPT_ID,
      matches: readAutoPipMatches(manifest),
      js: Array.from(SCRIPT_FILES),
      runAt: 'document_start',
      allFrames: false
    }]);
    const registration = createPipPageBridgeRegistration({ chromeApi: stub.chromeApi, manifest });

    await registration.sync(true);

    expect(stub.calls).toEqual(['get', 'update']);
    expect(stub.registered()[0].world).toBe('MAIN');
  });

  it('removes any registration when the manifest has no automatic picture-in-picture scripts', async () => {
    const withoutAutoPip: chrome.runtime.Manifest = {
      ...manifest,
      content_scripts: (manifest.content_scripts || [])
        .filter((entry) => !(entry.js || []).some((file) => file.includes('auto-pip')))
    };
    const stub = createScriptingStub([{ id: SCRIPT_ID, js: Array.from(SCRIPT_FILES) }]);
    const registration = createPipPageBridgeRegistration({ chromeApi: stub.chromeApi, manifest: withoutAutoPip });

    expect(registration.matches).toEqual([]);
    expect(await registration.sync(true)).toBe(false);
    expect(stub.registered()).toEqual([]);
  });
});
