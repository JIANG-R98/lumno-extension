import { describe, expect, it } from 'vitest';
import { INJECTED_APP_PATHS } from '../domain/injected-commands';
import { createInjectedAppRun, loadInjectedApps } from './injection';

const runtime = { getURL: (path: string) => `chrome-extension://lumno-test/${path}` };

describe('createInjectedAppRun', () => {
  it('imports the apps by their extension URLs and sends the command to the last one', () => {
    const command = { type: 'toggle', context: { tabs: [] } };
    const injection = createInjectedAppRun(runtime, { tabId: 7 }, ['icon-font-preload', 'tab-switcher'], command, {
      injectImmediately: true
    });

    expect(injection.target).toEqual({ tabId: 7 });
    expect(injection.injectImmediately).toBe(true);
    expect('func' in injection ? injection.func : null).toBe(loadInjectedApps);
    expect('args' in injection ? injection.args : null).toEqual([
      [
        `chrome-extension://lumno-test/${INJECTED_APP_PATHS['icon-font-preload']}`,
        `chrome-extension://lumno-test/${INJECTED_APP_PATHS['tab-switcher']}`
      ],
      command
    ]);
  });

  it('waits for the page to be idle unless asked to inject at once', () => {
    expect(createInjectedAppRun(runtime, { tabId: 1 }, ['overlay'], null).injectImmediately).toBe(false);
  });
});

describe('loadInjectedApps', () => {
  // Data URLs stand in for extension URLs: the function only imports them.
  const moduleUrl = (source: string) => `data:text/javascript,${encodeURIComponent(source)}`;

  it('resolves with what the last module run() returns for the command', async () => {
    const first = moduleUrl('globalThis.__lumnoInjectionTestOrder = ["first"];');
    const last = moduleUrl('export function run(command) { return { ran: command.type, order: globalThis.__lumnoInjectionTestOrder }; }');

    await expect(loadInjectedApps([first, last], { type: 'toggle' })).resolves.toEqual({
      ran: 'toggle',
      order: ['first']
    });
    Reflect.deleteProperty(globalThis, '__lumnoInjectionTestOrder');
  });

  it('reports a module without run()', async () => {
    await expect(loadInjectedApps([moduleUrl('export const value = 1;')], {})).resolves.toEqual({
      ok: false,
      reason: 'app-missing'
    });
  });
});
