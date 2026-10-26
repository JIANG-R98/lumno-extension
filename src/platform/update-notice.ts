// The "updated to vX" notice's data: the record the worker publishes after an
// update (with the release title from GitHub), the person's setting, and how
// many times each version's notice was shown. shared/update-notice.ts shows it.
import type { Setting } from '../domain/settings/define';
import * as SETTINGS from '../domain/settings/features';
import type { StorageChromeApi } from './settings-storage';
import type { SettingsStore } from './settings-store';
import { updateNoticeState } from '../domain/settings/features';

// The extension API the notice reads: the manifest version and storage.
type UpdateNoticeChromeApi = StorageChromeApi & {
  runtime?: StorageChromeApi['runtime'] & { getManifest?: () => { version?: string } };
};

interface ReleaseResponse {
  ok: boolean;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

type ReleaseFetch = (url: string, init?: { headers?: Record<string, string> }) => Promise<ReleaseResponse | null | undefined>;

// A published update notice.
interface UpdateNotice {
  version: string;
  previousVersion: string;
  title: string;
  releaseUrl: string;
  // 'update' for a notice the surfaces show.
  reason: string;
  updatedAt: number;
}

interface PublishOptions {
  chromeApi?: UpdateNoticeChromeApi | null;
  // Where the notice is saved.
  settingsStore: SettingsStore;
  fetchImpl?: ReleaseFetch | null;
  version?: string;
  previousVersion?: unknown;
  title?: unknown;
  releaseUrl?: unknown;
  reason?: string;
}

const UPDATE_NOTICE_MAX_DISPLAY_COUNT = 3;
const RELEASE_DETAILS_URL = 'https://lumno.kubai.design/release/';
const GITHUB_RELEASE_API_URL = 'https://api.github.com/repos/kubai087/lumno-extension/releases/tags/';
const GITHUB_RELEASE_PAGE_URL = 'https://github.com/kubai087/lumno-extension/releases/tag/';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function getChromeApi(chromeApi: UpdateNoticeChromeApi | null | undefined): UpdateNoticeChromeApi | null {
  return chromeApi || (typeof chrome !== 'undefined' ? chrome : null);
}

function normalizeVersionTag(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return /^v/i.test(raw) ? `v${raw.slice(1)}` : `v${raw}`;
}

function formatVersionLabel(value: unknown): string {
  return normalizeVersionTag(value).replace(/^v/i, '');
}

// The tags a release may be published under: as given, with and without v.
function getReleaseTagCandidates(value: unknown): string[] {
  const raw = String(value || '').trim();
  const normalized = normalizeVersionTag(raw);
  const bare = formatVersionLabel(raw);
  return [raw, normalized, bare].filter((candidate, index, list) => (
    candidate && list.indexOf(candidate) === index
  ));
}

function sanitizeText(value: unknown): string {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F-\u009F\uFEFF\uFFF9-\uFFFD]|\p{Co}/gu, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(String(value || '').replace(/<[^>]*>/g, ' '));
}

