'use strict';

// End-to-end flows in a real headless Chrome with this checkout loaded as an
// unpacked extension. Needs a built checkout (npm run build) and a local
// Chrome (see browser.js for where it is looked for).
//
//   npm run test:e2e
//   npm run test:e2e -- overlay-search tab-switcher   (some flows)
//   npm run test:e2e -- --extension=dist/unpacked     (an unpacked package)
//   LUMNO_E2E_CHROME=/path/to/chrome npm run test:e2e

const path = require('path');
require('../../scripts/node/register-typescript');
const { launchBrowser } = require('./browser');
const { startFixtureServer } = require('./fixtures');
const FLOWS = require('./flows');

const repoRoot = path.resolve(__dirname, '..', '..');

function parseArguments(argv) {
  let extensionPath = repoRoot;
  const names = [];
  argv.forEach((argument) => {
    if (argument.startsWith('--extension=')) {
      extensionPath = path.resolve(argument.slice('--extension='.length));
    } else {
      names.push(argument);
    }
  });
  const unknown = names.filter((name) => !FLOWS[name]);
  if (unknown.length) {
    throw new Error(`Unknown flow(s): ${unknown.join(', ')}. Flows: ${Object.keys(FLOWS).join(', ')}`);
  }
  return { extensionPath, names: names.length ? names : Object.keys(FLOWS) };
}

async function runFlow(name, extensionPath, fixtures) {
  const started = Date.now();
  const browser = await launchBrowser({ extensionPath });
  let error = null;
  try {
    await FLOWS[name]({ browser, fixtures });
  } catch (caught) {
    error = caught;
  } finally {
    await browser.close();
  }
  const problems = [];
  if (error) problems.push(error.stack || String(error));
  problems.push(...browser.failures);
  return { name, ok: problems.length === 0, problems, notes: browser.notes, seconds: (Date.now() - started) / 1000 };
}

async function main() {
  const { extensionPath, names } = parseArguments(process.argv.slice(2));
  const fixtures = await startFixtureServer();
  const results = [];
  try {
    for (const name of names) {
      const result = await runFlow(name, extensionPath, fixtures);
      results.push(result);
      process.stdout.write(`[E2E] ${result.ok ? 'ok  ' : 'FAIL'} ${name} (${result.seconds.toFixed(1)}s)\n`);
      result.problems.forEach((problem) => process.stderr.write(`  ${problem.replace(/\n/g, '\n  ')}\n`));
      if (result.notes.length) {
        process.stdout.write(`  other origins (not failures):\n  ${result.notes.join('\n  ')}\n`);
      }
    }
  } finally {
    await fixtures.close();
  }
  const failed = results.filter((result) => !result.ok);
  if (failed.length) {
    process.stderr.write(`\n${failed.length} of ${results.length} flow(s) failed.\n`);
    process.exit(1);
  }
  process.stdout.write(`\nAll ${results.length} flows passed.\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
