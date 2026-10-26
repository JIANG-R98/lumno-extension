// Earlier versions of tracked cards, newest first, keyed by site. Kept in
// local storage: the pinned cards sync, and synced items are capped at 8 KB.
const MAX_VERSIONS = 10;

// A page a tracked card pointed at before.
interface ProgressVersion {
  url: string;
  title: string;
  updatedAt: number;
}

type ProgressHistoryMap = Record<string, ProgressVersion[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function normalizeVersion(value: unknown): ProgressVersion | null {
  if (!isRecord(value)) return null;
  const url = String(value.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    title: String(value.title || '').replace(/\s+/g, ' ').trim(),
    updatedAt: Math.max(0, Number(value.updatedAt) || 0)
  };
}

function normalizeVersions(value: unknown): ProgressVersion[] {
  if (!Array.isArray(value)) return [];
  const versions: ProgressVersion[] = [];
  value.forEach((entry) => {
    const version = normalizeVersion(entry);
    if (version && !versions.some((existing) => existing.url === version.url)) {
      versions.push(version);
    }
  });
  return versions.slice(0, MAX_VERSIONS);
}

function normalizeHistoryMap(value: unknown): ProgressHistoryMap {
  const map: ProgressHistoryMap = {};
  if (!isRecord(value) || Array.isArray(value)) return map;
  Object.keys(value).forEach((siteKey) => {
    const versions = normalizeVersions(value[siteKey]);
    if (siteKey && versions.length) map[siteKey] = versions;
  });
  return map;
}

// Records the version a card is leaving. A URL already in the history moves
// to the front instead of appearing twice.
function recordVersion(map: unknown, siteKey: string, version: unknown): ProgressHistoryMap {
  const next = normalizeHistoryMap(map);
  const entry = normalizeVersion(version);
  if (!siteKey || !entry) return next;
  next[siteKey] = normalizeVersions([entry].concat(next[siteKey] || []));
  return next;
}

// Makes a retained version current. The version the card is leaving takes
// its place at the front, so restoring can always be undone the same way.
function restoreVersion(map: unknown, siteKey: string, index: number, currentVersion: unknown): { map: ProgressHistoryMap; version: ProgressVersion | null } {
  const next = normalizeHistoryMap(map);
  const versions = next[siteKey] || [];
  const restored = versions[index];
  if (!restored) return { map: next, version: null };
  const remaining = versions.filter((_, position) => position !== index);
  const current = normalizeVersion(currentVersion);
  next[siteKey] = normalizeVersions(current ? [current].concat(remaining) : remaining);
  if (!next[siteKey].length) delete next[siteKey];
  return { map: next, version: restored };
}

// Tracked cards store their history under their own id; cards tracked
// before ids existed fall back to their site.
function getHistoryId(
  card: { progressId?: unknown; url?: unknown } | null | undefined,
  progressMatch?: { getProgressSiteKey(url: unknown): string } | null
): string {
  const progressId = String(card && card.progressId || '').trim();
  if (progressId) return progressId;
  return progressMatch && card ? progressMatch.getProgressSiteKey(card.url) : '';
}

function createProgressId(now?: number): string {
  const time = Math.max(0, Number(now) || Date.now()).toString(36);
  return `p${time}${Math.random().toString(36).slice(2, 8)}`;
}

function removeSite(map: unknown, siteKey: string): ProgressHistoryMap {
  const next = normalizeHistoryMap(map);
  delete next[siteKey];
  return next;
}

export {
  MAX_VERSIONS,
  createProgressId,
  getHistoryId,
  normalizeHistoryMap,
  normalizeVersions,
  recordVersion,
  removeSite,
  restoreVersion
};
export type { ProgressHistoryMap, ProgressVersion };