// A release page's title, when the API answered nothing.
function extractReleaseTitleFromHtml(html: unknown): string {
  const source = String(html || '');
  const titleMatch = source.match(/<title>\s*Release\s+([\s\S]*?)\s+·\s+[^<]*?GitHub\s*<\/title>/i);
  if (titleMatch) {
    return sanitizeText(stripHtmlTags(titleMatch[1]));
  }
  const ogTitleMatch = source.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']Release\s+([^"']+?)\s+·\s+[^"']*["'][^>]*>/i);
  if (ogTitleMatch) {
    return sanitizeText(stripHtmlTags(ogTitleMatch[1]));
  }
  const h1Match = source.match(/<h1\b[^>]*class=["'][^"']*\bd-inline\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i);
  return h1Match ? sanitizeText(stripHtmlTags(h1Match[1])) : '';
}

function getCurrentVersionTag(chromeApi?: UpdateNoticeChromeApi | null): string {
  const api = getChromeApi(chromeApi);
  const getManifest = api && api.runtime ? api.runtime.getManifest : undefined;
  const manifest = typeof getManifest === 'function' ? getManifest() : null;
  return normalizeVersionTag(String(manifest && manifest.version || '').trim());
}

function buildReleaseDetailsUrl(versionTag: unknown, options?: { reason?: unknown } | null): string {
  const params = new URLSearchParams();
  params.set('entry', 'ext');
  const reason = options && typeof options.reason === 'string'
    ? String(options.reason).trim().toLowerCase()
    : '';
  if (reason) {
    params.set('reason', reason);
  }
  const normalizedVersion = normalizeVersionTag(versionTag);
  if (normalizedVersion) {
    params.set('version', normalizedVersion);
  }
  return `${RELEASE_DETAILS_URL}?${params.toString()}`;
}

function normalizeUpdateNoticePayload(payload: unknown): UpdateNotice | null {
  const source = isRecord(payload) ? payload : {};
  const version = normalizeVersionTag(source.version);
  if (!version) {
    return null;
  }
  const reason = String(source.reason || 'update').trim().toLowerCase() || 'update';
  const releaseUrl = String(source.releaseUrl || '').trim() || buildReleaseDetailsUrl(version, { reason });
  return {
    version,
    previousVersion: normalizeVersionTag(source.previousVersion),
    title: sanitizeText(source.title || source.releaseTitle || ''),
    releaseUrl,
    reason,
    updatedAt: Number(source.updatedAt) || 0
  };
}

function shouldShowUpdateNotice(payload: unknown, currentVersion: unknown): boolean {
  const notice = normalizeUpdateNoticePayload(payload);
  const currentVersionTag = normalizeVersionTag(currentVersion);
  return Boolean(
    notice &&
    currentVersionTag &&
    notice.version === currentVersionTag &&
    notice.reason === 'update'
  );
}

function normalizeUpdateNoticeEnabled(value: unknown): boolean {
  return SETTINGS.updateNoticeEnabled.parse(value);
}

// A storage-safe id part: letters, digits and underscores.
function getDomIdPart(id: unknown): string {
  return String(id || 'update-notice')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '') || 'update_notice';
}

// How many times this version's notice was shown.
function getUpdateNoticeDisplayCountSetting(versionTag: unknown): Setting<unknown> {
  const versionPart = getDomIdPart(normalizeVersionTag(versionTag) || 'unversioned');
  return SETTINGS.updateNoticeDisplayCount.member(versionPart);
}

function getUpdateNoticeDisplayCountKey(versionTag: unknown): string {
  return getUpdateNoticeDisplayCountSetting(versionTag).key;
}

function normalizeUpdateNoticeDisplayCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) {
    return 0;
  }
  return Math.min(UPDATE_NOTICE_MAX_DISPLAY_COUNT, Math.max(0, Math.floor(count)));
}

async function readStored(store: SettingsStore, setting: Setting<unknown>): Promise<unknown> {
  await store.include(setting);
  return store.getStored(setting);
}

async function getStoredUpdateNotice(store: SettingsStore): Promise<UpdateNotice | null> {
  return normalizeUpdateNoticePayload(await readStored(store, updateNoticeState));
}

async function getStoredUpdateNoticeEnabled(store: SettingsStore): Promise<boolean> {
  return normalizeUpdateNoticeEnabled(await readStored(store, SETTINGS.updateNoticeEnabled));
}

async function getStoredUpdateNoticeDisplayCount(store: SettingsStore, versionTag: unknown): Promise<number> {
  return normalizeUpdateNoticeDisplayCount(await readStored(store, getUpdateNoticeDisplayCountSetting(versionTag)));
}

// Resolves to whether the notice was saved.
async function setStoredUpdateNotice(store: SettingsStore, payload: unknown, callback?: (saved: boolean) => void): Promise<boolean> {
  const notice = normalizeUpdateNoticePayload(payload);
  const saved = notice ? await store.set(updateNoticeState, notice).then(() => true, () => false) : false;
  if (typeof callback === 'function') {
    callback(saved);
  }
  return saved;
}

function readReleaseTitle(release: unknown): string {
  if (!isRecord(release)) {
    return '';
  }
  return sanitizeText(release.name || release.title || release.tag_name || '');
}

