// WebDAV sync names, timings and limits.

const DB_NAME = 'lumno-webdav-private';
const ALARM_NAME = 'lumno-webdav-sync';
const SYNC_REVISION = 'dav-multi-1';
const PROBE_CACHE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Below the 30 s idle limit of Firefox event pages and Chrome service workers.
const KEEP_ALIVE_INTERVAL_MS = 20 * 1000;
// Synced connection hints stay far below chrome.storage.sync's 8 KB item quota.
const MAX_HINTS = 10;
const MAX_HINT_BYTES = 600;
// Server snapshots of replaced remote states kept per device and connection.
const SNAPSHOT_SLOTS = 10;
// Contract failures in this device's own data; capture reports them as
// local-<code> so the settings card never blames the remote copy.
const LOCAL_DATA_CODES = ['invalid-state', 'state-too-large', 'invalid-shortcuts', 'invalid-icon', 'invalid-wallpaper',
  'invalid-asset', 'asset-too-large'];
const CONNECTION_FIELDS = ['endpoint', 'directory', 'username', 'password'] as const;
const ACCOUNT_FIELDS = ['endpoint', 'directory', 'username'] as const;

// Two browsers on one account, even on the same computer, routinely meet
// at the write lock or commit between each other's read and write. Merge
// again after a short, jittered wait before calling it a failure. A lock
// that outlasts every retry is reported: an uncertain write may own it.
const CONTENTION_CODES = ['remote-locked', 'remote-changed'];

// A server that rate limits this account (Nutstore's 503) or is briefly
// unavailable is left alone for a while: polling it again every round only
// prolongs the block. Background rounds wait until the saved time; the
// user can still sync by hand. The waits grow while refusals continue.
const THROTTLE_CODES = ['http-429', 'http-503'];

// Answers to the first-join choice: keep one side, or merge wallpapers onto the server's copy.
const INITIAL_DECISIONS: readonly unknown[] = ['local', 'remote', 'merge'];

export {
  ACCOUNT_FIELDS,
  ALARM_NAME,
  CONNECTION_FIELDS,
  CONTENTION_CODES,
  DB_NAME,
  INITIAL_DECISIONS,
  KEEP_ALIVE_INTERVAL_MS,
  LOCAL_DATA_CODES,
  MAX_HINTS,
  MAX_HINT_BYTES,
  PROBE_CACHE_MS,
  SNAPSHOT_SLOTS,
  SWEEP_INTERVAL_MS,
  SYNC_REVISION,
  THROTTLE_CODES
};
