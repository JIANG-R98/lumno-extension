// The client functions the sync engine calls, as one object it can be given
// in place of the real client.
import { createClient } from './client';
import { normalizeConfig } from './config';
import { diagnostic, error, isWebDavError, RETRY_AFTER_MAX_MS, REVISION } from './errors';

const WEBDAV_CLIENT_API = Object.freeze({
  createClient,
  diagnostic,
  error,
  isWebDavError,
  normalizeConfig,
  RETRY_AFTER_MAX_MS,
  REVISION
});

type WebDavClientApi = typeof WEBDAV_CLIENT_API;

export { WEBDAV_CLIENT_API };
export type { WebDavClientApi };