// The release's title from GitHub's API, or else from its page; '' when
// neither answers.
function fetchReleaseTitle(versionTag: unknown, options?: { fetchImpl?: ReleaseFetch | null } | null): Promise<string> {
  const fetchImpl: ReleaseFetch | null = options && typeof options.fetchImpl === 'function'
    ? options.fetchImpl
    : (typeof fetch === 'function' ? (url, init) => fetch(url, init) : null);
  const normalizedVersion = normalizeVersionTag(versionTag);
  if (!fetchImpl || !normalizedVersion) {
    return Promise.resolve('');
  }
  const releaseFetch = fetchImpl;
  const candidates = getReleaseTagCandidates(versionTag);
  const headers = {
    Accept: 'application/vnd.github+json'
  };
  function tryApiCandidate(index: number): Promise<string> {
    const candidate = candidates[index];
    if (!candidate) {
      return Promise.resolve('');
    }
    return releaseFetch(`${GITHUB_RELEASE_API_URL}${encodeURIComponent(candidate)}`, { headers })
      .then((response): unknown => {
        if (!response || !response.ok || typeof response.json !== 'function') {
          return '';
        }
        return response.json();
      })
      .then((release) => readReleaseTitle(release) || tryApiCandidate(index + 1))
      .catch(() => tryApiCandidate(index + 1));
  }
  function tryPageCandidate(index: number): Promise<string> {
    const candidate = candidates[index];
    if (!candidate) {
      return Promise.resolve('');
    }
    return releaseFetch(`${GITHUB_RELEASE_PAGE_URL}${encodeURIComponent(candidate)}`)
      .then((response): string | Promise<string> => {
        if (!response || !response.ok || typeof response.text !== 'function') {
          return '';
        }
        return response.text();
      })
      .then((html) => extractReleaseTitleFromHtml(html) || tryPageCandidate(index + 1))
      .catch(() => tryPageCandidate(index + 1));
  }
  return tryApiCandidate(0).then((title) => title || tryPageCandidate(0));
}

// Saves the notice for this version, with its release title when one can be
// fetched; resolves false only when there is no version to announce.
function publishUpdateNotice(settings: PublishOptions, callback?: (saved: boolean) => void): Promise<boolean> {
  const chromeApi = getChromeApi(settings.chromeApi);
  const store = settings.settingsStore;
  const version = normalizeVersionTag(settings.version || getCurrentVersionTag(chromeApi));
  const reason = String(settings.reason || 'update').trim().toLowerCase() || 'update';
  const basePayload = version ? normalizeUpdateNoticePayload({
    version,
    previousVersion: settings.previousVersion,
    title: settings.title,
    releaseUrl: settings.releaseUrl || buildReleaseDetailsUrl(version, { reason }),
    reason,
    updatedAt: Date.now()
  }) : null;
  if (!basePayload) {
    if (typeof callback === 'function') {
      callback(false);
    }
    return Promise.resolve(false);
  }
  const titlePromise = basePayload.title
    ? Promise.resolve(basePayload.title)
    : fetchReleaseTitle(version, settings);
  return titlePromise
    .then((title) => ({ ...basePayload, title: sanitizeText(title || basePayload.title || '') }))
    .catch(() => basePayload)
    .then((payload) => setStoredUpdateNotice(store, payload, callback))
    .then(() => true);
}

export type { PublishOptions, ReleaseFetch, UpdateNotice, UpdateNoticeChromeApi };
export {
  UPDATE_NOTICE_MAX_DISPLAY_COUNT,
  RELEASE_DETAILS_URL,
  GITHUB_RELEASE_API_URL,
  GITHUB_RELEASE_PAGE_URL,
  normalizeVersionTag,
  formatVersionLabel,
  getReleaseTagCandidates,
  sanitizeText,
  extractReleaseTitleFromHtml,
  getCurrentVersionTag,
  buildReleaseDetailsUrl,
  normalizeUpdateNoticePayload,
  shouldShowUpdateNotice,
  normalizeUpdateNoticeEnabled,
  getDomIdPart,
  getUpdateNoticeDisplayCountKey,
  getUpdateNoticeDisplayCountSetting,
  normalizeUpdateNoticeDisplayCount,
  getStoredUpdateNotice,
  getStoredUpdateNoticeEnabled,
  getStoredUpdateNoticeDisplayCount,
  setStoredUpdateNotice,
  fetchReleaseTitle,
  publishUpdateNotice
};
