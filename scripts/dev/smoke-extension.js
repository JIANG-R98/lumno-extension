// Real-browser smoke check for every extension surface.
//
// Loads this checkout as an unpacked extension into a throwaway headless
// Chrome over a CDP pipe (Extensions.loadUnpacked, so branded Chrome works
// too), then opens New Tab, Settings, Onboarding and the popup, types into the
// New Tab search box, changes a set of settings under the open New Tab, walks
// its appearance panel, and opens the search overlay and the tab switcher on a
// local web page. Any uncaught exception, console error or failed extension
// resource fails the run; failed loads from other origins (remote images,
// wallpapers) are only listed.
//
//   npm run smoke
//   npm run smoke -- dist/unpacked          (an unpacked store package)
//   LUMNO_SMOKE_CHROME=/path/to/chrome npm run smoke
//
// Not part of `npm test`: it needs a local Chrome.
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const extensionRoot = path.resolve(process.argv[2] || repoRoot);
const CHROME_CANDIDATES = [
  process.env.LUMNO_SMOKE_CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean);
const PAGES = [
  'newtab.html',
  'newtab.html?focus=1',
  'src/options/options.html',
  'src/onboarding/onboarding.html',
  'src/popup/popup.html'
];
const PAGE_SETTLE_MS = 3500;
// Settings written while New Tab is open, by their LumnoSettings key names;
// the last round puts most of them back.
const SETTINGS_ROUNDS = [
  {
    THEME_STORAGE_KEY: 'dark',
    LANGUAGE_STORAGE_KEY: 'en',
    NEWTAB_THEME_MODE_STORAGE_KEY: 'dark',
    NEWTAB_GLASS_STYLE_STORAGE_KEY: 'liquid',
    NEWTAB_GLASS_THEME_STORAGE_KEY: 'dark',
    NEWTAB_TOP_CONTENT_MODE_STORAGE_KEY: 'time',
    NEWTAB_TIME_FONT_SIZE_STORAGE_KEY: 72,
    NEWTAB_TIME_SECONDS_VISIBLE_STORAGE_KEY: true,
    NEWTAB_WIDTH_MODE_STORAGE_KEY: 'wide',
    NEWTAB_SHORTCUT_COLUMNS_STORAGE_KEY: 6,
    NEWTAB_SHORTCUT_SIZE_STORAGE_KEY: 64,
    NEWTAB_SHORTCUT_GAP_STORAGE_KEY: 20,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: false,
    BOOKMARK_COUNT_STORAGE_KEY: 12,
    BOOKMARK_COLUMNS_STORAGE_KEY: 3,
    BOOKMARK_FOLDER_ICONS_VISIBLE_STORAGE_KEY: false,
    RECENT_COUNT_STORAGE_KEY: 12,
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY: false,
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY: false,
    NEWTAB_ZEN_MODE_STORAGE_KEY: true,
    SEARCH_RESULT_DISPLAY_LIMIT_STORAGE_KEY: 6,
    NEWTAB_OPEN_IN_NEW_TAB_STORAGE_KEY: true,
    NUMBER_SHORTCUT_INSTANT_ENABLED_STORAGE_KEY: true,
    SEARCH_BLACKLIST_STORAGE_KEY: ['example.com'],
    FAVICON_ENHANCED_FETCH_ENABLED_STORAGE_KEY: true
  },
  {
    THEME_STORAGE_KEY: 'light',
    LANGUAGE_STORAGE_KEY: 'zh_CN',
    NEWTAB_GLASS_STYLE_STORAGE_KEY: 'frosted',
    NEWTAB_ZEN_MODE_STORAGE_KEY: false,
    NEWTAB_SHORTCUTS_VISIBLE_STORAGE_KEY: true,
    NEWTAB_FEEDBACK_BUTTON_VISIBLE_STORAGE_KEY: true,
    NEWTAB_APPEARANCE_BUTTON_VISIBLE_STORAGE_KEY: true
  }
];

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  return CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || null;
}

