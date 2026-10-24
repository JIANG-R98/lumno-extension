const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

// Runs every tests/<area>/test-*.js file in its own Node process. Files run
// in a bounded worker pool; each file's output is buffered and printed in path
// order so logs read the same as a serial run. Set LUMNO_TEST_SERIAL=1 to run
// one file at a time (or LUMNO_TEST_JOBS=<n> to pick the pool size).
//
// Arguments narrow the run to files whose path contains any of them:
//   npm run test:legacy -- newtab/ overlay-font

const repoRoot = path.join(__dirname, '..');
const filters = process.argv.slice(2);

function collectTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isDirectory()) {
        // helpers/ holds shared code; e2e/ runs in a browser (npm run test:e2e).
        return entry.name === 'helpers' || entry.name === 'e2e' ? [] : collectTestFiles(path.join(directory, entry.name));
      }
      return /^test-.*\.js$/.test(entry.name) ? [path.join(directory, entry.name)] : [];
    });
}

const testFiles = collectTestFiles(__dirname)
  .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
  .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
  .sort();

const MAX_JOBS = 8;

// Lets each test file load TypeScript sources (see the file for details).
const TYPESCRIPT_HOOKS = path.join(repoRoot, 'scripts', 'node', 'register-typescript.js');

function getJobCount() {
  if (process.env.LUMNO_TEST_SERIAL === '1') {
    return 1;
  }
  const requested = Number.parseInt(process.env.LUMNO_TEST_JOBS || '', 10);
  if (Number.isFinite(requested) && requested > 0) {
    return requested;
  }
  const available = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length;
  return Math.max(1, Math.min(MAX_JOBS, available || 1));
}

function runTestFile(relativePath) {
  return new Promise((resolve) => {
    const chunks = [];
    const child = spawn(process.execPath, ['--require', TYPESCRIPT_HOOKS, relativePath], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout.on('data', (chunk) => chunks.push({ stream: 'stdout', chunk }));
    child.stderr.on('data', (chunk) => chunks.push({ stream: 'stderr', chunk }));
    child.on('error', (error) => {
      chunks.push({ stream: 'stderr', chunk: Buffer.from(`${error.stack || error}\n`) });
    });
    child.on('close', (code, signal) => {
      resolve({ chunks, ok: code === 0 && !signal });
    });
  });
}

async function main() {
  if (testFiles.length === 0) {
    process.stderr.write(`No test files match: ${filters.join(' ')}\n`);
    process.exit(1);
  }
  const jobs = Math.min(getJobCount(), testFiles.length) || 1;
  const results = new Array(testFiles.length);
  let nextToStart = 0;
  let nextToPrint = 0;
  let failures = 0;

  // Print finished results as soon as every earlier file has been printed.
  function flush() {
    while (nextToPrint < testFiles.length && results[nextToPrint]) {
      const relativePath = testFiles[nextToPrint];
      const result = results[nextToPrint];
      process.stdout.write(`\n[TEST] ${relativePath}\n`);
      result.chunks.forEach(({ stream, chunk }) => process[stream].write(chunk));
      if (!result.ok) {
        failures += 1;
        process.stderr.write(`[FAIL] ${relativePath}\n`);
      }
      results[nextToPrint] = true;
      nextToPrint += 1;
    }
  }

  async function worker() {
    while (nextToStart < testFiles.length) {
      const index = nextToStart;
      nextToStart += 1;
      results[index] = await runTestFile(testFiles[index]);
      flush();
    }
  }

  await Promise.all(Array.from({ length: jobs }, worker));

  if (failures > 0) {
    process.stderr.write(`\n${failures} test file(s) failed.\n`);
    process.exit(1);
  }

  process.stdout.write(`\nAll ${testFiles.length} test files passed.\n`);
}

main();
