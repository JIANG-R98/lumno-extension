const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { readPageSource } = require('./helpers/page-source');

const repoRoot = path.join(__dirname, '..');

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(repoPath(relativePath), 'utf8');
}

function assertPathMissing(relativePath) {
  assert.ok(!fs.existsSync(repoPath(relativePath)), `${relativePath} should be removed`);
}

[
  'src/background/telemetry.js',
  'src/shared/telemetry-schema.js',
  'serverless/tencent-scf-telemetry-ingest',
  'docs/telemetry-plan.md',
  'scripts/test-telemetry-runtime.js',
  'scripts/test-telemetry-schema.js',
  'scripts/test-telemetry-ingest-sanitize.js',
  'scripts/test-options-telemetry-copy.js'
].forEach(assertPathMissing);

const accountUi = readPageSource('src/options/options.html');
const background = read('src/background/background.js');

[
  'src/background/usage-analytics-runtime.js',
  'src/shared/cloud-sync-schema.js',
  'supabase/functions/telemetry-ingest/index.ts'
].forEach(assertPathMissing);
assert.doesNotMatch(accountUi, /_x_extension_cloud_|Lumno 账号同步|开启账号同步/,
  'the account page should not expose account sync or analytics controls');
assert.doesNotMatch(background, /cloudRecordUsage|recordCloudUsageMetric|usage-analytics-runtime/,
  'the extension runtime should not collect or upload account-linked usage statistics');

console.log('usage statistics removal tests passed');