// CDP over --remote-debugging-pipe: fd 3 carries requests, fd 4 responses,
// each message terminated by a NUL byte.
function createPipeConnection(child) {
  const writer = child.stdio[3];
  const reader = child.stdio[4];
  const pending = new Map();
  const listeners = [];
  let nextId = 1;
  let buffer = '';
  reader.on('data', (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject, method } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result || {});
      } else {
        listeners.forEach((listener) => listener(message));
      }
    }
  });
  return {
    send(method, params = {}, sessionId) {
      const id = nextId++;
      writer.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
    },
    onEvent(listener) {
      listeners.push(listener);
    }
  };
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) {
    console.error('No Chrome found; set LUMNO_SMOKE_CHROME.');
    process.exit(1);
  }
  const server = http.createServer((_request, response) => {
    response.setHeader('content-type', 'text/html');
    response.end(`<!doctype html><title>Smoke page</title><h1>Smoke</h1><p>${'text '.repeat(200)}</p>`);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const webUrl = `http://127.0.0.1:${server.address().port}/page.html`;

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumno-smoke-'));
  const child = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1400,900'
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const cdp = createPipeConnection(child);
  const labels = new Map();
  const failures = [];
  const notes = [];
  let extensionId = '';

  cdp.onEvent((message) => {
    const label = labels.get(message.sessionId) || 'browser';
    if (message.method === 'Target.attachedToTarget') {
      const { sessionId, targetInfo } = message.params;
      labels.set(sessionId, `${targetInfo.type}:${targetInfo.url.replace(/^chrome-extension:\/\/[a-z]+\//, '')}`);
      cdp.send('Runtime.enable', {}, sessionId).catch(() => {});
      cdp.send('Log.enable', {}, sessionId).catch(() => {});
      cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      const text = (details.exception && details.exception.description) || details.text;
      failures.push(`[${label}] uncaught ${text.split('\n').slice(0, 3).join(' | ')} (${details.url || ''}:${details.lineNumber})`);
    } else if (message.method === 'Runtime.consoleAPICalled' &&
        (message.params.type === 'error' || message.params.type === 'assert')) {
      const text = message.params.args.map((arg) => arg.value || arg.description || '').join(' ');
      failures.push(`[${label}] console.${message.params.type} ${text}`);
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const { entry } = message.params;
      const line = `[${label}] ${entry.source}: ${entry.text} ${entry.url || ''}`;
      if (entry.url && extensionId && !entry.url.startsWith(`chrome-extension://${extensionId}/`)) {
        notes.push(line);
      } else {
        failures.push(line);
      }
    }
  });

  async function openTarget(url) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    labels.set(sessionId, url.replace(/^chrome-extension:\/\/[a-z]+\//, ''));
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Page.navigate', { url }, sessionId);
    return sessionId;
  }

  async function evaluate(sessionId, expression) {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception ? exceptionDetails.exception.description : exceptionDetails.text);
    }
    return result.value;
  }

  const report = {};
  try {
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extensionRoot }));
    await delay(1500);
    const { targetInfos } = await cdp.send('Target.getTargets');
    const worker = targetInfos.find((target) => target.type === 'service_worker' && target.url.includes(extensionId));
    if (!worker) {
      throw new Error('the service worker did not start');
    }
    const { sessionId: workerSession } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    labels.set(workerSession, 'service_worker');
    await cdp.send('Runtime.enable', {}, workerSession);

    for (const page of PAGES) {
      const sessionId = await openTarget(`chrome-extension://${extensionId}/${page}`);
      await delay(PAGE_SETTLE_MS);
      report[page] = await evaluate(sessionId, `({
        title: document.title,
        elements: document.querySelectorAll('*').length,
        textLength: (document.body ? document.body.innerText : '').length
      })`);
      if (page === 'newtab.html') {
        report['newtab search'] = await evaluate(sessionId, `(async () => {
          const input = document.querySelector('input');
          if (!input) return 'no input';
          input.focus();
          input.value = 'git';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 1500));
          return document.querySelectorAll('[class*=suggestion]').length + ' suggestion elements';
        })()`);
        // Change settings under the open page so its storage listeners run;
        // the pages opened next start from the changed values.
        report['newtab settings changes'] = await evaluate(sessionId, `(async () => {
          const settings = globalThis.LumnoSettings;
          const rounds = [${JSON.stringify(SETTINGS_ROUNDS)}][0];
          let applied = 0;
          for (const round of rounds) {
            const values = {};
            Object.entries(round).forEach(([name, value]) => {
              if (settings[name]) values[settings[name]] = value;
            });
            applied += Object.keys(values).length;
            await chrome.storage.sync.set(values);
            await chrome.storage.local.set(values);
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          return applied + ' values written';
        })()`);
        // Open the appearance panel and walk its source tabs, theme modes,
        // a wallpaper and a favicon, then close it.
        report['newtab appearance panel'] = await evaluate(sessionId, `(async () => {
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const button = document.querySelector('.x-nt-wallpaper-button');
          if (!button) return 'no appearance button';
          button.click();
          await wait(900);
          let clicks = 0;
          const clickAll = async (selector, limit) => {
            for (const element of Array.from(document.querySelectorAll(selector)).slice(0, limit)) {
              element.click();
              clicks += 1;
              await wait(250);
            }
          };
          await clickAll('[data-wallpaper-tab]', 8);
          await clickAll('[data-wallpaper-mode]', 3);
          await clickAll('[data-wallpaper-id]', 2);
          await clickAll('[data-newtab-favicon-id]', 2);
          await clickAll('[data-wallpaper-effect-ink-tone]', 2);
          button.click();
          await wait(600);
          return clicks + ' panel controls clicked';
        })()`);
      }
    }

    const webSession = await openTarget(webUrl);
    await delay(2500);
    await evaluate(workerSession, `(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      await chrome.tabs.update(tab.id, { active: true });
      triggerShowSearchForTab(tab, 'commands');
    })()`);
    await delay(2500);
    report.overlay = await evaluate(webSession,
      `document.querySelectorAll('[id*=_x_extension], [class*=x-lumno]').length + ' overlay elements'`);
    await evaluate(workerSession, `(async () => {
      const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/*' });
      triggerTabSwitcherForTab(tab, 'commands-tab-switcher', Date.now());
    })()`);
    await delay(2000);
    report['tab switcher'] = await evaluate(webSession,
      `document.querySelectorAll('[id*=_x_extension], [class*=x-lumno], [class*=x-ov]').length + ' overlay elements'`);
  } catch (error) {
    failures.push(`smoke run stopped: ${error.message}`);
  } finally {
    child.kill('SIGKILL');
    server.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  console.log(JSON.stringify(report, null, 2));
  if (notes.length) {
    console.log(`\nOther origins (not failures):\n${notes.join('\n')}`);
  }
  if (failures.length) {
    console.error(`\nSmoke check failed:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('\nSmoke check passed.');
}

main();
